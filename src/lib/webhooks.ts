// R9: status changes are pushed to the merchant via signed webhooks, with automatic retries and a
// delivery log. Events are written to an outbox table in the same step as the state change; the worker
// delivers them (at-least-once — the merchant de-duplicates on event id).
import { createHmac } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { randomId } from "./ids";
import { getMerchantSettings } from "./settings";

export type WebhookEventType =
  | "payment.confirming"
  | "payment.succeeded"
  | "payment.underpaid"
  | "payment.expired"
  | "payment.exception"
  | "payment.under_review"
  | "payment.funds_available"
  | "refund.succeeded"
  | "refund.failed";

// Compressed for the demo (a production schedule would stretch over hours).
export const RETRY_SCHEDULE_MS = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000];
export const MAX_ATTEMPTS = RETRY_SCHEDULE_MS.length + 1;

export async function enqueueWebhook(
  type: WebhookEventType,
  data: Record<string, unknown> & { orderId?: string; paymentRequestId?: string },
) {
  const id = randomId("evt", 10);
  const now = Date.now();
  const payload = { id, type, created: new Date(now).toISOString(), livemode: false, data };
  await db.insert(schema.webhookEvents).values({
    id,
    type,
    orderId: data.orderId ?? null,
    paymentRequestId: data.paymentRequestId ?? null,
    payloadJson: JSON.stringify(payload),
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
  });
  return id;
}

export function signPayload(body: string, timestamp: number) {
  const secret = process.env.WEBHOOK_SECRET || "dev-secret";
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifySignature(body: string, header: string | null) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1) return false;
  return signPayload(body, t) === parts.v1;
}

async function deliver(event: typeof schema.webhookEvents.$inferSelect) {
  const { webhookUrl } = await getMerchantSettings();
  const attempt = event.attempts + 1;
  const ts = Math.floor(Date.now() / 1000);
  const started = Date.now();
  let statusCode: number | null = null;
  let error: string | null = null;
  let responseBody: string | null = null;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-id": event.id,
        "x-webhook-signature": `t=${ts},v1=${signPayload(event.payloadJson, ts)}`,
      },
      body: event.payloadJson,
      signal: AbortSignal.timeout(5000),
    });
    statusCode = res.status;
    responseBody = (await res.text()).slice(0, 500);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const ok = statusCode !== null && statusCode >= 200 && statusCode < 300;
  await db.insert(schema.webhookDeliveries).values({
    eventId: event.id,
    attempt,
    url: webhookUrl,
    statusCode,
    durationMs: Date.now() - started,
    error,
    responseBody,
    createdAt: Date.now(),
  });
  const gaveUp = !ok && attempt >= MAX_ATTEMPTS;
  await db
    .update(schema.webhookEvents)
    .set({
      attempts: attempt,
      lastStatusCode: statusCode,
      status: ok ? "delivered" : gaveUp ? "failed" : "pending",
      deliveredAt: ok ? Date.now() : null,
      nextAttemptAt: ok || gaveUp ? event.nextAttemptAt : Date.now() + RETRY_SCHEDULE_MS[attempt - 1],
    })
    .where(eq(schema.webhookEvents.id, event.id));
  return ok;
}

/** Called by the worker loop. */
export async function dispatchDueWebhooks() {
  const due = await db
    .select()
    .from(schema.webhookEvents)
    .where(and(eq(schema.webhookEvents.status, "pending"), lte(schema.webhookEvents.nextAttemptAt, Date.now())))
    .orderBy(schema.webhookEvents.createdAt)
    .limit(20);
  for (const ev of due) await deliver(ev);
  return due.length;
}

/** Manual "Resend" from the dashboard. */
export async function resendWebhook(eventId: string) {
  await db
    .update(schema.webhookEvents)
    .set({ status: "pending", nextAttemptAt: Date.now() })
    .where(eq(schema.webhookEvents.id, eventId));
}
