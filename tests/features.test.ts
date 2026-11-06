// Tests for the additions beyond the original PRD (docs/PRD-additions.md) and the homepage's main flow.
import { before, test } from "node:test";
import assert from "node:assert/strict";
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

test("R19 funnel: steps count once per subject, errors are kept with a reason", async () => {
  const { trackFunnel, funnelReport } = await import("../src/lib/funnel");
  await trackFunnel("cs_1", "checkout_viewed");
  await trackFunnel("cs_1", "checkout_viewed");
  await trackFunnel("pr_x", "error", { reason: "no_gas_token" });
  await trackFunnel("pr_x", "error", { reason: "no_gas_token" });
  const f = await funnelReport();
  assert.equal(f.steps.find((s) => s.step === "checkout_viewed")!.count, 1);
  assert.deepEqual(f.reasons.find(([r]) => r === "no_gas_token"), ["no_gas_token", 2]);
  // monotonic after the request step, even though test payments skip the browser steps
  const o = await h.newOrder();
  const p = await h.pr(o.paymentRequestId);
  await h.pay(p.id, BigInt(p.amountOnchain));
  await h.tick(p.successThreshold);
  const g = await funnelReport();
  for (let i = 2; i < g.steps.length; i++) assert.ok(g.steps[i].count <= g.steps[i - 1].count, `${g.steps[i].step} ≤ ${g.steps[i - 1].step}`);
  assert.ok(g.steps.find((s) => s.step === "payment_succeeded")!.count >= 1);
});

test("main flow: every check exists, and only counts what happened after the part started", async () => {
  const { PARTS } = await import("../src/guide/parts");
  const { runChecks } = await import("../src/guide/checks");
  const { checks: keys, latest: none } = await runChecks(Date.now());
  assert.equal(none, null);
  for (const part of PARTS) {
    for (const s of part.steps) {
      if (typeof s.until === "object" && "check" in s.until) assert.ok(s.until.check in keys, `${part.id}: unknown check ${s.until.check}`);
      assert.ok(s.stage < part.stages.length, `${part.id}: stage out of range`);
    }
    // Stages only move forward, and every stage has a step.
    const stages = part.steps.map((s) => s.stage);
    assert.deepEqual(stages, [...stages].sort((a, b) => a - b));
    assert.equal(new Set(stages).size, part.stages.length);
  }

  // an order from before the start doesn't count, even if its payment arrives afterwards
  const older = await h.newOrder();
  const olderPr = await h.pr(older.paymentRequestId);
  await new Promise((r) => setTimeout(r, 5));
  const since = Date.now();
  await h.pay(olderPr.id, BigInt(olderPr.amountOnchain));
  await h.tick(olderPr.successThreshold);
  let c = (await runChecks(since)).checks;
  assert.equal(c.order_created, false);
  assert.equal(c.payment_detected, false);
  assert.equal(c.payment_succeeded, false);

  // underpay → top-up, end to end, and the newest order is what the step links open
  const o = await h.newOrder();
  const p = await h.pr(o.paymentRequestId);
  const seen = await runChecks(since);
  assert.equal(seen.checks.order_created, true);
  assert.deepEqual(seen.latest, { requestId: o.paymentRequestId, orderId: o.orderId });
  const due = BigInt(p.amountOnchain);
  await h.pay(p.id, (due * 3n) / 4n);
  await h.tick(p.successThreshold);
  c = (await runChecks(since)).checks;
  assert.equal(c.underpaid_seen, true);
  assert.equal(c.topped_up, false);
  await h.pay(p.id, due - (due * 3n) / 4n);
  await h.tick(p.successThreshold);
  c = (await runChecks(since)).checks;
  assert.equal(c.topped_up, true);
  assert.equal(c.payment_succeeded, true);
});

test("simulator: expire-now closes the window and the worker's expiry then applies", async () => {
  const { expireNow } = await import("../src/lib/simulator");
  const o = await h.newOrder();
  await expireNow(o.paymentRequestId);
  await h.engine.expire(Date.now());
  assert.equal((await h.pr(o.paymentRequestId)).status, "expired");
  await assert.rejects(expireNow(o.paymentRequestId), /open request/);
});
