// Has the app recorded this step happening since the person started the part? Read-only.
import { desc, gte } from "drizzle-orm";
import { db, schema } from "@/db/client";

export async function runChecks(since: number) {
  const { paymentRequests: prs, transfers, exceptions, refunds, settlements, orders, funnelEvents } = schema;
  const [newOrders, newRequests, newTransfers, newExceptions, newRefunds, newSettlements, newFunnel] = await Promise.all([
    db.select().from(orders).where(gte(orders.createdAt, since)),
    db.select().from(prs).where(gte(prs.createdAt, since)).orderBy(desc(prs.createdAt)),
    db.select().from(transfers).where(gte(transfers.createdAt, since)),
    db.select().from(exceptions).where(gte(exceptions.createdAt, since)),
    db.select().from(refunds).where(gte(refunds.createdAt, since)),
    db.select().from(settlements).where(gte(settlements.createdAt, since)),
    db.select().from(funnelEvents).where(gte(funnelEvents.createdAt, since)),
  ]);
  // Payment checks only look at requests created since the start, so an older order that happens to confirm or
  // reach finality now can't complete someone's steps for them.
  const requestIds = new Set(newRequests.map((r) => r.id));
  const exception = (type: string) => newExceptions.filter((e) => e.type === type);
  const latest = newRequests[0];
  return {
    checks: {
      order_created: newOrders.length > 0,
      second_order: newOrders.length > 1,
      wallet_connected: newFunnel.some((f) => f.step === "wallet_connected" || f.step === "qr_shown"),
      payment_detected: newTransfers.some((t) => t.kind === "usdc" && requestIds.has(t.paymentRequestId)),
      payment_succeeded: newRequests.some((r) => r.succeededAt),
      funds_available: newRequests.some((r) => r.availableAt),
      underpaid_seen: exception("underpaid").length > 0,
      topped_up: exception("underpaid").some((e) => e.status === "auto_resolved"),
      screening_hit: exception("screening_hit").length > 0,
      screening_handled: exception("screening_hit").some((e) => e.status !== "open"),
      refund_done: newRefunds.some((r) => r.reason === "merchant_full" && r.status === "succeeded"),
      settlement_run: newSettlements.length > 0,
    } as Record<string, boolean>,
    latest: latest ? { requestId: latest.id, orderId: latest.orderId } : null,
  };
}
