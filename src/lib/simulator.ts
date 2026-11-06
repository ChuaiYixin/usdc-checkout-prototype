// Payment simulator (ops tool). Injects a SIMULATED transfer into the same pipeline the real scanner uses,
// so edge cases (under/over/late/non-USDC/screening hit) can be demoed without spending faucet USDC.
// Simulated rows are flagged everywhere and are never sent to a block explorer or refunded on-chain.
import { eq } from "drizzle-orm";
import { getAddress, toHex } from "viem";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/db/client";
import { ingestTransfer } from "./engine";
import { getSetting } from "./settings";
import { DEMO_RISK_ADDRESSES } from "./seed";

export const SIM_BUYER = "0x51a1000000000000000000000000000000000b0b";
const SIM_USDT = "0x5170000000000000000000000000000000000057";

export type Scenario = "exact" | "underpay" | "overpay" | "topup" | "non_usdc" | "risk_payer" | "late";

export const SCENARIOS: { key: Scenario; label: string; hint: string }[] = [
  { key: "exact", label: "Exact payment", hint: "Pays the full amount → confirming → succeeded" },
  { key: "underpay", label: "Underpay (−25%)", hint: "Buyer page shows 'still due', one-click top-up" },
  { key: "topup", label: "Top up remainder", hint: "Pays whatever is still due on an underpaid request" },
  { key: "overpay", label: "Overpay (+10%)", hint: "Order completes; the excess is refunded automatically" },
  { key: "non_usdc", label: "Send USDT instead", hint: "Not credited; goes to exception queue for manual return" },
  { key: "risk_payer", label: "Payer on risk list", hint: "Funds frozen, buyer sees 'processing' only" },
  { key: "late", label: "Pay after expiry", hint: "Only for expired requests; merchant accepts or refunds" },
];

export async function simulateTransfer(paymentRequestId: string, scenario: Scenario) {
  const pr = await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, paymentRequestId) });
  if (!pr) throw new Error("Payment request not found");
  const hb = await getSetting("worker:heartbeat");
  if (!hb) throw new Error("Worker hasn't reported a block yet — is `npm run dev` running?");
  const { block } = JSON.parse(hb) as { block: string };

  const due = BigInt(pr.amountOnchain);
  const received = BigInt(pr.receivedOnchain);
  let amount = due;
  let from = SIM_BUYER;
  let token = pr.tokenAddress;
  let symbol = "USDC";
  let kind = "usdc";

  switch (scenario) {
    case "underpay":
      amount = (due * 75n) / 100n;
      break;
    case "topup":
      if (received >= due) throw new Error("Nothing outstanding to top up");
      amount = due - received;
      break;
    case "overpay":
      amount = (due * 110n) / 100n;
      break;
    case "non_usdc":
      token = SIM_USDT;
      symbol = "USDT";
      kind = "non_usdc";
      break;
    case "risk_payer":
      from = DEMO_RISK_ADDRESSES[0].address;
      break;
    case "late":
      if (Date.now() <= pr.expiresAt) throw new Error("This request hasn't expired yet — expire it first, then send the late payment");
      break;
  }

  const ok = await ingestTransfer(pr, {
    txHash: toHex(randomBytes(32)),
    logIndex: 0,
    blockNumber: Number(block),
    blockHash: "simulated",
    blockTimestamp: Date.now(),
    tokenAddress: getAddress(token),
    tokenSymbol: symbol,
    kind,
    fromAddress: getAddress(from),
    toAddress: getAddress(pr.address),
    amountOnchain: amount.toString(),
    simulated: 1,
  });
  // Mark the request as containing simulated funds: no explorer links, refunds are simulated too.
  await db.update(schema.paymentRequests).set({ simulated: 1 }).where(eq(schema.paymentRequests.id, pr.id));
  return { ok, amountOnchain: amount.toString() };
}

/** Closes a request's 15-minute window now, so the expiry paths can be demonstrated without waiting. */
export async function expireNow(paymentRequestId: string) {
  const pr = await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, paymentRequestId) });
  if (!pr) throw new Error("Payment request not found");
  if (!["awaiting_payment", "underpaid"].includes(pr.status)) throw new Error("Only an open request can be expired");
  await db.update(schema.paymentRequests).set({ expiresAt: Date.now() - 1000, updatedAt: Date.now() }).where(eq(schema.paymentRequests.id, pr.id));
}
