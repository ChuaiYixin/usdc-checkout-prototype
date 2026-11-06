// R12: three-way reconciliation — on-chain receipts ↔ FX conversion ↔ bank credit. Any mismatch is flagged.
// FX and bank legs are SIMULATED.
import { desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { fxQuote } from "./settlement";

export interface ReconRow {
  orderId: string;
  paymentRequestId: string;
  simulated: boolean;
  txHash: string | null;
  onchainGrossMicros: bigint; // what arrived on-chain (nominal), net of auto-refunded excess
  feeMicros: bigint;
  netMicros: bigint;
  fxSgdCents: number | null; // this order's share of the FX payout
  bankSgdCents: number | null; // this order's share of the bank credit
  issues: string[];
}

export interface ReconDay {
  settlement: typeof schema.settlements.$inferSelect;
  rows: ReconRow[];
  totals: { onchainNet: bigint; fxUsdcIn: bigint; fxSgd: number; bank: number };
  issues: string[];
}

/** Split `total` across weights so the parts add up exactly (largest remainder). */
export function allocate(total: number, weights: bigint[]) {
  const sum = weights.reduce((s, w) => s + w, 0n);
  if (sum === 0n) return weights.map(() => 0);
  const raw = weights.map((w) => (Number(w) / Number(sum)) * total);
  const parts = raw.map(Math.floor);
  let rest = total - parts.reduce((s, p) => s + p, 0);
  raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (rest-- > 0) parts[i]++;
    });
  return parts;
}

const sgd = (c: number) => `S$${(c / 100).toFixed(2)}`;

export async function reconcile(): Promise<ReconDay[]> {
  const settlements = await db.select().from(schema.settlements).orderBy(desc(schema.settlements.createdAt));
  if (!settlements.length) return [];
  const items = await db.select().from(schema.settlementItems).where(inArray(schema.settlementItems.settlementId, settlements.map((s) => s.id)));
  const prs = items.length ? await db.select().from(schema.paymentRequests).where(inArray(schema.paymentRequests.id, items.map((i) => i.paymentRequestId))) : [];

  return settlements.map((s) => {
    const its = items.filter((i) => i.settlementId === s.id);
    const fxIts = its.filter((i) => i.fxIncluded);
    const fxParts = allocate(s.sgdNetCents, fxIts.map((i) => BigInt(i.netMicros)));
    const bankParts = allocate(s.bankCreditCents ?? 0, fxIts.map((i) => BigInt(i.netMicros)));
    const rows: ReconRow[] = its.map((i) => {
      const pr = prs.find((p) => p.id === i.paymentRequestId)!;
      const onchain = (BigInt(pr.receivedOnchain) - BigInt(pr.excessRefundedOnchain)) * BigInt(pr.divisor);
      const k = fxIts.indexOf(i);
      const issues: string[] = [];
      if (onchain !== BigInt(i.grossMicros)) issues.push("On-chain amount differs from the amount settled");
      if (!i.fxIncluded) issues.push("Received on-chain but missing from the FX conversion");
      return {
        orderId: i.orderId,
        paymentRequestId: i.paymentRequestId,
        simulated: !!pr.simulated,
        txHash: pr.firstTxHash,
        onchainGrossMicros: onchain,
        feeMicros: BigInt(i.feeMicros),
        netMicros: BigInt(i.netMicros),
        fxSgdCents: k >= 0 ? fxParts[k] : null,
        bankSgdCents: k >= 0 ? bankParts[k] : null,
        issues,
      };
    });
    const onchainNet = rows.reduce((t, r) => t + r.netMicros, 0n);
    const fxUsdcIn = BigInt(s.usdcMicros);
    const issues: string[] = [];
    if (onchainNet !== fxUsdcIn) issues.push(`On-chain net ${(Number(onchainNet) / 1e6).toFixed(2)} USDC ≠ FX input ${(Number(fxUsdcIn) / 1e6).toFixed(2)} USDC`);
    const expectedSgd = fxQuote(fxUsdcIn).netSgdCents;
    if (expectedSgd !== s.sgdNetCents) issues.push(`FX payout ${sgd(s.sgdNetCents)} ≠ quoted ${sgd(expectedSgd)}`);
    if ((s.bankCreditCents ?? 0) !== s.sgdNetCents) {
      const d = (s.bankCreditCents ?? 0) - s.sgdNetCents;
      issues.push(`Bank credit ${sgd(s.bankCreditCents ?? 0)} ≠ FX payout ${sgd(s.sgdNetCents)} (${d > 0 ? "+" : "−"}${sgd(Math.abs(d))})`);
    }
    return { settlement: s, rows, totals: { onchainNet, fxUsdcIn, fxSgd: s.sgdNetCents, bank: s.bankCreditCents ?? 0 }, issues };
  });
}

export async function unsettled() {
  return db.select().from(schema.paymentRequests).where(inArray(schema.paymentRequests.fundsStatus, ["pending_finality", "available"]));
}

export async function reconciliationCsv() {
  const days = await reconcile();
  const lines = [
    ["settlement_id", "date_sgt", "order_id", "tx_hash", "onchain_gross_usdc", "fee_usdc", "net_usdc", "fx_rate", "fx_sgd", "bank_ref", "bank_sgd", "row_status", "row_issues", "batch_issues"].join(","),
  ];
  for (const d of days) {
    for (const r of d.rows) {
      lines.push(
        [
          d.settlement.id,
          d.settlement.date,
          r.orderId,
          r.txHash ?? "",
          (Number(r.onchainGrossMicros) / 1e6).toFixed(2),
          (Number(r.feeMicros) / 1e6).toFixed(2),
          (Number(r.netMicros) / 1e6).toFixed(2),
          d.settlement.fxRate.toFixed(4),
          r.fxSgdCents === null ? "" : (r.fxSgdCents / 100).toFixed(2),
          d.settlement.bankRef ?? "",
          r.bankSgdCents === null ? "" : (r.bankSgdCents / 100).toFixed(2),
          r.issues.length || d.issues.length ? "MISMATCH" : "MATCHED",
          `"${r.issues.join("; ")}"`,
          `"${d.issues.join("; ")}"`,
        ].join(","),
      );
    }
  }
  return lines.join("\n");
}
