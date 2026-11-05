import { NextResponse } from "next/server";
import { getPaymentView } from "@/lib/payments";

// R6: the payment page polls this every 2 s.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getPaymentView(id);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view, { headers: { "cache-control": "no-store" } });
}
