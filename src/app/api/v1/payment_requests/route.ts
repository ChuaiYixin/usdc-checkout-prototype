import { NextResponse } from "next/server";
import { authenticate } from "@/lib/apikeys";
import { CheckoutError, createOrder } from "@/lib/payments";
import { findActiveByReference, paymentRequestResource } from "@/lib/api-v1";

const err = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/**
 * POST /api/v1/payment_requests — create a USDC payment request for one of the merchant's own orders.
 * Body: { amount: "120.00", currency: "USD", merchant_reference, description?, customer: { name, email, country,
 *         residential_address?, date_of_birth? } }
 */
export async function POST(req: Request) {
  if (!(await authenticate(req))) return err(401, "unauthorized", "Missing or invalid API key (Authorization: Bearer sk_test_…)");
  let b: {
    amount?: string;
    currency?: string;
    merchant_reference?: string;
    description?: string;
    customer?: { name?: string; email?: string; country?: string; residential_address?: string; date_of_birth?: string };
  };
  try {
    b = await req.json();
  } catch {
    return err(400, "invalid_json", "Body must be JSON");
  }
  if ((b.currency ?? "USD") !== "USD") return err(400, "unsupported_currency", "Only USD-priced orders are supported in v1 (settled in USDC)");
  const cents = Math.round(Number(b.amount) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return err(400, "invalid_amount", "amount must be a positive decimal string, e.g. \"120.00\"");
  if (!b.merchant_reference) return err(400, "missing_reference", "merchant_reference is required (your order id) — it also makes the call idempotent");

  const existing = await findActiveByReference(b.merchant_reference);
  if (existing) return NextResponse.json(await paymentRequestResource(existing), { status: 200, headers: { "idempotent-replayed": "true" } });

  try {
    const { paymentRequestId } = await createOrder({
      buyer: {
        fullName: b.customer?.name ?? "",
        email: b.customer?.email ?? "",
        country: (b.customer?.country ?? "").toUpperCase(),
        residentialAddress: b.customer?.residential_address,
        dateOfBirth: b.customer?.date_of_birth,
      },
      items: [{ name: b.description || `Order ${b.merchant_reference}`, quantity: 1, unitCents: cents }],
      source: "api",
      merchantReference: b.merchant_reference,
    });
    return NextResponse.json(await paymentRequestResource(paymentRequestId), { status: 201 });
  } catch (e) {
    if (e instanceof CheckoutError) return err(422, "validation_failed", e.message);
    throw e;
  }
}
