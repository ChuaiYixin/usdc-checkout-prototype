import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { randomId } from "@/lib/ids";

// No-code payment links: a merchant without developers shares a link (Instagram, WhatsApp, invoice email).
export async function POST(req: Request) {
  const b = await req.json();
  if (b.action === "toggle") {
    const link = await db.query.paymentLinks.findFirst({ where: eq(schema.paymentLinks.id, b.id) });
    if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await db.update(schema.paymentLinks).set({ active: link.active ? 0 : 1 }).where(eq(schema.paymentLinks.id, b.id));
    return NextResponse.json({ ok: true });
  }
  const cents = Math.round(Number(b.amount) * 100);
  if (!String(b.title ?? "").trim()) return NextResponse.json({ error: "Give the link a title" }, { status: 400 });
  if (!Number.isFinite(cents) || cents < 100) return NextResponse.json({ error: "Amount must be at least $1.00" }, { status: 400 });
  const id = randomId("pl", 6);
  await db.insert(schema.paymentLinks).values({ id, title: String(b.title).trim().slice(0, 80), amountCents: cents, createdAt: Date.now() });
  return NextResponse.json({ id, message: `Created /l/${id}` });
}
