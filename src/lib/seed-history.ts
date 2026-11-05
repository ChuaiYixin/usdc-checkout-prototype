// SIMULATED history for the last three days, so the reconciliation page has something to reconcile —
// including two deliberate breaks that should show up red:
//   D-2: the bank credited S$0.85 less than the FX batch paid out (e.g. an unexpected inward fee)
//   D-1: one on-chain payment was left out of the FX batch
// Every row here is flagged simulated=1 and shown with a "Simulated" tag.
import { toHex } from "viem";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/db/client";
import { PLATFORM_FEE_BPS, PRODUCTS, SHIPPING_CENTS } from "@/config/app";
import { LIVE_CHAIN } from "@/config/chains";
import { usdCentsToMicros } from "./money";
import { fxQuote, sgtDate } from "./settlement";

const BUYERS = [
  ["Avery Johnson", "US"],
  ["Mia Thompson", "US"],
  ["Noah Garcia", "US"],
  ["Olivia Chen", "CA"],
  ["Ethan Walker", "US"],
  ["Sophie Martin", "GB"],
  ["Liam Patel", "AU"],
  ["Emma Davis", "US"],
  ["Lucas Kim", "US"],
] as const;

const DAY = 24 * 3600 * 1000;

export async function seedHistory() {
  const now = Date.now();
  const product = PRODUCTS[0];
  let b = 0;
  const plan = [
    { daysAgo: 3, qtys: [2, 1, 3], bankDelta: 0, dropFxIndex: -1 },
    { daysAgo: 2, qtys: [2, 2, 1], bankDelta: -85, dropFxIndex: -1 },
    { daysAgo: 1, qtys: [1, 2, 4], bankDelta: 0, dropFxIndex: 1 },
  ];
  for (const day of plan) {
    const base = now - day.daysAgo * DAY;
    const items: { prId: string; orderId: string; gross: bigint; fee: bigint; net: bigint; fx: boolean }[] = [];
    for (let i = 0; i < day.qtys.length; i++) {
      const [name, country] = BUYERS[b++ % BUYERS.length];
      const qty = day.qtys[i];
      const total = product.priceCents * qty + SHIPPING_CENTS;
      const at = base - (6 - i * 2) * 3600 * 1000;
      const orderId = `ORD-${String(20000 + b * 137).slice(0, 5)}`;
      const prId = `pr_sim${b.toString().padStart(4, "0")}`;
      const gross = usdCentsToMicros(total);
      const fee = (gross * BigInt(PLATFORM_FEE_BPS)) / 10_000n;
      const tx = toHex(randomBytes(32));
      const payer = toHex(randomBytes(20));
      await db.insert(schema.orders).values({
        id: orderId,
        createdAt: at,
        customerName: name,
        customerEmail: `${name.split(" ")[0].toLowerCase()}@example.com`,
        country,
        shippingAddress: "Simulated address",
        itemsJson: JSON.stringify([{ productId: product.id, name: product.name, quantity: qty, unitCents: product.priceCents }]),
        subtotalCents: product.priceCents * qty,
        shippingCents: SHIPPING_CENTS,
        totalCents: total,
        status: "paid",
        travelRuleTier: "basic",
        travelRuleJson: JSON.stringify({ originatorName: name, originatorCountry: country }),
        simulated: 1,
      });
      await db.insert(schema.paymentRequests).values({
        id: prId,
        orderId,
        chainKey: LIVE_CHAIN.key,
        address: toHex(randomBytes(20)),
        derivationIndex: -1,
        tokenAddress: LIVE_CHAIN.usdcAddress!,
        amountMicros: gross.toString(),
        amountOnchain: gross.toString(),
        divisor: 1,
        expiresAt: at + 15 * 60 * 1000,
        status: "succeeded",
        fundsStatus: "settled",
        receivedOnchain: gross.toString(),
        payerAddress: payer,
        firstTxHash: tx,
        confirmations: 999,
        successThreshold: LIVE_CHAIN.confirmations.successSmall,
        finalityThreshold: LIVE_CHAIN.confirmations.finality,
        feeMicros: fee.toString(),
        succeededAt: at + 20_000,
        availableAt: at + 40_000,
        createdAt: at,
        updatedAt: at,
        simulated: 1,
      });
      await db.insert(schema.transfers).values({
        chainKey: LIVE_CHAIN.key,
        txHash: tx,
        logIndex: 0,
        blockNumber: 0,
        blockHash: "simulated",
        blockTimestamp: at + 5_000,
        tokenAddress: LIVE_CHAIN.usdcAddress!,
        tokenSymbol: "USDC",
        kind: "usdc",
        fromAddress: payer,
        toAddress: payer,
        amountOnchain: gross.toString(),
        paymentRequestId: prId,
        status: "confirmed",
        confirmations: 999,
        simulated: 1,
        createdAt: at,
      });
      items.push({ prId, orderId, gross, fee, net: gross - fee, fx: i !== day.dropFxIndex });
    }
    const netIn = items.filter((i) => i.fx).reduce((s, i) => s + i.net, 0n);
    const q = fxQuote(netIn);
    const cutoff = base + 3 * 3600 * 1000;
    const id = `stl_${sgtDate(cutoff).replaceAll("-", "")}_sim`;
    await db.insert(schema.settlements).values({
      id,
      date: sgtDate(cutoff),
      preference: "auto_sgd",
      usdcMicros: netIn.toString(),
      fxRate: q.rate,
      fxFeeSgdCents: q.feeSgdCents,
      sgdNetCents: q.netSgdCents,
      bankCreditCents: q.netSgdCents + day.bankDelta,
      bankRef: `FAST-${Math.floor(1e7 + Math.random() * 9e7)}`,
      bankCreditedAt: cutoff + 2 * 3600 * 1000,
      status: "credited",
      createdAt: cutoff,
    });
    await db.insert(schema.settlementItems).values(
      items.map((i) => ({
        settlementId: id,
        paymentRequestId: i.prId,
        orderId: i.orderId,
        grossMicros: i.gross.toString(),
        feeMicros: i.fee.toString(),
        netMicros: i.net.toString(),
        fxIncluded: i.fx ? 1 : 0,
      })),
    );
  }
}
