import { NextResponse } from "next/server";
import { ClaimError, submitRefundClaim } from "@/lib/refund-claims";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { otp, address } = await req.json();
  try {
    await submitRefundClaim(id, String(otp ?? ""), String(address ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ClaimError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
