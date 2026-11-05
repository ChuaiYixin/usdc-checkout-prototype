import { NextResponse } from "next/server";
import { authenticate } from "@/lib/apikeys";
import { paymentRequestResource } from "@/lib/api-v1";

// GET /api/v1/payment_requests/:id — poll status (webhooks are the primary channel).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authenticate(req))) return NextResponse.json({ error: { code: "unauthorized", message: "Missing or invalid API key" } }, { status: 401 });
  const { id } = await params;
  const r = await paymentRequestResource(id);
  if (!r) return NextResponse.json({ error: { code: "not_found", message: "No such payment request" } }, { status: 404 });
  return NextResponse.json(r);
}
