import { NextResponse } from "next/server";
import { updateMerchantSettings, type MerchantSettings } from "@/lib/settings";

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<MerchantSettings>;
  const patch: Partial<MerchantSettings> = {};
  if (body.settlementPreference === "auto_sgd" || body.settlementPreference === "hold_usdc") patch.settlementPreference = body.settlementPreference;
  if (typeof body.mockEndpointFailing === "boolean") patch.mockEndpointFailing = body.mockEndpointFailing;
  return NextResponse.json(await updateMerchantSettings(patch));
}
