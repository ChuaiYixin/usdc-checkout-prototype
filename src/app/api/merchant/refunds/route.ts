import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createRefund, RefundError } from "@/lib/refunds";
import { refundableOnchain } from "@/lib/queries";
import { ClaimError, createRefundClaim } from "@/lib/refund-claims";

// R13: merchant-initiated full refund to the original paying address.
export async function POST(req: Request) {
  const { paymentRequestId } = await req.json();
  const pr = await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, paymentRequestId) });
  if (!pr) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  const refunds = await db.select().from(schema.refunds).where(eq(schema.refunds.paymentRequestId, pr.id));
  const amount = refundableOnchain(pr, refunds);
  if (pr.fundsStatus === "settled") return NextResponse.json({ error: "Already converted to SGD and paid out — refund via a debit on the next settlement (not in this prototype)" }, { status: 400 });
  if (amount <= 0n) return NextResponse.json({ error: "Nothing refundable on this payment" }, { status: 400 });
  if (pr.payerIsExchange) {
    // Paid from an exchange hot wallet: a refund there may never reach the buyer → verified claim link instead.
    try {
      const c = await createRefundClaim(pr, amount);
      return NextResponse.json({ claim: c.id });
    } catch (e) {
      if (e instanceof ClaimError) return NextResponse.json({ error: e.message }, { status: 409 });
      throw e;
    }
  }
  try {
    const r = await createRefund({ pr, reason: "merchant_full", kind: "full", amountOnchain: amount });
    if (r.status === "blocked") return NextResponse.json({ error: "Refund blocked: destination address failed screening. Compliance has been notified." }, { status: 409 });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof RefundError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
