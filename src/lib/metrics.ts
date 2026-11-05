// PRD 指标 section, computed from the prototype's own records. Seeded history (simulated=1 orders) is excluded
// so the numbers reflect what actually ran; simulator-injected transfers are reported separately.
import { db, schema } from "@/db/client";
import { LIVE_CHAIN } from "@/config/chains";
import { reconcile } from "./reconciliation";

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function computeMetrics() {
  const [orders, prs, transfers, exceptions] = await Promise.all([
    db.select().from(schema.orders),
    db.select().from(schema.paymentRequests),
    db.select().from(schema.transfers),
    db.select().from(schema.exceptions),
  ]);
  const seeded = new Set(orders.filter((o) => o.simulated).map((o) => o.id));
  const live = prs.filter((p) => !seeded.has(p.orderId));
  const now = Date.now();

  // Completion: of requests whose window has closed (or that completed), how many were paid in time.
  const decided = live.filter((p) => p.succeededAt || now > p.expiresAt);
  const paidInTime = decided.filter((p) => p.succeededAt && p.succeededAt <= p.expiresAt + 60_000);

  const liveTransfers = transfers.filter((t) => live.some((p) => p.id === t.paymentRequestId));
  const liveExceptions = exceptions.filter((e) => live.some((p) => p.id === e.paymentRequestId));

  // Timing metrics only from REAL on-chain payments (simulated transfers have synthetic timestamps).
  const realFirst = new Map<string, number>();
  for (const t of liveTransfers) {
    if (t.simulated || t.kind !== "usdc") continue;
    const cur = realFirst.get(t.paymentRequestId);
    if (cur === undefined || t.blockTimestamp < cur) realFirst.set(t.paymentRequestId, t.blockTimestamp);
  }
  // …and only under the current threshold configuration, so a recalibration doesn't blend old and new rules.
  const c = LIVE_CHAIN.confirmations;
  const realPrs = live.filter(
    (p) => realFirst.has(p.id) && !p.simulated && p.finalityThreshold === c.finality && [c.successSmall, c.successLarge].includes(p.successThreshold),
  );
  const toSuccess = realPrs.filter((p) => p.succeededAt).map((p) => (p.succeededAt! - realFirst.get(p.id)!) / 1000);
  const toAvailable = realPrs.filter((p) => p.availableAt).map((p) => (p.availableAt! - realFirst.get(p.id)!) / 1000);

  // Auto-match: succeeded payments that needed no human action (only auto-resolved exceptions, if any).
  const succeeded = live.filter((p) => p.succeededAt);
  const manual = new Set(liveExceptions.filter((e) => e.status !== "auto_resolved" && !["overpaid", "underpaid"].includes(e.type)).map((e) => e.paymentRequestId));
  const autoMatched = succeeded.filter((p) => !manual.has(p.id));

  const days = await reconcile();
  const rows = days.flatMap((d) => d.rows.map((r) => ({ ok: r.issues.length === 0 && d.issues.length === 0 })));

  const refundsAll = await db.select().from(schema.refunds);
  const refundsLive = refundsAll.filter((r) => live.some((p) => p.id === r.paymentRequestId));
  const refundDone = refundsLive.filter((r) => ["succeeded", "failed"].includes(r.status));

  return {
    completion: { value: decided.length ? paidInTime.length / decided.length : null, n: decided.length },
    exceptionRate: { value: liveTransfers.length ? liveExceptions.length / liveTransfers.length : null, n: liveTransfers.length, simulatedShare: liveTransfers.length ? liveTransfers.filter((t) => t.simulated).length / liveTransfers.length : 0 },
    medianToSuccess: { value: median(toSuccess), n: toSuccess.length },
    medianToAvailable: { value: median(toAvailable), n: toAvailable.length },
    autoMatch: { value: succeeded.length ? autoMatched.length / succeeded.length : null, n: succeeded.length },
    autoReconciliation: { value: rows.length ? rows.filter((r) => r.ok).length / rows.length : null, n: rows.length },
    refundFailure: { value: refundDone.length ? refundDone.filter((r) => r.status === "failed").length / refundDone.length : null, n: refundDone.length },
  };
}
