// Tests for the v1.1 additions (docs/PRD-additions.md R18–R23).
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem";
import { randomBytes } from "node:crypto";
import { setup, type Harness } from "./helpers";

let h: Harness;
before(async () => {
  h = await setup("features");
});

test("R18 gasless: only an exact-amount, exact-address, well-signed authorisation is sponsored", async () => {
  const { checkGaslessAuthorization } = await import("../src/lib/gasless");
  const { TRANSFER_WITH_AUTHORIZATION_TYPES, usdcDomain } = await import("../src/lib/eip3009-types");
  const buyer = privateKeyToAccount(generatePrivateKey());
  const o = await h.newOrder();
  const pr = await h.pr(o.paymentRequestId);
  const now = Math.floor(Date.now() / 1000);
  const base = {
    from: buyer.address,
    to: pr.address as `0x${string}`,
    value: pr.amountOnchain,
    validAfter: "0",
    validBefore: String(now + 1800),
    nonce: toHex(randomBytes(32)),
  };
  const sign = (a: typeof base) =>
    buyer.signTypedData({
      domain: usdcDomain(),
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: { ...a, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore) },
    });

  assert.equal(await checkGaslessAuthorization(pr, base, await sign(base)), null);
  const less = { ...base, value: String(BigInt(base.value) - 1n) };
  assert.match((await checkGaslessAuthorization(pr, less, await sign(less)))!, /amount due/);
  const elsewhere = { ...base, to: buyer.address };
  assert.match((await checkGaslessAuthorization(pr, elsewhere, await sign(elsewhere)))!, /destination/);
  const forever = { ...base, validBefore: String(now + 86_400) };
  assert.match((await checkGaslessAuthorization(pr, forever, await sign(forever)))!, /validity/);
  // signature from someone else
  const other = privateKeyToAccount(generatePrivateKey());
  const forged = await other.signTypedData({
    domain: usdcDomain(),
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: { ...base, value: BigInt(base.value), validAfter: 0n, validBefore: BigInt(base.validBefore) },
  });
  assert.match((await checkGaslessAuthorization(pr, base, forged))!, /Signature/);
  // expired request
  assert.match((await checkGaslessAuthorization({ ...pr, expiresAt: Date.now() - 1 }, base, await sign(base)))!, /expired/);
});

test("R21 API: merchant_reference is idempotent and validation is enforced server-side", async () => {
  const { createOrder, CheckoutError } = await import("../src/lib/payments");
  const { findActiveByReference } = await import("../src/lib/api-v1");
  const { createApiKey, authenticate } = await import("../src/lib/apikeys");
  const key = await createApiKey("test");
  assert.ok(await authenticate(new Request("http://x", { headers: { authorization: `Bearer ${key}` } })));
  assert.equal(await authenticate(new Request("http://x", { headers: { authorization: "Bearer sk_test_nope" } })), null);

  const r = await createOrder({
    buyer: { fullName: "A", email: "a@example.com", country: "US" },
    items: [{ name: "x", quantity: 1, unitCents: 5000 }],
    source: "api",
    merchantReference: "REF-1",
  });
  assert.equal(await findActiveByReference("REF-1"), r.paymentRequestId);
  assert.equal(await findActiveByReference("REF-2"), null);
  await assert.rejects(
    createOrder({ buyer: { fullName: "A", email: "a@example.com", country: "ID" }, items: [{ name: "x", quantity: 1, unitCents: 5000 }], source: "api" }),
    CheckoutError,
  );
});

test("R23 exchange payer: refund goes through a verified claim to a non-exchange, screened address", async () => {
  const { createRefundClaim, submitRefundClaim } = await import("../src/lib/refund-claims");
  const o = await h.newOrder();
  const p = await h.pr(o.paymentRequestId);
  await h.pay(p.id, BigInt(p.amountOnchain), { from: "0xE8c0000000000000000000000000000000000001" });
  await h.tick(p.successThreshold);
  const paid = await h.pr(p.id);
  assert.equal(paid.status, "succeeded");
  assert.equal(paid.payerIsExchange, 1);

  const claim = await createRefundClaim(paid, BigInt(paid.amountOnchain));
  await assert.rejects(createRefundClaim(paid, BigInt(paid.amountOnchain)), /already been sent/);
  await assert.rejects(submitRefundClaim(claim.id, "000000", "0x51a1000000000000000000000000000000000c0c"), /code/);
  await assert.rejects(submitRefundClaim(claim.id, claim.otp, "0xe8c0000000000000000000000000000000000002"), /exchange/);
  await assert.rejects(submitRefundClaim(claim.id, claim.otp, "0xbad0000000000000000000000000000000000001"), /couldn't use/);
  // a rejected (screening hit) claim is closed; merchant issues a new one, buyer names a clean wallet
  const claim2 = await createRefundClaim(paid, BigInt(paid.amountOnchain));
  const refund = await submitRefundClaim(claim2.id, claim2.otp, "0x51a1000000000000000000000000000000000c0c");
  assert.equal(refund.toAddress.toLowerCase(), "0x51a1000000000000000000000000000000000c0c");
  await h.refunds.processRefunds();
  assert.equal((await h.pr(p.id)).status, "refunded");
});

test("R22 funnel: steps count once per subject, errors are kept with a reason", async () => {
  const { trackFunnel, funnelReport } = await import("../src/lib/funnel");
  await trackFunnel("cs_1", "checkout_viewed");
  await trackFunnel("cs_1", "checkout_viewed");
  await trackFunnel("pr_x", "error", { reason: "no_gas_token" });
  await trackFunnel("pr_x", "error", { reason: "no_gas_token" });
  const f = await funnelReport();
  assert.equal(f.steps.find((s) => s.step === "checkout_viewed")!.count, 1);
  assert.deepEqual(f.reasons.find(([r]) => r === "no_gas_token"), ["no_gas_token", 2]);
  const created = f.steps.find((s) => s.step === "request_created")!.count;
  assert.ok(created >= 3, "orders created in earlier tests were tracked server-side");
  // monotonic after the request step, even though test payments skip the browser steps
  for (let i = 2; i < f.steps.length; i++) assert.ok(f.steps[i].count <= f.steps[i - 1].count, `${f.steps[i].step} ≤ ${f.steps[i - 1].step}`);
  assert.ok(f.steps.find((s) => s.step === "payment_succeeded")!.count >= 1);
});

test("R20 payment link: each buyer gets their own request and address", async () => {
  const { createOrder } = await import("../src/lib/payments");
  const mk = (n: string) =>
    createOrder({ buyer: { fullName: n, email: `${n}@example.com`, country: "US" }, items: [{ name: "Deposit", quantity: 1, unitCents: 25_000 }], source: "payment_link", merchantReference: "pl_test" });
  const a = await mk("a");
  const b = await mk("b");
  const [pa, pb] = [await h.pr(a.paymentRequestId), await h.pr(b.paymentRequestId)];
  assert.notEqual(pa.address, pb.address);
  const order = await h.db.db.query.orders.findFirst({ where: eq(h.schema.orders.id, a.orderId) });
  assert.equal(order!.source, "payment_link");
});
