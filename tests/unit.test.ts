import { test } from "node:test";
import assert from "node:assert/strict";
import { formatUsdc, nominalToOnchain, onchainToNominal, usdCentsToMicros } from "../src/lib/money";
import { successThresholdFor, CHAINS } from "../src/config/chains";

test("money: USD cents ↔ USDC micros ↔ on-chain units", () => {
  const micros = usdCentsToMicros(12_000);
  assert.equal(micros, 120_000_000n);
  assert.equal(nominalToOnchain(micros, 100), 1_200_000n);
  assert.equal(onchainToNominal(1_200_000n, 100), micros);
  assert.equal(formatUsdc(micros), "120.00");
  assert.equal(formatUsdc(1_234_567n), "1.234567");
  assert.equal(formatUsdc(1_000_000_000_000n), "1,000,000.00");
});

test("chains: small vs large payments use different success thresholds (PRD decision 2)", () => {
  const base = CHAINS["base-sepolia"];
  assert.equal(successThresholdFor(base, 12_000), base.confirmations.successSmall);
  assert.equal(successThresholdFor(base, 100_000), base.confirmations.successLarge);
  assert.ok(base.confirmations.finality > base.confirmations.successLarge);
});

test("reconciliation: allocation always sums to the total", async () => {
  process.env.DATABASE_URL ??= "file:data/test-unit.db";
  const { allocate } = await import("../src/lib/reconciliation");
  for (const [total, weights] of [
    [39_128, [118_800_000n, 118_800_000n, 65_340_000n]],
    [1, [1n, 1n, 1n]],
    [0, [5n]],
    [10_001, [3n, 3n, 3n]],
  ] as const) {
    const parts = allocate(total, [...weights]);
    assert.equal(parts.reduce((s, p) => s + p, 0), total);
  }
});
