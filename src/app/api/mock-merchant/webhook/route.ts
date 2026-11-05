import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { verifySignature } from "@/lib/webhooks";
import { getMerchantSettings } from "@/lib/settings";

// A stand-in for the merchant's own server. Verifies the HMAC signature, records what it received and can
// pretend to be down (toggle on /merchant/webhooks) so retries are visible.
export async function POST(req: Request) {
  const body = await req.text();
  const valid = verifySignature(body, req.headers.get("x-webhook-signature"));
  const { mockEndpointFailing } = await getMerchantSettings();
  const status = !valid ? 401 : mockEndpointFailing ? 503 : 200;
  let parsed: { id?: string; type?: string } = {};
  try {
    parsed = JSON.parse(body);
  } catch {}
  await db.insert(schema.mockMerchantInbox).values({
    eventId: parsed.id ?? "unknown",
    type: parsed.type ?? "unknown",
    signatureValid: valid ? 1 : 0,
    respondedWith: status,
    body,
    receivedAt: Date.now(),
  });
  if (status !== 200) return NextResponse.json({ error: status === 401 ? "bad signature" : "service unavailable (simulated outage)" }, { status });
  return NextResponse.json({ received: true });
}
