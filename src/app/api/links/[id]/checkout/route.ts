import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { CheckoutError, createOrder } from "@/lib/payments";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const link = await db.query.paymentLinks.findFirst({ where: eq(schema.paymentLinks.id, id) });
  if (!link || !link.active) return NextResponse.json({ error: "This payment link is no longer active" }, { status: 404 });
  const b = await req.json();
  try {
    const r = await createOrder({
      buyer: b,
      items: [{ name: link.title, quantity: 1, unitCents: link.amountCents }],
      source: "payment_link",
      merchantReference: link.id,
    });
    await db.update(schema.paymentLinks).set({ uses: sql`${schema.paymentLinks.uses} + 1` }).where(eq(schema.paymentLinks.id, id));
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof CheckoutError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
