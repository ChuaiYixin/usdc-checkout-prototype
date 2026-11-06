// R14 / R15 exception queue actions. Each exception type has a default handling rule (PRD 异常与边界情况);
// ops (or the merchant, for late payments) apply it with one click.
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createRefund } from "./refunds";
import { logActivity } from "./activity";

export type ExceptionAction = "refund_full" | "accept_late" | "return_token" | "release" | "keep_frozen";

export const ACTIONS_BY_TYPE: Record<string, { action: ExceptionAction; label: string; primary?: boolean; confirm?: string }[]> = {
  underpaid: [],
  underpaid_expired: [{ action: "refund_full", label: "Refund amount received", primary: true }],
  late_payment: [
    { action: "accept_late", label: "Accept & fulfil order", primary: true },
    { action: "refund_full", label: "Refund in full" },
  ],
  non_usdc: [{ action: "return_token", label: "Return token to sender", primary: true }],
  screening_hit: [
    { action: "keep_frozen", label: "Keep frozen & file report", primary: true },
    { action: "release", label: "Release (false positive)", confirm: "Release these funds to the merchant? Only do this after a documented review." },
  ],
  overpaid: [],
};

export async function applyExceptionAction(id: number, action: ExceptionAction) {
  const ex = await db.query.exceptions.findFirst({ where: eq(schema.exceptions.id, id) });
  if (!ex || ex.status !== "open") throw new Error("Exception not found or already resolved");
  const allowed = ACTIONS_BY_TYPE[ex.type]?.some((a) => a.action === action);
  if (!allowed) throw new Error(`Action ${action} not allowed for ${ex.type}`);
  // Idempotency: one refund per exception. A failed one is retried from the refund, not re-created.
  const prior = await db.select().from(schema.refunds).where(eq(schema.refunds.exceptionId, id));
  if (prior.some((r) => r.status !== "failed")) throw new Error("A refund for this exception already exists");
  if (prior.length) throw new Error("The refund for this exception failed — use Retry on the refund instead");

  const pr = (await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, ex.paymentRequestId) }))!;
  const transfers = await db.select().from(schema.transfers).where(eq(schema.transfers.paymentRequestId, pr.id));
  const transfer = transfers.find((t) => t.id === ex.transferId);
  const now = Date.now();
  const resolve = (resolution: string) =>
    db.update(schema.exceptions).set({ status: "resolved", resolution, resolvedAt: now }).where(eq(schema.exceptions.id, id));

  switch (action) {
    case "refund_full": {
      if (ex.type === "late_payment") {
        // Refund exactly the late transfer this exception is about, back to whoever sent it.
        if (!transfer || transfer.acceptedLate || transfer.status === "reorged") throw new Error("This late transfer is no longer refundable");
        const r = await createRefund({ pr, reason: "late_payment", kind: "full", amountOnchain: BigInt(transfer.amountOnchain), exceptionId: id, toAddress: transfer.fromAddress });
        if (r.status === "blocked") throw new Error("Refund blocked: destination failed screening");
        return;
      }
      // underpaid_expired: return what arrived in time (late transfers have their own exceptions)
      if (pr.status !== "exception") throw new Error(`Payment is ${pr.status} — nothing to refund here`);
      const inTime = transfers.filter((t) => t.kind === "usdc" && t.status === "confirmed" && (!t.late || t.acceptedLate));
      const amount = inTime.reduce((s, t) => s + BigInt(t.amountOnchain), 0n);
      const r = await createRefund({ pr, reason: "underpaid_expired", kind: "full", amountOnchain: amount, exceptionId: id, toAddress: inTime[0]?.fromAddress });
      if (r.status === "blocked") throw new Error("Refund blocked: destination failed screening");
      return; // the exception closes when the refund lands (refunds.ts)
    }
    case "accept_late": {
      if (!["exception", "expired"].includes(pr.status)) throw new Error(`Can't accept a late payment on a ${pr.status} order`);
      await db
        .update(schema.transfers)
        .set({ acceptedLate: 1 })
        .where(and(eq(schema.transfers.paymentRequestId, pr.id), eq(schema.transfers.late, 1)));
      await db.update(schema.paymentRequests).set({ status: "confirming", updatedAt: now }).where(eq(schema.paymentRequests.id, pr.id));
      // every late transfer on this request is now accepted, so all their exceptions are settled at once
      await db
        .update(schema.exceptions)
        .set({ status: "resolved", resolution: "Merchant accepted the late payment", resolvedAt: now })
        .where(and(eq(schema.exceptions.paymentRequestId, pr.id), eq(schema.exceptions.type, "late_payment"), eq(schema.exceptions.status, "open")));
      await logActivity(pr.orderId, pr.id, "exception.accept_late", "Merchant accepted the late payment — re-evaluating amount");
      return;
    }
    case "return_token": {
      if (!transfer) throw new Error("Original transfer not found");
      await createRefund({
        pr,
        reason: "non_usdc_return",
        kind: "full",
        amountOnchain: BigInt(transfer.amountOnchain),
        exceptionId: id,
        tokenAddress: transfer.tokenAddress,
        tokenSymbol: transfer.tokenSymbol,
        toAddress: transfer.fromAddress,
        simulated: !!transfer.simulated,
      });
      return;
    }
    case "release": {
      if (pr.status === "succeeded") {
        // a flagged *extra* transfer on an already-paid order: clear it; the engine then refunds it as excess
        await db.update(schema.paymentRequests).set({ screeningCleared: 1, updatedAt: now }).where(eq(schema.paymentRequests.id, pr.id));
      } else {
        await db
          .update(schema.paymentRequests)
          .set({ screeningCleared: 1, status: "confirming", fundsStatus: "none", updatedAt: now })
          .where(eq(schema.paymentRequests.id, pr.id));
      }
      await resolve("Released by compliance after review (false positive)");
      await logActivity(pr.orderId, pr.id, "screening.released", "Compliance released the payment after review");
      return;
    }
    case "keep_frozen": {
      await resolve("Kept frozen; suspicious transaction report filed");
      await logActivity(pr.orderId, pr.id, "screening.reported", "Compliance kept funds frozen and filed a report");
      return;
    }
  }
}
