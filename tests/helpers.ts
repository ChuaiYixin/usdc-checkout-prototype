// Shared offline test harness: a fresh SQLite file per test file, simulated transfers, hand-set chain head.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { english, generateMnemonic } from "viem/accounts";
import { getAddress, toHex } from "viem";
import { eq } from "drizzle-orm";

export const BUYER = getAddress("0x51a1000000000000000000000000000000000b0b");
export const OTHER = getAddress("0x51a1000000000000000000000000000000000c0c");
export const RISKY = getAddress("0xbad0000000000000000000000000000000000001");
export const BLOCK = 1_000;

export async function setup(name: string) {
  const file = path.resolve(`data/test-${name}.db`);
  for (const f of [file, file + "-wal", file + "-shm"]) if (fs.existsSync(f)) fs.rmSync(f);
  process.env.DATABASE_URL = "file:" + file;
  process.env.PLATFORM_MNEMONIC = generateMnemonic(english);
  process.env.APP_URL = "http://127.0.0.1:9";
  const { runMigrations } = await import("../src/db/migrate");
  await runMigrations();
  const { seedIfEmpty } = await import("../src/lib/seed");
  await seedIfEmpty();
  const db = await import("../src/db/client");
  const engine = await import("../src/lib/engine");
  const payments = await import("../src/lib/payments");
  const exceptions = await import("../src/lib/exceptions");
  const queries = await import("../src/lib/queries");
  const refunds = await import("../src/lib/refunds");
  const settlement = await import("../src/lib/settlement");
  const { schema } = db;

  const pr = async (id: string) => (await db.db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, id) }))!;

  return {
    db,
    engine,
    payments,
    exceptions,
    queries,
    refunds,
    settlement,
    schema,
    pr,
    newOrder: (country = "US", quantity = 2) =>
      payments.createCheckout({ quantity, fullName: "Test Buyer", email: "t@example.com", country, shippingAddress: "x" }),
    async pay(id: string, amountOnchain: bigint, opts: { from?: string; block?: number; usdt?: boolean; ts?: number } = {}) {
      const p = await pr(id);
      await engine.ingestTransfer(p, {
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
    },
    /** chain head such that a transfer in block `at` has `confirmations` confirmations */
    tick: (confirmations: number, at = BLOCK) => engine.evaluate(BigInt(at + confirmations - 1)),
    exceptionsOf: (id: string) => db.db.select().from(schema.exceptions).where(eq(schema.exceptions.paymentRequestId, id)),
    refundsOf: (id: string) => db.db.select().from(schema.refunds).where(eq(schema.refunds.paymentRequestId, id)),
    async expireNow(id: string) {
      await db.db.update(schema.paymentRequests).set({ expiresAt: Date.now() - 1000 }).where(eq(schema.paymentRequests.id, id));
    },
  };
}

export type Harness = Awaited<ReturnType<typeof setup>>;
