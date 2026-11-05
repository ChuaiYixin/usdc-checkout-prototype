// Checkout conversion funnel (PRD 指标: 付款完成率 needs to be decomposed to be actionable).
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

export const FUNNEL_STEPS = [
  { step: "checkout_viewed", label: "Viewed checkout" },
  { step: "request_created", label: "Chose USDC → payment request" },
  { step: "pay_page_viewed", label: "Opened payment page" },
  { step: "wallet_connected", label: "Connected a wallet (or opened QR)" },
  { step: "tx_submitted", label: "Signed / sent the payment" },
  { step: "payment_detected", label: "Payment seen on-chain" },
  { step: "payment_succeeded", label: "Payment successful" },
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number]["step"] | "qr_shown" | "error";

/** Records a step once per subject. "error" rows are always recorded (meta.reason says why). */
export async function trackFunnel(subject: string, step: FunnelStep, meta?: Record<string, unknown>) {
  if (step !== "error") {
    const seen = await db.query.funnelEvents.findFirst({ where: and(eq(schema.funnelEvents.subject, subject), eq(schema.funnelEvents.step, step)) });
    if (seen) return;
  }
  await db.insert(schema.funnelEvents).values({ subject, step, meta: meta ? JSON.stringify(meta) : null, createdAt: Date.now() });
}

export async function funnelReport() {
  const rows = await db.select().from(schema.funnelEvents);
  // Top of funnel is per browser session (before an order exists); everything after is the cohort of payment
  // requests. A request that reached a later step counts for every earlier step too ("reached at least"), so
  // payments created via the API or scripts — which skip the browser steps — don't break monotonicity.
  const order = FUNNEL_STEPS.map((s) => s.step as string);
  const rank = (step: string) => (step === "qr_shown" ? order.indexOf("wallet_connected") : order.indexOf(step));
  const furthest = new Map<string, number>();
  for (const r of rows) {
    const k = rank(r.step);
    if (k < 1) continue; // checkout_viewed (sessions) and errors handled separately
    furthest.set(r.subject, Math.max(furthest.get(r.subject) ?? -1, k));
  }
  const sessions = new Set(rows.filter((r) => r.step === "checkout_viewed").map((r) => r.subject)).size;
  const steps = FUNNEL_STEPS.map((s, i) => ({
    ...s,
    count: i === 0 ? sessions : [...furthest.values()].filter((k) => k >= i).length,
  }));
  const reasons = new Map<string, number>();
  for (const r of rows.filter((x) => x.step === "error")) {
    const reason = (r.meta ? (JSON.parse(r.meta).reason as string) : null) ?? "unknown";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const modes = new Map<string, number>();
  for (const r of rows.filter((x) => x.step === "tx_submitted")) {
    const mode = (r.meta ? (JSON.parse(r.meta).mode as string) : null) ?? "wallet";
    modes.set(mode, (modes.get(mode) ?? 0) + 1);
  }
  return { steps, reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]), modes: [...modes.entries()] };
}
