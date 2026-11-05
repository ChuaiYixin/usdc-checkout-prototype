// Refunds for buyers who paid from an exchange (PRD 开放问题 #1, docs/PRD-additions.md G5).
// Sending a refund to an exchange hot wallet usually never reaches the buyer, so instead the buyer gets a claim
// link (to the email on the order), proves they own that email with a one-time code, and names a refund address
// they control. The new address is screened before anything is sent. Everything else stays "original address only".
import { randomInt } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
import { db, schema } from "@/db/client";
import { randomId } from "./ids";
import { logActivity } from "./activity";
import { screenAddress } from "./compliance";
import { createRefund } from "./refunds";

type PR = typeof schema.paymentRequests.$inferSelect;

export class ClaimError extends Error {}

export async function createRefundClaim(pr: PR, amountOnchain: bigint) {
  const open = await db.query.refundClaims.findFirst({
    where: and(eq(schema.refundClaims.paymentRequestId, pr.id), inArray(schema.refundClaims.status, ["sent", "submitted"])),
  });
  if (open) throw new ClaimError("A refund claim has already been sent to the buyer");
  const order = (await db.query.orders.findFirst({ where: eq(schema.orders.id, pr.orderId) }))!;
  const now = Date.now();
  const claim = {
    id: randomId("rc", 12),
    paymentRequestId: pr.id,
    orderId: pr.orderId,
    amountOnchain: amountOnchain.toString(),
    email: order.customerEmail,
    otp: String(randomInt(100000, 999999)),
    status: "sent",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.refundClaims).values(claim);
  await logActivity(pr.orderId, pr.id, "refund.claim_sent", `Payer is an exchange wallet — refund claim link emailed to ${order.customerEmail} (simulated): /refund-claim/${claim.id}`);
  return claim;
}

export async function submitRefundClaim(id: string, otp: string, address: string) {
  const claim = await db.query.refundClaims.findFirst({ where: eq(schema.refundClaims.id, id) });
  if (!claim || claim.status !== "sent") throw new ClaimError("This refund link is no longer valid");
  if (Date.now() - claim.createdAt > 7 * 24 * 3600 * 1000) throw new ClaimError("This refund link has expired — contact the merchant");
  if (otp.trim() !== claim.otp) throw new ClaimError("The code doesn't match the one we emailed you");
  if (!isAddress(address)) throw new ClaimError("Enter a valid wallet address (0x…)");
  const to = getAddress(address);
  const labelled = await db.query.addressLabels.findFirst({ where: eq(schema.addressLabels.address, to.toLowerCase()) });
  if (labelled?.kind === "exchange") throw new ClaimError("That looks like another exchange deposit address — please use a wallet you control");
  const s = await screenAddress(to);
  const now = Date.now();
  if (s.hit) {
    await db.update(schema.refundClaims).set({ status: "rejected", newAddress: to, screeningResult: `HIT: ${s.label}`, updatedAt: now }).where(eq(schema.refundClaims.id, id));
    await logActivity(claim.orderId, claim.paymentRequestId, "refund.claim_rejected", `Refund claim address ${to} failed screening — sent to compliance`);
    throw new ClaimError("We couldn't use this address. Our team will contact you.");
  }
  const pr = (await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, claim.paymentRequestId) }))!;
  const refund = await createRefund({ pr, reason: "merchant_full", kind: "full", amountOnchain: BigInt(claim.amountOnchain), toAddress: to });
  await db
    .update(schema.refundClaims)
    .set({ status: "approved", newAddress: to, screeningResult: `clear (${s.provider})`, refundId: refund.id, updatedAt: now })
    .where(eq(schema.refundClaims.id, id));
  await logActivity(claim.orderId, claim.paymentRequestId, "refund.claim_approved", `Buyer verified email and named refund address ${to}; screening clear — refund queued`);
  return refund;
}
