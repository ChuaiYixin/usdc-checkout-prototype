import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { verifyMessage, isAddress } from "viem";
import { db, schema } from "@/db/client";
import { logActivity } from "@/lib/activity";
import { ownershipMessage } from "@/lib/ownership";

// Self-hosted wallet: prove the buyer controls the paying wallet (PRD 合规与风控 — enhanced due diligence).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { address, signature } = await req.json();
  if (!isAddress(address)) return NextResponse.json({ error: "Bad address" }, { status: 400 });
  const pr = await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, id) });
  if (!pr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await verifyMessage({ address, message: ownershipMessage(id, address), signature });
  if (!ok) return NextResponse.json({ error: "Signature does not match wallet" }, { status: 400 });
  await db.update(schema.paymentRequests).set({ walletVerifiedAddress: address, updatedAt: Date.now() }).where(eq(schema.paymentRequests.id, id));
  await logActivity(pr.orderId, id, "wallet.verified", `Buyer proved control of ${address} (EIP-191 signature)`);
  return NextResponse.json({ ok: true });
}
