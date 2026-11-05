import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { formatUsdc } from "@/lib/money";
import { MERCHANT } from "@/config/app";
import { ClaimForm } from "./ClaimForm";

export const dynamic = "force-dynamic";

// Buyer-facing refund claim (link "emailed" to the address on the order — simulated).
export default async function RefundClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claim = await db.query.refundClaims.findFirst({ where: eq(schema.refundClaims.id, id) });
  if (!claim) notFound();
  const pr = (await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, claim.paymentRequestId) }))!;
  const masked = claim.email.replace(/^(.).*(@.*)$/, "$1•••$2");
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md space-y-4">
        <div className="card p-6">
          <p className="text-sm text-slate-500">{MERCHANT.name} · order {claim.orderId}</p>
          <h1 className="mt-1 text-xl font-bold">Claim your refund</h1>
          <p className="mt-2 text-3xl font-bold tabular-nums">{formatUsdc(BigInt(claim.amountOnchain) * BigInt(pr.divisor))} USDC</p>
          <p className="mt-3 text-sm text-slate-600">
            Your payment came from an exchange account, so sending the refund back to that address might never reach you. Confirm the code we
            emailed to <b>{masked}</b> and tell us a wallet address <b>you control</b> on Base.
          </p>
          {claim.status === "sent" ? (
            <ClaimForm id={claim.id} demoOtp={claim.otp} />
          ) : (
            <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
              {claim.status === "approved" ? `Refund sent to ${claim.newAddress}. You'll get a confirmation email.` : "This refund link can no longer be used. The merchant's support team will contact you."}
            </p>
          )}
        </div>
        <p className="text-center text-xs text-slate-500">This prototype connects to testnets only and does not process real funds.</p>
      </div>
    </div>
  );
}
