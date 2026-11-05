// Read models for the merchant dashboard.
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";

export async function listOrders(limit = 200) {
  const orders = await db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)).limit(limit);
  if (!orders.length) return [];
  const prs = await db
    .select()
    .from(schema.paymentRequests)
    .where(inArray(schema.paymentRequests.orderId, orders.map((o) => o.id)))
    .orderBy(desc(schema.paymentRequests.createdAt));
  const byOrder = new Map<string, (typeof prs)[number]>();
  for (const p of prs) if (!byOrder.has(p.orderId)) byOrder.set(p.orderId, p);
  return orders.map((o) => ({ order: o, pr: byOrder.get(o.id) ?? null }));
}

export async function getOrderDetail(orderId: string) {
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order) return null;
  const prs = await db.select().from(schema.paymentRequests).where(eq(schema.paymentRequests.orderId, orderId)).orderBy(desc(schema.paymentRequests.createdAt));
  const pr = prs[0] ?? null;
  const prIds = prs.map((p) => p.id);
  const [transfers, refunds, exceptions, events, activity, settlementItems] = await Promise.all([
    prIds.length ? db.select().from(schema.transfers).where(inArray(schema.transfers.paymentRequestId, prIds)).orderBy(desc(schema.transfers.blockNumber)) : [],
    prIds.length ? db.select().from(schema.refunds).where(inArray(schema.refunds.paymentRequestId, prIds)).orderBy(desc(schema.refunds.createdAt)) : [],
    db.select().from(schema.exceptions).where(eq(schema.exceptions.orderId, orderId)).orderBy(desc(schema.exceptions.createdAt)),
    db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.orderId, orderId)).orderBy(desc(schema.webhookEvents.createdAt)),
    db.select().from(schema.activity).where(eq(schema.activity.orderId, orderId)).orderBy(desc(schema.activity.id)),
    db.select().from(schema.settlementItems).where(eq(schema.settlementItems.orderId, orderId)),
  ]);
  return { order, pr, transfers, refunds, exceptions, events, activity, settlementItems };
}

/** What a merchant can still refund on a payment (on-chain units). */
export function refundableOnchain(pr: typeof schema.paymentRequests.$inferSelect, refunds: { reason: string; status: string; amountOnchain: string }[]) {
  // Settled = already converted to SGD and paid out; refunding it needs a debit on the next payout, which
  // this prototype doesn't model — so it's blocked rather than silently paying twice.
  if (pr.status !== "succeeded" || ["refunded", "frozen", "settled"].includes(pr.fundsStatus)) return 0n;
  if (refunds.some((r) => r.reason === "merchant_full" && r.status !== "failed")) return 0n;
  return BigInt(pr.receivedOnchain) - BigInt(pr.excessRefundedOnchain);
}

export async function balances() {
  const prs = await db.select().from(schema.paymentRequests);
  const sum = (status: string) =>
    prs
      .filter((p) => p.fundsStatus === status)
      .reduce((s, p) => s + BigInt(p.amountMicros) - BigInt(p.feeMicros), 0n);
  return {
    pendingFinality: sum("pending_finality"),
    available: sum("available"),
    frozen: prs.filter((p) => p.fundsStatus === "frozen").reduce((s, p) => s + BigInt(p.receivedOnchain) * BigInt(p.divisor), 0n),
    settled: sum("settled"),
  };
}
