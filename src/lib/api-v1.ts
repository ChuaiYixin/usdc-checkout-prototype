// Public merchant API (v1) representation of a payment request.
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getPaymentView } from "./payments";

export async function paymentRequestResource(id: string) {
  const v = await getPaymentView(id);
  if (!v) return null;
  const order = (await db.query.orders.findFirst({ where: eq(schema.orders.id, v.orderId) }))!;
  const pr = (await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, id) }))!;
  return {
    object: "payment_request",
    id: v.id,
    order_id: v.orderId,
    merchant_reference: order.merchantReference,
    status: pr.status, // merchant-facing (unlike the buyer view, which hides screening)
    funds_status: pr.fundsStatus,
    amount: { value: (Number(v.amountMicros) / 1e6).toFixed(2), currency: "USDC" },
    received: { value: (Number(v.receivedMicros) / 1e6).toFixed(2), currency: "USDC" },
    chain: v.chainKey,
    deposit_address: v.address,
    expires_at: new Date(v.expiresAt).toISOString(),
    pay_url: `${process.env.APP_URL || "http://localhost:3000"}/pay/${v.id}`,
    tx_hashes: v.txHashes.map((t) => t.hash),
    livemode: false,
  };
}

/** R1 + idempotency: the same merchant_reference returns the existing active request instead of a new one. */
export async function findActiveByReference(ref: string) {
  const order = await db.query.orders.findFirst({
    where: and(eq(schema.orders.merchantReference, ref), eq(schema.orders.source, "api")),
    orderBy: desc(schema.orders.createdAt),
  });
  if (!order) return null;
  const pr = await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.orderId, order.id), orderBy: desc(schema.paymentRequests.createdAt) });
  if (!pr || ["expired", "refunded"].includes(pr.status)) return null;
  return pr.id;
}
