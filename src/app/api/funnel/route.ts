import { NextResponse } from "next/server";
import { trackFunnel, type FunnelStep } from "@/lib/funnel";

const CLIENT_STEPS = new Set<FunnelStep>(["checkout_viewed", "pay_page_viewed", "wallet_connected", "qr_shown", "tx_submitted", "error"]);

// Browser-side funnel beacons. Server-side steps (request created, detected, succeeded) are recorded by the backend.
export async function POST(req: Request) {
  const { subject, step, meta } = (await req.json()) as { subject?: string; step?: FunnelStep; meta?: Record<string, unknown> };
  if (!subject || !step || !CLIENT_STEPS.has(step) || subject.length > 64) return NextResponse.json({ error: "bad event" }, { status: 400 });
  await trackFunnel(subject, step, meta);
  return NextResponse.json({ ok: true });
}
