import { NextResponse } from "next/server";
import { createApiKey, revokeApiKey } from "@/lib/apikeys";

export async function POST(req: Request) {
  const b = await req.json();
  if (b.action === "revoke") {
    await revokeApiKey(b.id);
    return NextResponse.json({ ok: true });
  }
  const key = await createApiKey(String(b.label ?? ""));
  // shown once; only the hash is stored
  return NextResponse.json({ key, message: `New test key (copy it now — it won't be shown again): ${key}` });
}
