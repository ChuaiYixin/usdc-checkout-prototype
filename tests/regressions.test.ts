// Regression tests for issues found in the independent code review (see docs/overnight-log.md).
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { BLOCK, OTHER, RISKY, setup, type Harness } from "./helpers";

let h: Harness;
before(async () => {
  h = await setup("regressions");
});

test("late transfer during an underpaid request doesn't hijack it; each part is refunded once", async () => {
  const o = await h.newOrder();
  const p = await h.pr(o.paymentRequestId);
  const half = BigInt(p.amountOnchain) / 2n;
  await h.pay(p.id, half);
  await h.tick(p.successThreshold);
  assert.equal((await h.pr(p.id)).status, "underpaid");
  // top-up mined after the deadline, seen before the expiry job ran
  await h.pay(p.id, half, { block: BLOCK + 2, ts: p.expiresAt + 1000 });
  assert.equal((await h.pr(p.id)).status, "underpaid", "in-time payment keeps its lifecycle");
  await h.expireNow(p.id);
  await h.engine.expire(Date.now());
  assert.equal((await h.pr(p.id)).status, "exception");
  const exs = await h.exceptionsOf(p.id);
  const under = exs.find((e) => e.type === "underpaid_expired")!;
  const late = exs.find((e) => e.type === "late_payment")!;
  assert.ok(under && late);

  await h.exceptions.applyExceptionAction(under.id, "refund_full");
  await assert.rejects(h.exceptions.applyExceptionAction(under.id, "refund_full"), /already exists/);
  await h.exceptions.applyExceptionAction(late.id, "refund_full");
  const rs = await h.refundsOf(p.id);
  assert.deepEqual(rs.map((r) => r.amountOnchain).sort(), [half.toString(), half.toString()]);

  await h.refunds.processRefunds();
  const after = await h.pr(p.id);
  assert.equal(after.status, "refunded", "closed only once both parts are back");
  assert.ok((await h.exceptionsOf(p.id)).every((e) => e.status !== "open"));
});

test("only failed refunds can be retried", async () => {
  const o = await h.newOrder();
  const p = await h.pr(o.paymentRequestId);
  await h.pay(p.id, BigInt(p.amountOnchain));
  await h.tick(p.successThreshold);
  const r = await h.refunds.createRefund({ pr: await h.pr(p.id), reason: "merchant_full", kind: "full", amountOnchain: BigInt(p.amountOnchain) });
  await assert.rejects(h.refunds.retryRefund(r.id), /Only failed refunds/);
  await h.refunds.processRefunds();
  await assert.rejects(h.refunds.retryRefund(r.id), /Only failed refunds/);
});

test("accepting a late payment resolves every late exception on the request", async () => {
  const o = await h.newOrder();
  const p = await h.pr(o.paymentRequestId);
  await h.expireNow(p.id);
  await h.engine.expire(Date.now());
  const half = BigInt(p.amountOnchain) / 2n;
  await h.pay(p.id, half, { block: BLOCK + 1 });
  await h.pay(p.id, half, { block: BLOCK + 2 });
  const lates = (await h.exceptionsOf(p.id)).filter((e) => e.type === "late_payment");
  assert.equal(lates.length, 2);
  await h.exceptions.applyExceptionAction(lates[0].id, "accept_late");
  assert.ok((await h.exceptionsOf(p.id)).every((e) => e.status !== "open"));
  await h.tick(p.successThreshold, BLOCK + 2);
  assert.equal((await h.pr(p.id)).status, "succeeded");
  await assert.rejects(h.exceptions.applyExceptionAction(lates[1].id, "refund_full"), /already resolved/);
});

test("money arriving on a refunded order goes to the exception queue", async () => {
  const o = await h.newOrder();
  const p = await h.pr(o.paymentRequestId);
  await h.pay(p.id, BigInt(p.amountOnchain));
  await h.tick(p.successThreshold);
  await h.refunds.createRefund({ pr: await h.pr(p.id), reason: "merchant_full", kind: "full", amountOnchain: BigInt(p.amountOnchain) });
  await h.refunds.processRefunds();
  assert.equal((await h.pr(p.id)).status, "refunded");
  await h.pay(p.id, BigInt(p.amountOnchain), { block: BLOCK + 3 });
  const late = (await h.exceptionsOf(p.id)).find((e) => e.type === "late_payment");
  assert.ok(late && late.status === "open");
  assert.equal((await h.pr(p.id)).status, "refunded");
});

test("extra payment after success: flagged sender is held, clean sender gets their own money back", async () => {
  const o = await h.newOrder();
  const p = await h.pr(o.paymentRequestId);
  const due = BigInt(p.amountOnchain);
  await h.pay(p.id, due);
  await h.tick(p.successThreshold);
  assert.equal((await h.pr(p.id)).status, "succeeded");

  await h.pay(p.id, 50_000n, { from: RISKY, block: BLOCK + 2 });
  await h.tick(p.successThreshold, BLOCK + 2);
  assert.ok((await h.exceptionsOf(p.id)).some((e) => e.type === "screening_hit" && e.status === "open"));
  assert.equal((await h.refundsOf(p.id)).length, 0, "flagged money is never auto-refunded");
  // ticking again must not duplicate the exception
  await h.tick(p.successThreshold + 1, BLOCK + 2);
  assert.equal((await h.exceptionsOf(p.id)).filter((e) => e.type === "screening_hit").length, 1);

  await h.pay(p.id, 70_000n, { from: OTHER, block: BLOCK + 4 });
  await h.tick(p.successThreshold, BLOCK + 4);
  const [r] = await h.refundsOf(p.id);
  assert.equal(r.amountOnchain, "70000");
  assert.equal(r.toAddress, OTHER);
});

test("overpaid exception stays open until the excess refund actually lands", async () => {
  const o = await h.newOrder();
  const p = await h.pr(o.paymentRequestId);
  await h.pay(p.id, BigInt(p.amountOnchain) + 10_000n);
  await h.tick(p.successThreshold);
  const ex = (await h.exceptionsOf(p.id)).find((e) => e.type === "overpaid")!;
  assert.equal(ex.status, "open");
  await h.refunds.processRefunds();
  assert.equal((await h.exceptionsOf(p.id)).find((e) => e.type === "overpaid")!.status, "resolved");
});

test("settlement skips payments being refunded; settled payments can't be refunded directly", async () => {
  const a = await h.newOrder();
  const b = await h.newOrder();
  for (const id of [a.paymentRequestId, b.paymentRequestId]) {
    const p = await h.pr(id);
    await h.pay(id, BigInt(p.amountOnchain), { block: BLOCK + 10 });
    await h.tick(p.finalityThreshold, BLOCK + 10); // confirms → succeeded
    await h.tick(p.finalityThreshold, BLOCK + 10); // finality → available
    assert.equal((await h.pr(id)).fundsStatus, "available");
  }
  const pa = await h.pr(a.paymentRequestId);
  await h.refunds.createRefund({ pr: pa, reason: "merchant_full", kind: "full", amountOnchain: BigInt(pa.amountOnchain) });
  const { items } = await h.settlement.availableToSettle();
  assert.ok(!items.some((i) => i.pr.id === pa.id));
  assert.ok(items.some((i) => i.pr.id === b.paymentRequestId));

  await h.db.db.update(h.schema.paymentRequests).set({ fundsStatus: "settled" }).where(eq(h.schema.paymentRequests.id, b.paymentRequestId));
  assert.equal(h.queries.refundableOnchain(await h.pr(b.paymentRequestId), []), 0n);
});
