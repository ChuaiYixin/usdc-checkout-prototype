// State-machine tests for the payment engine. Runs fully offline: transfers are injected with
// ingestTransfer() (simulated=1, so no receipt lookups) and the "latest block" is passed in by hand.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { english, generateMnemonic } from "viem/accounts";
import { getAddress, toHex } from "viem";
import { randomBytes } from "node:crypto";

const DB_FILE = path.resolve("data/test-engine.db");
for (const f of [DB_FILE, DB_FILE + "-wal", DB_FILE + "-shm"]) if (fs.existsSync(f)) fs.rmSync(f);
process.env.DATABASE_URL = "file:" + DB_FILE;
process.env.PLATFORM_MNEMONIC = generateMnemonic(english);
process.env.APP_URL = "http://127.0.0.1:9"; // webhooks are only enqueued in these tests

type Mods = {
  db: typeof import("../src/db/client");
  engine: typeof import("../src/lib/engine");
  payments: typeof import("../src/lib/payments");
  exceptions: typeof import("../src/lib/exceptions");
  queries: typeof import("../src/lib/queries");
};
let m: Mods;

const BUYER = getAddress("0x51a1000000000000000000000000000000000b0b");
const RISKY = getAddress("0xbad0000000000000000000000000000000000001");
const BLOCK = 1_000;

before(async () => {
  const { runMigrations } = await import("../src/db/migrate");
  await runMigrations();
  const { seedIfEmpty } = await import("../src/lib/seed");
  await seedIfEmpty();
  m = {
    db: await import("../src/db/client"),
    engine: await import("../src/lib/engine"),
    payments: await import("../src/lib/payments"),
    exceptions: await import("../src/lib/exceptions"),
    queries: await import("../src/lib/queries"),
  };
});

async function newOrder(country = "US", quantity = 2) {
  return m.payments.createCheckout({ quantity, fullName: "Test Buyer", email: "t@example.com", country, shippingAddress: "x" });
}

async function pr(id: string) {
  const { db, schema } = m.db;
  const { eq } = await import("drizzle-orm");
  return (await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, id) }))!;
}

async function pay(id: string, amountOnchain: bigint, opts: { from?: string; block?: number; usdt?: boolean; ts?: number } = {}) {
  const p = await pr(id);
  return m.engine.ingestTransfer(p, {
    txHash: toHex(randomBytes(32)),
    logIndex: 0,
    blockNumber: opts.block ?? BLOCK,
    blockHash: "simulated",
    blockTimestamp: opts.ts ?? Date.now(),
    tokenAddress: opts.usdt ? getAddress("0x5170000000000000000000000000000000000057") : getAddress(p.tokenAddress),
    tokenSymbol: opts.usdt ? "USDT" : "USDC",
    kind: opts.usdt ? "non_usdc" : "usdc",
    fromAddress: opts.from ?? BUYER,
    toAddress: getAddress(p.address),
    amountOnchain: amountOnchain.toString(),
    simulated: 1,
  });
}

/** Run the engine as if the chain head were `confirmations - 1` blocks past BLOCK (or a given block). */
const tick = (confirmations: number, at = BLOCK) => m.engine.evaluate(BigInt(at + confirmations - 1));

async function exceptionsOf(id: string) {
  const { db, schema } = m.db;
  const { eq } = await import("drizzle-orm");
  return db.select().from(schema.exceptions).where(eq(schema.exceptions.paymentRequestId, id));
}

async function refundsOf(id: string) {
  const { db, schema } = m.db;
  const { eq } = await import("drizzle-orm");
  return db.select().from(schema.refunds).where(eq(schema.refunds.paymentRequestId, id));
}

async function expireNow(id: string) {
  const { db, schema } = m.db;
  const { eq } = await import("drizzle-orm");
  await db.update(schema.paymentRequests).set({ expiresAt: Date.now() - 1000 }).where(eq(schema.paymentRequests.id, id));
}

describe("checkout", () => {
  test("R1: one active payment request per order, each with its own address (R7)", async () => {
    const a = await newOrder();
    const b = await newOrder();
    const again = await m.payments.createPaymentRequest(a.orderId, 12_000, "base-sepolia");
    assert.equal(again.id, a.paymentRequestId);
    assert.notEqual((await pr(a.paymentRequestId)).address, (await pr(b.paymentRequestId)).address);
  });

  test("R16: restricted region cannot check out with USDC", async () => {
    await assert.rejects(newOrder("ID"), /not available in your region/);
  });

  test("travel rule: large orders need enhanced originator info", async () => {
    await assert.rejects(newOrder("US", 30), /travel-rule threshold/);
  });

  test("120 USD order asks for 1.20 test USDC at 1/100 scale", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    assert.equal(p.amountMicros, "120000000");
    assert.equal(p.amountOnchain, (120_000_000n / BigInt(p.divisor)).toString());
  });
});

describe("state machine", () => {
  test("exact payment: confirming → succeeded at threshold → available at finality", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    await pay(p.id, BigInt(p.amountOnchain));
    assert.equal((await pr(p.id)).status, "confirming");
    await tick(p.successThreshold - 1);
    assert.equal((await pr(p.id)).status, "confirming");
    await tick(p.successThreshold);
    let now = await pr(p.id);
    assert.equal(now.status, "succeeded");
    assert.equal(now.fundsStatus, "pending_finality");
    await tick(p.finalityThreshold);
    now = await pr(p.id);
    assert.equal(now.fundsStatus, "available");
  });

  test("with an L1-safe head, funds wait for the block to be posted to L1 (PRD decision 2)", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    await pay(p.id, BigInt(p.amountOnchain), { block: BLOCK + 50 });
    const head = BigInt(BLOCK + 50 + p.finalityThreshold * 2); // plenty of confirmations…
    await m.engine.evaluate(head, BigInt(BLOCK + 49)); // …but the block isn't L1-safe yet
    await m.engine.evaluate(head, BigInt(BLOCK + 49));
    let now = await pr(p.id);
    assert.equal(now.status, "succeeded");
    assert.equal(now.fundsStatus, "pending_finality");
    await m.engine.evaluate(head, BigInt(BLOCK + 50));
    now = await pr(p.id);
    assert.equal(now.fundsStatus, "available");
  });

  test("duplicate scan of the same log is ignored", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    const t = {
      txHash: toHex(randomBytes(32)),
      logIndex: 3,
      blockNumber: BLOCK,
      blockHash: "simulated",
      blockTimestamp: Date.now(),
      tokenAddress: getAddress(p.tokenAddress),
      tokenSymbol: "USDC",
      kind: "usdc",
      fromAddress: BUYER,
      toAddress: getAddress(p.address),
      amountOnchain: p.amountOnchain,
      simulated: 1,
    };
    assert.equal(await m.engine.ingestTransfer(p, t), true);
    assert.equal(await m.engine.ingestTransfer(await pr(p.id), t), false);
  });

  test("underpay → underpaid with remaining due → top-up → succeeded", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    const due = BigInt(p.amountOnchain);
    await pay(p.id, (due * 3n) / 4n);
    await tick(p.successThreshold);
    let now = await pr(p.id);
    assert.equal(now.status, "underpaid");
    assert.equal(now.receivedOnchain, ((due * 3n) / 4n).toString());
    assert.ok((await exceptionsOf(p.id)).some((e) => e.type === "underpaid" && e.status === "open"));
    await pay(p.id, due - (due * 3n) / 4n, { block: BLOCK + 5 });
    assert.equal((await pr(p.id)).status, "confirming");
    await tick(p.successThreshold, BLOCK + 5);
    now = await pr(p.id);
    assert.equal(now.status, "succeeded");
    assert.equal(now.receivedOnchain, due.toString());
    assert.ok((await exceptionsOf(p.id)).every((e) => e.status !== "open"));
  });

  test("underpaid and expired → exception with default 'refund in full'", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    await pay(p.id, BigInt(p.amountOnchain) / 2n);
    await tick(p.successThreshold);
    await expireNow(p.id);
    await m.engine.expire(Date.now());
    assert.equal((await pr(p.id)).status, "exception");
    const ex = (await exceptionsOf(p.id)).find((e) => e.type === "underpaid_expired")!;
    assert.equal(ex.defaultAction, "refund_full");
    await m.exceptions.applyExceptionAction(ex.id, "refund_full");
    const [r] = await refundsOf(p.id);
    assert.equal(r.amountOnchain, (BigInt(p.amountOnchain) / 2n).toString());
    assert.equal(r.method, "simulated");
  });

  test("overpay → succeeded and exactly the excess is refunded automatically", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    const due = BigInt(p.amountOnchain);
    await pay(p.id, (due * 11n) / 10n);
    await tick(p.successThreshold);
    assert.equal((await pr(p.id)).status, "succeeded");
    const rs = await refundsOf(p.id);
    assert.equal(rs.length, 1);
    assert.equal(rs[0].reason, "overpayment_excess");
    assert.equal(rs[0].amountOnchain, ((due * 11n) / 10n - due).toString());
    // re-running the engine must not create a second excess refund
    await tick(p.successThreshold + 5);
    assert.equal((await refundsOf(p.id)).length, 1);
  });

  test("merchant full refund after overpay refunds only what's left", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    const due = BigInt(p.amountOnchain);
    await pay(p.id, due + 10_000n);
    await tick(p.successThreshold);
    const refunds = await refundsOf(p.id);
    assert.equal(m.queries.refundableOnchain(await pr(p.id), refunds), due);
  });

  test("R15: payer on the screening list → under_review, funds frozen, not refundable by merchant", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    await pay(p.id, BigInt(p.amountOnchain), { from: RISKY });
    await tick(p.successThreshold);
    const now = await pr(p.id);
    assert.equal(now.status, "under_review");
    assert.equal(now.fundsStatus, "frozen");
    assert.equal(m.queries.refundableOnchain(now, []), 0n);
    const view = await m.payments.getPaymentView(p.id);
    assert.equal(view!.status, "processing"); // buyer never sees the screening result
    const ex = (await exceptionsOf(p.id)).find((e) => e.type === "screening_hit")!;
    await m.exceptions.applyExceptionAction(ex.id, "release");
    await tick(p.successThreshold + 1);
    assert.equal((await pr(p.id)).status, "succeeded");
  });

  test("R14: non-USDC token is never credited", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    await pay(p.id, 5_000_000n, { usdt: true });
    await tick(p.successThreshold);
    const now = await pr(p.id);
    assert.equal(now.status, "awaiting_payment");
    assert.equal(now.receivedOnchain, "0");
    assert.equal(now.hasNonUsdc, 1);
    assert.ok((await exceptionsOf(p.id)).some((e) => e.type === "non_usdc"));
  });

  test("R4: expired request + late payment → exception; merchant accepts → succeeded", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    await expireNow(p.id);
    await m.engine.expire(Date.now());
    assert.equal((await pr(p.id)).status, "expired");
    await pay(p.id, BigInt(p.amountOnchain), { block: BLOCK + 2 });
    assert.equal((await pr(p.id)).status, "exception");
    assert.equal((await m.payments.getPaymentView(p.id))!.status, "late_merchant_review");
    const ex = (await exceptionsOf(p.id)).find((e) => e.type === "late_payment")!;
    await m.exceptions.applyExceptionAction(ex.id, "accept_late");
    await tick(p.successThreshold, BLOCK + 2);
    assert.equal((await pr(p.id)).status, "succeeded");
  });

  test("a payment mined before expiry but seen after the expiry job still counts", async () => {
    const o = await newOrder();
    const p = await pr(o.paymentRequestId);
    const minedAt = Date.now() - 500;
    await expireNow(p.id);
    // expiry job ran with a scanner that hadn't reached the deadline yet → nothing expires
    assert.equal(await m.engine.expire(minedAt - 10_000), 0);
    await pay(p.id, BigInt(p.amountOnchain), { ts: (await pr(p.id)).expiresAt - 1 });
    await tick(p.successThreshold);
    assert.equal((await pr(p.id)).status, "succeeded");
  });
});
