import { NextResponse } from "next/server";
import { RefundError, retryRefund } from "@/lib/refunds";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await retryRefund(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RefundError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
