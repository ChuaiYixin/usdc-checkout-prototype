import { NextResponse } from "next/server";
import { CheckoutError, createCheckout } from "@/lib/payments";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await createCheckout(body);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof CheckoutError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed" }, { status: 500 });
  }
}
