import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { simulateTransfer } from "@/lib/simulator";
import { logActivity } from "@/lib/activity";
import { trackFunnel } from "@/lib/funnel";
import { isRegionRestricted } from "@/lib/compliance";
import { SIMULATED_ONRAMP } from "@/config/app";

// SIMULATED card on-ramp (docs/PRD-additions.md G3). The partner charges the buyer's card, buys USDC and
// delivers it to this request's deposit address; from there the normal pipeline takes over.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pr = await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, id) });
  if (!pr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["awaiting_payment", "underpaid"].includes(pr.status) || Date.now() > pr.expiresAt) {
    return NextResponse.json({ error: "This payment request is not accepting payments" }, { status: 409 });
  }
  const order = (await db.query.orders.findFirst({ where: eq(schema.orders.id, pr.orderId) }))!;
  if (await isRegionRestricted(order.country)) return NextResponse.json({ error: "Not available in your region" }, { status: 403 });
  try {
    const r = await simulateTransfer(pr.id, "onramp");
    await logActivity(pr.orderId, pr.id, "payment.onramp", `${SIMULATED_ONRAMP.partnerLabel}: buyer paid by card; partner delivered USDC to the deposit address [simulated]`);
    await trackFunnel(pr.id, "tx_submitted", { mode: "onramp" });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
