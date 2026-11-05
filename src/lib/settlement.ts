// R10 settlement (SIMULATED FX + bank). Merchant chooses: convert to SGD daily (default, PRD decision 5)
// or hold USDC. R11: USDC holders can withdraw to whitelisted wallets (2-step verification, simulated).
import { desc, eq, inArray } from "drizzle-orm";
import { isAddress, getAddress } from "viem";
import { db, schema } from "@/db/client";
import { SIMULATED_FX } from "@/config/app";
import { getMerchantSettings } from "./settings";
import { logActivity } from "./activity";
import { randomId } from "./ids";

export const DEMO_2FA_CODE = "246810";

export function sgtDate(ms = Date.now()) {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function fxQuote(netMicros: bigint) {
  const usdc = Number(netMicros) / 1e6;
  const grossSgd = usdc * SIMULATED_FX.usdSgdRate;
  const feeSgd = grossSgd * (SIMULATED_FX.spreadBps / 10_000);
  return {
    rate: SIMULATED_FX.usdSgdRate,
    grossSgdCents: Math.round(grossSgd * 100),
    feeSgdCents: Math.round(feeSgd * 100),
    netSgdCents: Math.round(grossSgd * 100) - Math.round(feeSgd * 100),
  };
}

export async function availableToSettle() {
  const available = await db.select().from(schema.paymentRequests).where(eq(schema.paymentRequests.fundsStatus, "available"));
  // A merchant refund in flight means the money is going back to the buyer — never convert it as well.
  const refunding = new Set(
    (await db.select().from(schema.refunds).where(inArray(schema.refunds.status, ["queued", "submitted", "blocked"])))
      .filter((r) => r.reason === "merchant_full")
      .map((r) => r.paymentRequestId),
  );
  const prs = available.filter((p) => !refunding.has(p.id));
  const items = prs.map((p) => ({
    pr: p,
    gross: BigInt(p.amountMicros),
    fee: BigInt(p.feeMicros),
    net: BigInt(p.amountMicros) - BigInt(p.feeMicros),
  }));
  const net = items.reduce((s, i) => s + i.net, 0n);
  const withdrawn = (await db.select().from(schema.withdrawals)).reduce((s, w) => s + BigInt(w.amountMicros), 0n);
  return { items, net, withdrawn, holdable: net - withdrawn };
}

/** Runs "today's" conversion now (in production: a daily cut-off job). */
export async function runSettlement() {
  const { settlementPreference } = await getMerchantSettings();
  if (settlementPreference !== "auto_sgd") throw new Error("Settlement preference is 'hold USDC' — nothing to convert.");
  const { items, net, withdrawn } = await availableToSettle();
  if (withdrawn > 0n) throw new Error("Part of the balance was withdrawn as USDC; switch preference consistently in this demo.");
  if (!items.length) throw new Error("No available funds to settle yet (payments need to reach finality first).");
  const q = fxQuote(net);
  const now = Date.now();
  const id = `stl_${sgtDate(now).replaceAll("-", "")}_${String(now).slice(-5)}`;
  await db.insert(schema.settlements).values({
    id,
    date: sgtDate(now),
    preference: "auto_sgd",
    usdcMicros: net.toString(),
    fxRate: q.rate,
    fxFeeSgdCents: q.feeSgdCents,
    sgdNetCents: q.netSgdCents,
    bankCreditCents: q.netSgdCents, // simulated bank statement line
    bankRef: `FAST-${Math.floor(1e7 + Math.random() * 9e7)}`,
    bankCreditedAt: now + 60_000,
    status: "credited",
    createdAt: now,
  });
  await db.insert(schema.settlementItems).values(
    items.map((i) => ({
      settlementId: id,
      paymentRequestId: i.pr.id,
      orderId: i.pr.orderId,
      grossMicros: i.gross.toString(),
      feeMicros: i.fee.toString(),
      netMicros: i.net.toString(),
    })),
  );
  await db
    .update(schema.paymentRequests)
    .set({ fundsStatus: "settled", updatedAt: now })
    .where(inArray(schema.paymentRequests.id, items.map((i) => i.pr.id)));
  for (const i of items) await logActivity(i.pr.orderId, i.pr.id, "settlement", `Included in settlement ${id}: converted to SGD at ${q.rate} (simulated) and paid out`);
  return id;
}

export async function listSettlements() {
  return db.select().from(schema.settlements).orderBy(desc(schema.settlements.createdAt));
}

export async function addWhitelist(address: string, label: string, code: string) {
  if (!isAddress(address)) throw new Error("Not a valid EVM address");
  if (code !== DEMO_2FA_CODE) throw new Error("Verification code is incorrect");
  await db.insert(schema.whitelistWallets).values({ address: getAddress(address), label: label || "Treasury wallet", verifiedAt: Date.now() }).onConflictDoNothing();
}

export async function withdraw(address: string, amountMicros: bigint) {
  const wl = await db.query.whitelistWallets.findFirst({ where: eq(schema.whitelistWallets.address, getAddress(address)) });
  if (!wl) throw new Error("Address is not on the whitelist");
  const { holdable } = await availableToSettle();
  if (amountMicros <= 0n || amountMicros > holdable) throw new Error("Amount exceeds available USDC balance");
  await db.insert(schema.withdrawals).values({ id: randomId("wd", 6), toAddress: wl.address, amountMicros: amountMicros.toString(), status: "completed (simulated)", createdAt: Date.now() });
}
