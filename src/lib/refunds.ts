// R13 refunds — always to the ORIGINAL paying address (PRD decision 4), re-screened first.
//
// Execution (worker):
//   USDC      -> EIP-3009 transferWithAuthorization: the deposit address signs off-chain, the gas sponsor
//                submits the tx and pays gas. Deposit addresses never need ETH.
//   other ERC-20 (returning a non-USDC token) -> the sponsor tops up a little ETH, then the deposit address
//                sends the token back itself.
//   simulated transfers -> marked as refunded without touching the chain.
import { and, eq, inArray } from "drizzle-orm";
import { getAddress, toHex } from "viem";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/db/client";
import { erc20Abi, publicClient, walletClient } from "./chain";
import { submitAuthorization } from "./eip3009";
import { TRANSFER_WITH_AUTHORIZATION_TYPES, usdcDomain, type Authorization } from "./eip3009-types";
import { deriveAccount, gasSponsor } from "./hd";
import { screenAddress } from "./compliance";
import { logActivity } from "./activity";
import { enqueueWebhook } from "./webhooks";
import { randomId } from "./ids";
import { formatUsdc } from "./money";

type PR = typeof schema.paymentRequests.$inferSelect;
type Refund = typeof schema.refunds.$inferSelect;

export type RefundReason = "merchant_full" | "overpayment_excess" | "underpaid_expired" | "late_payment" | "non_usdc_return";

export class RefundError extends Error {}

export async function createRefund(opts: {
  pr: PR;
  reason: RefundReason;
  kind: "full" | "partial";
  amountOnchain: bigint;
  exceptionId?: number;
  tokenAddress?: string;
  tokenSymbol?: string;
  toAddress?: string;
  simulated?: boolean;
}) {
  const { pr } = opts;
  const transfers = await db.select().from(schema.transfers).where(eq(schema.transfers.paymentRequestId, pr.id));
  const payer = opts.toAddress ?? pr.payerAddress ?? transfers.find((t) => t.kind === "usdc")?.fromAddress;
  if (!payer) throw new RefundError("No original payer address on record.");
  if (opts.amountOnchain <= 0n) throw new RefundError("Nothing to refund.");

  const token = opts.tokenAddress ?? pr.tokenAddress;
  const isUsdc = token.toLowerCase() === pr.tokenAddress.toLowerCase();
  // Simulated only if every transfer of this token was simulated; a real/simulated mix is refunded on-chain
  // (the deposit-address balance check stops it from paying out more than really arrived).
  const sameToken = transfers.filter((t) => t.tokenAddress.toLowerCase() === token.toLowerCase() && t.status !== "reorged");
  const simulated = opts.simulated ?? (sameToken.length > 0 && sameToken.every((t) => t.simulated));

  // Re-screen the destination before any funds move.
  const s = await screenAddress(payer);
  const now = Date.now();
  const refund = {
    id: randomId("rf", 8),
    paymentRequestId: pr.id,
    orderId: pr.orderId,
    exceptionId: opts.exceptionId ?? null,
    reason: opts.reason,
    kind: opts.kind,
    tokenAddress: getAddress(token),
    tokenSymbol: opts.tokenSymbol ?? (isUsdc ? "USDC" : "TOKEN"),
    toAddress: getAddress(payer),
    amountOnchain: opts.amountOnchain.toString(),
    method: simulated ? "simulated" : isUsdc ? "eip3009" : "gas_topup",
    status: s.hit ? "blocked" : "queued",
    screeningResult: s.hit ? `HIT: ${s.label}` : `clear (${s.provider})`,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.refunds).values(refund);
  const amt = isUsdc ? `${formatUsdc(opts.amountOnchain * BigInt(pr.divisor))} USDC` : `${formatUsdc(opts.amountOnchain)} ${refund.tokenSymbol}`;
  await logActivity(
    pr.orderId,
    pr.id,
    s.hit ? "refund.blocked" : "refund.created",
    s.hit
      ? `Refund of ${amt} to ${payer} BLOCKED — destination matched "${s.label}"; needs compliance review`
      : `Refund of ${amt} to original address ${payer} queued (${refund.method}); destination screening clear`,
  );
  return refund;
}

async function update(id: string, patch: Partial<Refund>) {
  await db.update(schema.refunds).set({ ...patch, updatedAt: Date.now() }).where(eq(schema.refunds.id, id));
}

async function submitEip3009(r: Refund, pr: PR) {
  const from = deriveAccount(pr.derivationIndex);
  const token = r.tokenAddress as `0x${string}`;
  const value = BigInt(r.amountOnchain);
  const bal = await publicClient().readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [from.address] });
  if (bal < value) throw new Error(`Deposit address holds ${bal} base units, refund needs ${value}`);
  const auth: Authorization = {
    from: from.address,
    to: r.toAddress as `0x${string}`,
    value: value.toString(),
    validAfter: "0",
    validBefore: String(Math.floor(Date.now() / 1000) + 3600),
    nonce: toHex(randomBytes(32)),
  };
  const signature = await from.signTypedData({
    domain: usdcDomain(),
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: { ...auth, value, validAfter: 0n, validBefore: BigInt(auth.validBefore) },
  });
  return submitAuthorization(auth, signature);
}

async function submitWithGasTopup(r: Refund, pr: PR) {
  const from = deriveAccount(pr.derivationIndex);
  const c = publicClient();
  const token = r.tokenAddress as `0x${string}`;
  const value = BigInt(r.amountOnchain);
  const gas = await c.estimateContractGas({ address: token, abi: erc20Abi, functionName: "transfer", args: [r.toAddress as `0x${string}`, value], account: from.address });
  const fees = await c.estimateFeesPerGas();
  const need = (gas * 2n) * (fees.maxFeePerGas ?? 1_000_000n) * 2n;
  const have = await c.getBalance({ address: from.address });
  if (have < need) {
    const topup = await walletClient(gasSponsor()).sendTransaction({ to: from.address, value: need - have });
    await c.waitForTransactionReceipt({ hash: topup, timeout: 60_000 });
  }
  return walletClient(from).writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [r.toAddress as `0x${string}`, value] });
}

/** Worker: push queued refunds on-chain and track submitted ones. */
export async function processRefunds() {
  const rows = await db.select().from(schema.refunds).where(inArray(schema.refunds.status, ["queued", "submitted"]));
  for (const r of rows) {
    const pr = (await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, r.paymentRequestId) }))!;
    try {
      if (r.status === "queued") {
        if (r.method === "simulated") {
          const txHash = `sim_${randomBytes(6).toString("hex")}`;
          await update(r.id, { status: "succeeded", txHash });
          await onRefundSucceeded({ ...r, status: "succeeded", txHash }, pr);
          continue;
        }
        const hash = r.method === "eip3009" ? await submitEip3009(r, pr) : await submitWithGasTopup(r, pr);
        await update(r.id, { status: "submitted", txHash: hash, error: null });
        await logActivity(r.orderId, r.paymentRequestId, "refund.submitted", `Refund tx submitted: ${hash}`);
      } else if (r.status === "submitted" && r.txHash) {
        const receipt = await publicClient()
          .getTransactionReceipt({ hash: r.txHash as `0x${string}` })
          .catch(() => null);
        if (!receipt) {
          // Dropped from the mempool: the EIP-3009 authorisation expires after 1 h, so after 10 min without a
          // receipt mark it failed — a retry signs a fresh authorisation with a new nonce.
          if (Date.now() - r.updatedAt > 10 * 60_000) {
            await update(r.id, { status: "failed", error: "No receipt after 10 minutes — transaction dropped; retry to re-send" });
            await logActivity(r.orderId, r.paymentRequestId, "refund.failed", `Refund tx ${r.txHash} was dropped`);
          }
          continue;
        }
        if (receipt.status === "success") {
          await update(r.id, { status: "succeeded" });
          await onRefundSucceeded({ ...r, status: "succeeded" }, pr);
        } else {
          await update(r.id, { status: "failed", error: "Transaction reverted" });
          await logActivity(r.orderId, r.paymentRequestId, "refund.failed", `Refund tx reverted: ${r.txHash}`);
          await enqueueWebhook("refund.failed", { orderId: r.orderId, paymentRequestId: r.paymentRequestId, refundId: r.id });
        }
      }
    } catch (e) {
      const msg = (e as { shortMessage?: string }).shortMessage ?? (e instanceof Error ? e.message : String(e));
      const friendly = /insufficient funds/i.test(msg)
        ? `Gas sponsor ${gasSponsor().address} has no Base Sepolia ETH — fund it and retry`
        : msg.slice(0, 300);
      await update(r.id, { status: "failed", error: friendly });
      await logActivity(r.orderId, r.paymentRequestId, "refund.failed", `Refund failed: ${friendly}`);
      await enqueueWebhook("refund.failed", { orderId: r.orderId, paymentRequestId: r.paymentRequestId, refundId: r.id, error: friendly });
    }
  }
}

async function onRefundSucceeded(r: Refund, pr: PR) {
  const now = Date.now();
  await update(r.id, { buyerNotifiedAt: now });
  const amt = r.tokenSymbol === "USDC" ? `${formatUsdc(BigInt(r.amountOnchain) * BigInt(pr.divisor))} USDC` : `${formatUsdc(r.amountOnchain)} ${r.tokenSymbol}`;
  await logActivity(r.orderId, r.paymentRequestId, "refund.succeeded", `Refunded ${amt} to ${r.toAddress}. Buyer notified by email.`);
  // A merchant full refund always closes the order. Exception refunds (underpaid-expired, late) only close it
  // once every USDC that arrived on this request has gone back — otherwise other money is still outstanding.
  let closeOrder = r.reason === "merchant_full";
  if (r.reason === "underpaid_expired" || r.reason === "late_payment") {
    const usdcIn = (await db.select().from(schema.transfers).where(eq(schema.transfers.paymentRequestId, pr.id)))
      .filter((t) => t.kind === "usdc" && t.status !== "reorged")
      .reduce((s, t) => s + BigInt(t.amountOnchain), 0n);
    const usdcOut = (await db.select().from(schema.refunds).where(eq(schema.refunds.paymentRequestId, pr.id)))
      .filter((x) => x.status === "succeeded" && x.tokenSymbol === "USDC")
      .reduce((s, x) => s + BigInt(x.amountOnchain), 0n);
    closeOrder = usdcOut >= usdcIn && pr.status !== "succeeded";
  }
  if (closeOrder) {
    await db.update(schema.paymentRequests).set({ status: "refunded", fundsStatus: "refunded", updatedAt: now }).where(eq(schema.paymentRequests.id, pr.id));
    await db.update(schema.orders).set({ status: "refunded" }).where(eq(schema.orders.id, r.orderId));
  }
  if (r.reason === "non_usdc_return") {
    const open = await db.query.exceptions.findFirst({
      where: and(eq(schema.exceptions.paymentRequestId, pr.id), eq(schema.exceptions.type, "non_usdc"), eq(schema.exceptions.status, "open")),
    });
    // this refund's own exception is resolved just below; clear the buyer banner if it was the last one
    if (!open || open.id === r.exceptionId) await db.update(schema.paymentRequests).set({ hasNonUsdc: 0 }).where(eq(schema.paymentRequests.id, pr.id));
  }
  if (r.exceptionId) {
    await db
      .update(schema.exceptions)
      .set({ status: "resolved", resolution: `Refunded (${r.txHash})`, resolvedAt: now })
      .where(and(eq(schema.exceptions.id, r.exceptionId), eq(schema.exceptions.status, "open")));
  }
  await enqueueWebhook("refund.succeeded", {
    orderId: r.orderId,
    paymentRequestId: r.paymentRequestId,
    refundId: r.id,
    reason: r.reason,
    amountOnchain: r.amountOnchain,
    token: r.tokenAddress,
    to: r.toAddress,
    txHash: r.txHash,
  });
}

/** Only a FAILED refund can be retried, only while it still makes sense, and the destination is re-screened. */
export async function retryRefund(id: string) {
  const r = await db.query.refunds.findFirst({ where: eq(schema.refunds.id, id) });
  if (!r) throw new RefundError("Refund not found");
  if (r.status !== "failed") throw new RefundError(`Only failed refunds can be retried (this one is ${r.status})`);
  const pr = (await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, r.paymentRequestId) }))!;
  if (r.exceptionId) {
    const ex = await db.query.exceptions.findFirst({ where: eq(schema.exceptions.id, r.exceptionId) });
    if (!ex || ex.status !== "open") throw new RefundError("The exception behind this refund is no longer open");
  }
  if (r.reason === "merchant_full" && (pr.status !== "succeeded" || pr.fundsStatus === "refunded")) {
    throw new RefundError(`Payment is ${pr.status} — refund no longer applies`);
  }
  if (r.reason === "underpaid_expired" && pr.status !== "exception") throw new RefundError(`Payment is ${pr.status} — refund no longer applies`);
  const s = await screenAddress(r.toAddress);
  if (s.hit) {
    await update(id, { status: "blocked", screeningResult: `HIT: ${s.label}` });
    throw new RefundError("Destination now fails screening — refund blocked");
  }
  await update(id, { status: "queued", error: null, screeningResult: `clear (${s.provider})` });
}
