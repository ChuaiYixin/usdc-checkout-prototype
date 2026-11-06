import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAddress } from "viem";
import { db, schema } from "@/db/client";
import { screenAddress } from "@/lib/compliance";

// Compliance team controls (R15 screening list, R16 region list). Prototype: no auth.
export async function POST(req: Request) {
  const b = await req.json();
  const now = Date.now();
  switch (b.action) {
    case "add_risk":
      if (!isAddress(b.address)) return NextResponse.json({ error: "Not a valid EVM address" }, { status: 400 });
      await db
        .insert(schema.riskAddresses)
        .values({ address: b.address.toLowerCase(), label: b.label || "Added by compliance", addedAt: now })
        .onConflictDoNothing();
      return NextResponse.json({ ok: true });
    case "remove_risk":
      await db.delete(schema.riskAddresses).where(eq(schema.riskAddresses.address, String(b.address).toLowerCase()));
      return NextResponse.json({ ok: true });
    case "add_region":
      if (!/^[A-Z]{2}$/.test(b.code)) return NextResponse.json({ error: "Use a 2-letter country code" }, { status: 400 });
      await db.insert(schema.restrictedRegions).values({ code: b.code, reason: b.reason || "Restricted by compliance", addedAt: now }).onConflictDoNothing();
      return NextResponse.json({ ok: true });
    case "remove_region":
      await db.delete(schema.restrictedRegions).where(eq(schema.restrictedRegions.code, b.code));
      return NextResponse.json({ ok: true });
    case "screen": {
      if (!isAddress(b.address)) return NextResponse.json({ error: "Not a valid EVM address" }, { status: 400 });
      const s = await screenAddress(b.address);
      return NextResponse.json({ ok: true, message: s.hit ? `HIT — ${s.label}` : `Clear — no match in ${s.provider}` });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
