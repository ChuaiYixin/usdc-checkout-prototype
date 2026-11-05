// Checkout -> order + payment request (R1, R4, R7) and the buyer-facing payment view (R6).
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { CHAINS, LIVE_CHAIN, successThresholdFor, type ChainKey } from "@/config/chains";
import {
  MERCHANT,
  PAYMENT_REQUEST_TTL_MS,
  PLATFORM_FEE_BPS,
  PRODUCTS,
  SHIPPING_CENTS,
  TESTNET_AMOUNT_DIVISOR,
} from "@/config/app";
import { nominalToOnchain, onchainToNominal, usdCentsToMicros } from "./money";
import { deriveAddress } from "./hd";
import { nextDerivationIndex } from "./settings";
import { orderId as newOrderId, randomId } from "./ids";
import { isRegionRestricted, travelRuleTier, type TravelRuleTier } from "./compliance";
import { logActivity } from "./activity";
import { trackFunnel } from "./funnel";

export interface CheckoutInput {
  quantity: number;
  fullName: string;
  email: string;
  country: string;
  shippingAddress: string;
  // enhanced travel-rule tier only
  residentialAddress?: string;
  dateOfBirth?: string;
}

export class CheckoutError extends Error {}

export interface BuyerInfo {
  fullName: string;
  email: string;
  country: string;
  shippingAddress?: string;
  // enhanced travel-rule tier only
  residentialAddress?: string;
  dateOfBirth?: string;
}

/** Store checkout: fixed product × quantity + shipping. */
export async function createCheckout(input: CheckoutInput) {
  const product = PRODUCTS[0];
  const quantity = Math.min(50, Math.max(1, Math.floor(input.quantity || 1)));
  if (!input.shippingAddress?.trim()) throw new CheckoutError("Please fill in name, email, country and shipping address.");
  return createOrder({
    buyer: input,
    items: [{ name: product.name, quantity, unitCents: product.priceCents, productId: product.id }],
    shippingCents: SHIPPING_CENTS,
    source: "store",
  });
}

/**
 * Shared by the store checkout, payment links and the merchant API: validates the buyer (R16 region, travel-rule
 * tier), creates the order and its payment request.
 */
export async function createOrder(opts: {
  buyer: BuyerInfo;
  items: { name: string; quantity: number; unitCents: number; productId?: string }[];
  shippingCents?: number;
  source: "store" | "payment_link" | "api";
  merchantReference?: string;
}) {
  const b = opts.buyer;
  const subtotal = opts.items.reduce((s, i) => s + i.unitCents * i.quantity, 0);
  const shipping = opts.shippingCents ?? 0;
  const total = subtotal + shipping;
  if (total < 100 || total > 10_000_000) throw new CheckoutError("Amount must be between $1 and $100,000.");
  if (!b?.fullName?.trim() || !b.email?.trim() || !b.country) throw new CheckoutError("Please fill in name, email and country.");

  // R16 — enforced server-side as well, not only by hiding the button.
  if (await isRegionRestricted(b.country)) throw new CheckoutError("USDC payment is not available in your region.");

  // Travel rule: tier by amount (threshold configurable; S$1,500 per MAS Notice PSN02).
  const tier: TravelRuleTier = travelRuleTier(total);
  const travelRule: Record<string, string> = {
    originatorName: b.fullName.trim(),
    originatorCountry: b.country,
    originatorEmail: b.email.trim(),
  };
  if (tier === "enhanced") {
    if (!b.residentialAddress?.trim() || !b.dateOfBirth?.trim()) {
      throw new CheckoutError("Orders above the travel-rule threshold need residential address and date of birth.");
    }
    travelRule.originatorAddress = b.residentialAddress.trim();
    travelRule.originatorDateOfBirth = b.dateOfBirth.trim();
  }

  const now = Date.now();
  const oid = newOrderId();
  await db.insert(schema.orders).values({
    id: oid,
    createdAt: now,
    customerName: b.fullName.trim(),
    customerEmail: b.email.trim(),
    country: b.country,
    shippingAddress: b.shippingAddress?.trim() || "—",
    itemsJson: JSON.stringify(opts.items),
    subtotalCents: subtotal,
    shippingCents: shipping,
    totalCents: total,
    status: "awaiting_payment",
    source: opts.source,
    merchantReference: opts.merchantReference ?? null,
    travelRuleTier: tier,
    travelRuleJson: JSON.stringify(travelRule),
  });

  const pr = await createPaymentRequest(oid, total, LIVE_CHAIN.key);
  const what = opts.items.map((i) => `${i.quantity} × ${i.name}`).join(", ");
  await logActivity(oid, null, "order.created", `Order placed by ${b.fullName.trim()} (${b.country}) via ${opts.source.replace("_", " ")}: ${what}`);
  return { orderId: oid, paymentRequestId: pr.id };
}
/** R1: one order has at most one *active* payment request. */
export async function createPaymentRequest(orderId: string, totalCents: number, chainKey: ChainKey) {
  const active = await db.query.paymentRequests.findFirst({
    where: and(
      eq(schema.paymentRequests.orderId, orderId),
      inArray(schema.paymentRequests.status, ["awaiting_payment", "confirming", "underpaid"]),
    ),
  });
  if (active) return active;

  const chain = CHAINS[chainKey];
  if (chain.availability !== "live" || !chain.usdcAddress) throw new CheckoutError(`${chain.name} is not available.`);

  const now = Date.now();
  const index = await nextDerivationIndex();
  const amountMicros = usdCentsToMicros(totalCents); // USD-priced, 1 USD = 1 USDC (PRD decision 3)
  const fee = (amountMicros * BigInt(PLATFORM_FEE_BPS)) / 10_000n;
  const row = {
    id: randomId("pr", 8),
    orderId,
    chainKey,
    address: deriveAddress(index),
    derivationIndex: index,
    tokenAddress: chain.usdcAddress,
    amountMicros: amountMicros.toString(),
    amountOnchain: nominalToOnchain(amountMicros, TESTNET_AMOUNT_DIVISOR).toString(),
    divisor: TESTNET_AMOUNT_DIVISOR,
    expiresAt: now + PAYMENT_REQUEST_TTL_MS,
    status: "awaiting_payment",
    fundsStatus: "none",
    successThreshold: successThresholdFor(chain, totalCents),
    finalityThreshold: chain.confirmations.finality,
    feeMicros: fee.toString(),
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.paymentRequests).values(row);
  await logActivity(orderId, row.id, "payment_request.created", `Payment request created on ${chain.name}; deposit address ${row.address} (HD index ${index}); expires in 15 min`);
  await trackFunnel(row.id, "request_created");
  return (await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, row.id) }))!;
}

// ---------------------------------------------------------------------------------------------
// Buyer-facing view. Deliberately hides compliance details: an address-screening hit is shown to the
// buyer only as "processing" (PRD: 不揭示筛查结果).

export type BuyerStatus =
  | "awaiting_payment"
  | "confirming"
  | "underpaid"
  | "succeeded"
  | "processing"
  | "expired"
  | "expired_refund"
  | "late_merchant_review"
  | "refunded";

export async function getPaymentView(id: string) {
  const pr = await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, id) });
  if (!pr) return null;
  const order = (await db.query.orders.findFirst({ where: eq(schema.orders.id, pr.orderId) }))!;
  const txs = await db
    .select()
    .from(schema.transfers)
    .where(eq(schema.transfers.paymentRequestId, pr.id))
    .orderBy(desc(schema.transfers.blockNumber));
  const openExceptions = await db
    .select()
    .from(schema.exceptions)
    .where(and(eq(schema.exceptions.paymentRequestId, pr.id), eq(schema.exceptions.status, "open")));
  const refunds = await db.select().from(schema.refunds).where(eq(schema.refunds.paymentRequestId, pr.id));

  let status: BuyerStatus;
  switch (pr.status) {
    case "under_review":
      status = "processing";
      break;
    case "exception":
      status = openExceptions.some((e) => e.type === "late_payment") ? "late_merchant_review" : "expired_refund";
      break;
    default:
      status = pr.status as BuyerStatus;
  }

  const expected = BigInt(pr.amountOnchain);
  const received = BigInt(pr.receivedOnchain);
  const usdcTxs = txs.filter((t) => t.kind === "usdc" && t.status !== "reorged");
  const pendingTx = usdcTxs.find((t) => t.status === "seen");
  const excess = received > expected ? received - expected : 0n;
  const chain = CHAINS[pr.chainKey as ChainKey];

  return {
    id: pr.id,
    orderId: pr.orderId,
    merchant: MERCHANT.name,
    status,
    chainKey: pr.chainKey,
    chainName: chain.name,
    chainId: chain.evmChainId,
    tokenAddress: pr.tokenAddress,
    address: pr.address,
    divisor: pr.divisor,
    amountMicros: pr.amountMicros,
    amountOnchain: pr.amountOnchain,
    receivedOnchain: pr.receivedOnchain,
    receivedMicros: onchainToNominal(received, pr.divisor).toString(),
    remainingOnchain: (expected > received ? expected - received : 0n).toString(),
    excessOnchain: excess.toString(),
    expiresAt: pr.expiresAt,
    createdAt: pr.createdAt,
    confirmations: pendingTx ? pendingTx.confirmations : pr.confirmations,
    successThreshold: pr.successThreshold,
    blockTimeSec: chain.blockTimeSec,
    txHashes: usdcTxs.map((t) => ({ hash: t.txHash, simulated: !!t.simulated, confirmations: t.confirmations })),
    hasNonUsdc: !!pr.hasNonUsdc,
    walletVerified: !!pr.walletVerifiedAddress,
    travelRuleTier: order.travelRuleTier as TravelRuleTier,
    order: {
      totalCents: order.totalCents,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      items: JSON.parse(order.itemsJson) as { name: string; quantity: number; unitCents: number }[],
      customerName: order.customerName,
    },
    refunds: refunds.map((r) => ({ reason: r.reason, status: r.status, amountOnchain: r.amountOnchain, txHash: r.txHash })),
    serverTime: Date.now(),
  };
}

export type PaymentView = NonNullable<Awaited<ReturnType<typeof getPaymentView>>>;
