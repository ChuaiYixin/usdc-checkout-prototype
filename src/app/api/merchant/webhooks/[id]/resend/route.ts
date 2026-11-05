import { NextResponse } from "next/server";
import { resendWebhook } from "@/lib/webhooks";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await resendWebhook(id);
  return NextResponse.json({ ok: true });
}
