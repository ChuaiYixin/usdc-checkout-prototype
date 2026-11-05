// Payment engine, driven by the worker loop:
//   scan()      R5/R7  — pull ERC-20 Transfer logs whose `to` is one of our deposit addresses
//   evaluate()  R5/R14/R15 — confirmations, reorg check, screening, amount matching, state transitions
//   expire()    R4     — close requests that passed their 15-minute window
//
// State machine (payment_requests.status):
//   awaiting_payment ─tx seen→ confirming ─confirmed─┬─ amount == due ───→ succeeded (funds: pending_finality → available)
//                                                    ├─ amount  > due ───→ succeeded + auto-refund of the excess
//                                                    ├─ amount  < due ───→ underpaid ─top-up→ confirming
//                                                    │                          └─expiry→ exception (refund in full)
//                                                    └─ payer screened ──→ under_review (funds frozen)
//   awaiting_payment ─expiry→ expired ─late tx→ exception (merchant accepts or refunds)
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { getAddress, type Log } from "viem";
import { db, schema } from "@/db/client";
import { LIVE_CHAIN } from "@/config/chains";
import { erc20Abi, publicClient, transferEvent } from "./chain";
import { getSetting, setSetting } from "./settings";
import { logActivity } from "./activity";
import { enqueueWebhook } from "./webhooks";
import { screenAddress } from "./compliance";
import { formatUsdc } from "./money";
import { createRefund } from "./refunds";
import { trackFunnel } from "./funnel";

type PR = typeof schema.paymentRequests.$inferSelect;
type Transfer = typeof schema.transfers.$inferSelect;

const CHUNK = 150n; // public Base Sepolia RPC caps eth_getLogs at 200 blocks
const MAX_BACKLOG_PER_TICK = 6000n;
const WATCH_WINDOW_MS = 7 * 24 * 3600 * 1000; // keep watching addresses for late arrivals
const cursorKey = `cursor:${LIVE_CHAIN.key}`;

const blockTsCache = new Map<bigint, number>();
async function blockTimestamp(n: bigint) {
  if (!blockTsCache.has(n)) {
    const b = await publicClient().getBlock({ blockNumber: n });
    blockTsCache.set(n, Number(b.timestamp) * 1000);
    if (blockTsCache.size > 500) blockTsCache.delete(blockTsCache.keys().next().value!);
  }
  return blockTsCache.get(n)!;
}

const symbolCache = new Map<string, string>();
async function tokenSymbol(token: string) {
  const key = token.toLowerCase();
  if (key === LIVE_CHAIN.usdcAddress!.toLowerCase()) return "USDC";
  if (!symbolCache.has(key)) {
    try {
      symbolCache.set(key, await publicClient().readContract({ address: token as `0x${string}`, abi: erc20Abi, functionName: "symbol" }));
    } catch {
      symbolCache.set(key, "UNKNOWN");
    }
  }
  return symbolCache.get(key)!;
}

const nominal = (pr: PR, onchain: bigint) => `${formatUsdc(onchain * BigInt(pr.divisor))} USDC`;

async function updatePr(id: string, patch: Partial<PR>) {
  await db.update(schema.paymentRequests).set({ ...patch, updatedAt: Date.now() }).where(eq(schema.paymentRequests.id, id));
}

async function setOrderStatus(orderId: string, status: string) {
  await db.update(schema.orders).set({ status }).where(eq(schema.orders.id, orderId));
}

async function openException(pr: PR, type: string, defaultAction: string, amountOnchain: bigint, transferId?: number, note?: string) {
  // Idempotent: one exception per (type, transfer) — or one open exception per type when it isn't tied to a transfer.
  const existing = await db.query.exceptions.findFirst({
    where: transferId
      ? and(eq(schema.exceptions.paymentRequestId, pr.id), eq(schema.exceptions.type, type), eq(schema.exceptions.transferId, transferId))
      : and(eq(schema.exceptions.paymentRequestId, pr.id), eq(schema.exceptions.type, type), eq(schema.exceptions.status, "open")),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(schema.exceptions)
    .values({
      paymentRequestId: pr.id,
      orderId: pr.orderId,
      transferId: transferId ?? null,
      type,
      status: "open",
      amountOnchain: amountOnchain.toString(),
      defaultAction,
      note: note ?? null,
      createdAt: Date.now(),
    })
    .returning({ id: schema.exceptions.id });
  return row.id;
}

export async function resolveExceptions(prId: string, types: string[], resolution: string, status = "resolved") {
  await db
    .update(schema.exceptions)
    .set({ status, resolution, resolvedAt: Date.now() })
    .where(and(eq(schema.exceptions.paymentRequestId, prId), inArray(schema.exceptions.type, types), eq(schema.exceptions.status, "open")));
}

// ---------------------------------------------------------------------------------------------
// scan

async function watchedRequests() {
  return db
    .select()
    .from(schema.paymentRequests)
    .where(and(eq(schema.paymentRequests.chainKey, LIVE_CHAIN.key), gte(schema.paymentRequests.createdAt, Date.now() - WATCH_WINDOW_MS)));
}

export async function scan() {
  const client = publicClient();
  const latest = await client.getBlockNumber();
  const saved = await getSetting(cursorKey);
  let cursor = saved ? BigInt(saved) : latest - 20n;
  if (latest - cursor > MAX_BACKLOG_PER_TICK) {
    // Never skip blocks (a skipped range could hold a payment) — catch up a bounded slice per tick instead.
    console.warn(`[scan] ${latest - cursor} blocks behind; catching up ${MAX_BACKLOG_PER_TICK} blocks this tick`);
  }
  const target = latest - cursor > MAX_BACKLOG_PER_TICK ? cursor + MAX_BACKLOG_PER_TICK : latest;
  if (target < latest) {
    // heartbeat before the long catch-up slice so dashboards show "catching up" rather than "offline"
    await setSetting("worker:heartbeat", JSON.stringify({ at: Date.now(), block: latest.toString(), watching: 0, behind: Number(latest - cursor) }));
  }
  const prs = await watchedRequests();
  const byAddress = new Map(prs.map((p) => [p.address.toLowerCase(), p]));
  const addresses = [...byAddress.keys()] as `0x${string}`[];
  let found = 0;

  while (cursor < target) {
    const from = cursor + 1n;
    const to = from + CHUNK - 1n < target ? from + CHUNK - 1n : target;
    for (let i = 0; i < addresses.length; i += 100) {
      // No `address` filter: we want *any* token sent to our addresses, so non-USDC arrivals are caught (R14).
      const logs = await client.getLogs({ event: transferEvent, args: { to: addresses.slice(i, i + 100) }, fromBlock: from, toBlock: to });
      for (const log of logs) {
        const pr = byAddress.get((log.args.to as string).toLowerCase());
        if (pr && (await recordTransfer(pr, log))) found++;
      }
    }
    cursor = to;
    await setSetting(cursorKey, cursor.toString());
  }
  // Expiry must be judged against the last block we actually scanned, not the chain head.
  const latestTs = await blockTimestamp(cursor);
  // OP Stack `safe` head: highest L2 block already posted to Ethereum L1 (merchant-funds finality, PRD decision 2).
  let safe: bigint | undefined;
  if (LIVE_CHAIN.confirmations.finalityTag) {
    try {
      safe = (await client.getBlock({ blockTag: LIVE_CHAIN.confirmations.finalityTag })).number ?? undefined;
    } catch {
      safe = undefined; // RPC without safe/finalized support → block-count fallback
    }
  }
  await setSetting(
    "worker:heartbeat",
    JSON.stringify({ at: Date.now(), block: latest.toString(), safe: safe?.toString(), blockTs: latestTs, watching: addresses.length, behind: Number(latest - cursor) }),
  );
  return { latest, latestTs, safe, found };
}

type TransferLog = Log<bigint, number, false, typeof transferEvent>;

async function recordTransfer(pr: PR, log: TransferLog) {
  const ts = await blockTimestamp(log.blockNumber!);
  const token = getAddress(log.address);
  const isUsdc = token.toLowerCase() === pr.tokenAddress.toLowerCase();
  return ingestTransfer(pr, {
    txHash: log.transactionHash!,
    logIndex: log.logIndex!,
    blockNumber: Number(log.blockNumber),
    blockHash: log.blockHash!,
    blockTimestamp: ts,
    tokenAddress: token,
    tokenSymbol: await tokenSymbol(token),
    kind: isUsdc ? "usdc" : "non_usdc",
    fromAddress: getAddress(log.args.from as string),
    toAddress: getAddress(log.args.to as string),
    amountOnchain: (log.args.value as bigint).toString(),
    simulated: 0,
  });
}

export type IncomingTransfer = Pick<
  Transfer,
  "txHash" | "logIndex" | "blockNumber" | "blockHash" | "blockTimestamp" | "tokenAddress" | "tokenSymbol" | "kind" | "fromAddress" | "toAddress" | "amountOnchain" | "simulated"
>;

/** Shared by the real scanner and the simulator. Returns true if the transfer was new. */
export async function ingestTransfer(prArg: PR, t: IncomingTransfer) {
  // Re-read: several transfers for the same request can arrive within one scan.
  const pr = (await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, prArg.id) })) ?? prArg;
  const alreadyPaid = ["succeeded", "under_review"].includes(pr.status);
  // A transfer after expiry is "late" — unless the order was already paid, in which case it's simply an extra
  // (duplicate) payment and goes down the overpayment path. Money arriving on a refunded order is always
  // unexpected and goes to the exception queue.
  const late = (t.blockTimestamp > pr.expiresAt && !alreadyPaid) || pr.status === "refunded" ? 1 : 0;
  const inserted = await db
    .insert(schema.transfers)
    .values({ ...t, chainKey: pr.chainKey, paymentRequestId: pr.id, status: "seen", late, createdAt: Date.now() })
    .onConflictDoNothing()
    .returning({ id: schema.transfers.id });
  if (!inserted.length) return false;
  const transferId = inserted[0].id;
  const amount = BigInt(t.amountOnchain);
  const sim = t.simulated ? " [simulated]" : "";

  if (t.kind === "non_usdc") {
    // R14: never credited; manual review, then returned.
    await updatePr(pr.id, { hasNonUsdc: 1 });
    await openException(pr, "non_usdc", "manual_review_return", amount, transferId, `${t.tokenSymbol} ${t.tokenAddress}`);
    await logActivity(pr.orderId, pr.id, "transfer.non_usdc", `Received a non-USDC token (${t.tokenSymbol}) from ${t.fromAddress} — not credited, sent to exception queue${sim}`);
    await enqueueWebhook("payment.exception", { orderId: pr.orderId, paymentRequestId: pr.id, reason: "non_usdc_token", token: t.tokenAddress });
    return true;
  }

  await logActivity(pr.orderId, pr.id, "transfer.seen", `Detected ${nominal(pr, amount)} from ${t.fromAddress} in block ${t.blockNumber}${late ? " — after expiry" : ""}${sim}`);

  if (late) {
    // Only take over the request's status when nothing in-time is still being processed; an in-flight
    // (confirming / underpaid) payment keeps its own lifecycle and the late transfer is handled separately.
    if (["awaiting_payment", "expired", "exception"].includes(pr.status)) {
      await updatePr(pr.id, { status: "exception", payerAddress: pr.payerAddress ?? t.fromAddress, firstTxHash: pr.firstTxHash ?? t.txHash });
      await setOrderStatus(pr.orderId, "needs_review");
    }
    await openException(pr, "late_payment", "merchant_decide", amount, transferId, pr.status === "refunded" ? "Arrived after the order was refunded" : undefined);
    await enqueueWebhook("payment.exception", { orderId: pr.orderId, paymentRequestId: pr.id, reason: "late_payment", txHash: t.txHash });
    return true;
  }

  if (["awaiting_payment", "underpaid", "expired"].includes(pr.status)) {
    const exchange = await db.query.addressLabels.findFirst({ where: eq(schema.addressLabels.address, t.fromAddress.toLowerCase()) });
    await updatePr(pr.id, {
      status: "confirming",
      payerAddress: pr.payerAddress ?? t.fromAddress,
      firstTxHash: pr.firstTxHash ?? t.txHash,
      payerIsExchange: pr.payerIsExchange || (exchange?.kind === "exchange" ? 1 : 0),
    });
    if (exchange?.kind === "exchange") {
      await logActivity(pr.orderId, pr.id, "payer.exchange", `Payer ${t.fromAddress} is a known exchange wallet (${exchange.label}, simulated label) — refunds will need a verified refund address`);
    }
    await trackFunnel(pr.id, "payment_detected");
    if (pr.status !== "underpaid") {
      await enqueueWebhook("payment.confirming", { orderId: pr.orderId, paymentRequestId: pr.id, txHash: t.txHash, amount: t.amountOnchain });
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// evaluate

/**
 * Reorg check. A tx that was re-mined in a different block is still valid: we move it to the new block
 * (and its confirmations restart from there). Only a missing or failed receipt counts as reorged out.
 */
async function verifyOnchain(t: Transfer, pr: PR): Promise<"ok" | "moved" | "gone"> {
  if (t.simulated) return "ok";
  try {
    const r = await publicClient().getTransactionReceipt({ hash: t.txHash as `0x${string}` });
    if (r.status !== "success") return "gone";
    if (r.blockHash.toLowerCase() === t.blockHash.toLowerCase()) return "ok";
    await db
      .update(schema.transfers)
      .set({ blockHash: r.blockHash, blockNumber: Number(r.blockNumber), status: "seen" })
      .where(eq(schema.transfers.id, t.id));
    await logActivity(pr.orderId, pr.id, "transfer.reorg_moved", `Transfer ${t.txHash} was re-mined in block ${r.blockNumber}; re-counting confirmations`);
    return "moved";
  } catch {
    return "gone"; // receipt gone -> treat as reorged out
  }
}

async function markReorged(t: Transfer, pr: PR) {
  await db.update(schema.transfers).set({ status: "reorged" }).where(eq(schema.transfers.id, t.id));
  await logActivity(pr.orderId, pr.id, "transfer.reorged", `Transfer ${t.txHash} no longer in the canonical chain — ignored`);
}

/** `safe`: chain's L1-safe head if known; without it merchant finality falls back to a block count. */
export async function evaluate(latest: bigint, safe?: bigint) {
  const prs = await db
    .select()
    .from(schema.paymentRequests)
    .where(inArray(schema.paymentRequests.status, ["confirming", "succeeded", "underpaid", "exception", "under_review"]));
  for (const pr of prs) {
    if (pr.status === "succeeded" && pr.fundsStatus !== "pending_finality" && pr.updatedAt < Date.now() - 60_000) {
      // Settled-down paid orders: only re-evaluate when a new (duplicate) transfer shows up, or shortly after an
      // ops action touched the request (e.g. compliance released a flagged extra transfer).
      const pending = await db.query.transfers.findFirst({ where: and(eq(schema.transfers.paymentRequestId, pr.id), eq(schema.transfers.status, "seen")) });
      if (!pending) continue;
    }
    if (pr.status === "exception" || pr.status === "under_review") {
      await refreshConfirmations(pr, latest); // keep numbers fresh for the dashboard
      continue;
    }
    await evaluateOne(pr, latest, safe);
  }
}

async function refreshConfirmations(pr: PR, latest: bigint) {
  const txs = await db.select().from(schema.transfers).where(eq(schema.transfers.paymentRequestId, pr.id));
  for (const t of txs) {
    const conf = Math.max(0, Number(latest) - t.blockNumber + 1);
    if (conf !== t.confirmations && t.status !== "reorged") {
      await db.update(schema.transfers).set({ confirmations: conf }).where(eq(schema.transfers.id, t.id));
    }
  }
  return txs;
}

async function evaluateOne(pr: PR, latest: bigint, safe?: bigint) {
  const all = await refreshConfirmations(pr, latest);
  const counted = all.filter((t) => t.kind === "usdc" && t.status !== "reorged" && (!t.late || t.acceptedLate));
  const confOf = (t: Transfer) => Math.max(0, Number(latest) - t.blockNumber + 1);

  // Confirm transfers that reached the buyer-facing threshold: reorg check + address screening (R15).
  for (const t of counted) {
    if (t.status !== "seen" || confOf(t) < pr.successThreshold) continue;
    const v = await verifyOnchain(t, pr);
    if (v === "gone") {
      await markReorged(t, pr);
      t.status = "reorged";
      continue;
    }
    if (v === "moved") return; // re-read next tick with the new block number
    const s = await screenAddress(t.fromAddress);
    await db
      .update(schema.transfers)
      .set({ status: "confirmed", confirmations: confOf(t), screeningHit: s.hit ? 1 : 0, screeningLabel: s.label ?? null })
      .where(eq(schema.transfers.id, t.id));
    Object.assign(t, { status: "confirmed", screeningHit: s.hit ? 1 : 0, screeningLabel: s.label ?? null });
    await logActivity(pr.orderId, pr.id, "transfer.confirmed", `${confOf(t)} confirmations reached; payer screening: ${s.hit ? "HIT" : "clear"} (${s.provider})`);
  }

  const live = counted.filter((t) => t.status !== "reorged");
  const pending = live.filter((t) => t.status === "seen");
  const confirmed = live.filter((t) => t.status === "confirmed");
  const total = confirmed.reduce((s, t) => s + BigInt(t.amountOnchain), 0n);
  const expected = BigInt(pr.amountOnchain);
  const minConf = live.length ? Math.min(...live.map(confOf)) : 0;
  const now = Date.now();

  if (pr.status === "confirming" || pr.status === "underpaid") {
    if (live.length === 0) {
      // everything we saw was reorged out
      await updatePr(pr.id, { status: now > pr.expiresAt ? "expired" : "awaiting_payment", confirmations: 0 });
      return;
    }
    if (pending.length) {
      await updatePr(pr.id, { confirmations: Math.min(...pending.map(confOf)) });
      return;
    }

    if (confirmed.some((t) => t.screeningHit) && !pr.screeningCleared) {
      // R15: freeze — never reaches the merchant balance. Buyer only sees "processing".
      await updatePr(pr.id, { status: "under_review", fundsStatus: "frozen", receivedOnchain: total.toString(), confirmations: minConf });
      const hit = confirmed.find((t) => t.screeningHit)!;
      await openException(pr, "screening_hit", "compliance_review", total, hit.id, hit.screeningLabel ?? undefined);
      await setOrderStatus(pr.orderId, "needs_review");
      await logActivity(pr.orderId, pr.id, "screening.hit", `Payer ${hit.fromAddress} matched "${hit.screeningLabel}" — funds frozen pending compliance review`);
      await enqueueWebhook("payment.under_review", { orderId: pr.orderId, paymentRequestId: pr.id });
      return;
    }

    if (total >= expected) {
      const wasSucceeded = !!pr.succeededAt; // e.g. pushed back to confirming by a reorg or a compliance release
      await updatePr(pr.id, {
        status: "succeeded",
        fundsStatus: "pending_finality",
        receivedOnchain: total.toString(),
        confirmations: minConf,
        succeededAt: pr.succeededAt ?? now,
      });
      await setOrderStatus(pr.orderId, "paid");
      await resolveExceptions(pr.id, ["underpaid", "underpaid_expired"], "Full amount received", "auto_resolved");
      if (!wasSucceeded) {
        await trackFunnel(pr.id, "payment_succeeded");
        await logActivity(pr.orderId, pr.id, "payment.succeeded", `Payment successful: ${nominal(pr, total)} received, matched to order ${pr.orderId} automatically`);
        await enqueueWebhook("payment.succeeded", {
          orderId: pr.orderId,
          paymentRequestId: pr.id,
          amount: pr.amountMicros,
          amountOnchain: total.toString(),
          txHashes: confirmed.map((t) => t.txHash),
          payer: confirmed[0].fromAddress,
        });
      }
      const excess = total - expected - BigInt(pr.excessRefundedOnchain);
      if (excess > 0n) await handleExcess(pr, excess, latestTransfer(confirmed));
      return;
    }

    // total < expected
    if (now <= pr.expiresAt) {
      if (pr.status !== "underpaid") {
        await updatePr(pr.id, { status: "underpaid", receivedOnchain: total.toString(), confirmations: minConf });
        await openException(pr, "underpaid", "await_top_up", expected - total);
        await logActivity(pr.orderId, pr.id, "payment.underpaid", `Underpaid: ${nominal(pr, total)} of ${nominal(pr, expected)}; buyer can top up ${nominal(pr, expected - total)} before expiry`);
        await enqueueWebhook("payment.underpaid", { orderId: pr.orderId, paymentRequestId: pr.id, received: total.toString(), due: expected.toString() });
      } else if (pr.receivedOnchain !== total.toString()) {
        await updatePr(pr.id, { receivedOnchain: total.toString() });
      }
      return;
    }
    await underpaidExpired({ ...pr, receivedOnchain: total.toString() });
    return;
  }

  if (pr.status === "succeeded") {
    if (pending.length) return;
    // Extra transfers after success (duplicate payments). Screen each one on its own: a flagged extra
    // transfer is held for compliance, never auto-refunded; clean extras are refunded to their own sender.
    for (const t of confirmed) {
      if (t.screeningHit && !pr.screeningCleared) {
        await openException(pr, "screening_hit", "compliance_review", BigInt(t.amountOnchain), t.id, t.screeningLabel ?? undefined);
      }
    }
    const clean = confirmed.filter((t) => !t.screeningHit || pr.screeningCleared);
    const cleanTotal = clean.reduce((s, t) => s + BigInt(t.amountOnchain), 0n);
    const excess = cleanTotal - expected - BigInt(pr.excessRefundedOnchain);
    if (excess > 0n) {
      await updatePr(pr.id, { receivedOnchain: cleanTotal.toString() });
      await handleExcess({ ...pr, receivedOnchain: cleanTotal.toString() }, excess, latestTransfer(clean));
    }
    // PRD decision 2: merchant funds become available only at the (stricter) finality threshold —
    // and only after re-checking that every counted transfer is still in the canonical chain.
    const final = safe !== undefined ? clean.every((t) => BigInt(t.blockNumber) <= safe) : minConf >= pr.finalityThreshold;
    if (pr.fundsStatus === "pending_finality" && final) {
      for (const t of clean) {
        const v = await verifyOnchain(t, pr);
        if (v === "ok") continue;
        if (v === "gone") await markReorged(t, pr);
        await updatePr(pr.id, { status: "confirming", confirmations: 0 });
        await logActivity(pr.orderId, pr.id, "funds.held", "Reorg detected before finality — merchant funds stay unavailable while the payment re-confirms");
        return;
      }
      await updatePr(pr.id, { fundsStatus: "available", availableAt: now, confirmations: minConf });
      await logActivity(
        pr.orderId,
        pr.id,
        "funds.available",
        safe !== undefined
          ? `Block posted to Ethereum L1 (${LIVE_CHAIN.confirmations.finalityTag} head #${safe}) — funds available to the merchant`
          : `${pr.finalityThreshold} confirmations — funds available to the merchant`,
      );
      await enqueueWebhook("payment.funds_available", { orderId: pr.orderId, paymentRequestId: pr.id });
    } else if (pr.fundsStatus === "pending_finality" && minConf !== pr.confirmations) {
      await updatePr(pr.id, { confirmations: minConf });
    }
  }
}

function latestTransfer(ts: Transfer[]) {
  return ts.reduce((a, b) => (b.blockNumber > a.blockNumber || (b.blockNumber === a.blockNumber && b.id > a.id) ? b : a));
}

async function handleExcess(pr: PR, excess: bigint, source: Transfer) {
  // PRD: overpayment completes the order normally; the extra is refunded automatically to the address that
  // sent it. The exception closes when the refund actually lands (refunds.ts), so a blocked refund stays visible.
  const exId = await openException(pr, "overpaid", "refund_excess", excess, source.id);
  await updatePr(pr.id, { excessRefundedOnchain: (BigInt(pr.excessRefundedOnchain) + excess).toString() });
  await logActivity(pr.orderId, pr.id, "payment.overpaid", `Overpaid by ${nominal(pr, excess)} — automatic refund of the excess to ${source.fromAddress} created`);
  await createRefund({ pr, reason: "overpayment_excess", kind: "partial", amountOnchain: excess, exceptionId: exId, toAddress: source.fromAddress });
}

async function underpaidExpired(pr: PR) {
  await updatePr(pr.id, { status: "exception", receivedOnchain: pr.receivedOnchain });
  await resolveExceptions(pr.id, ["underpaid"], "Request expired before top-up", "resolved");
  await openException(pr, "underpaid_expired", "refund_full", BigInt(pr.receivedOnchain));
  await setOrderStatus(pr.orderId, "needs_review");
  await logActivity(pr.orderId, pr.id, "payment.underpaid_expired", `Expired with only ${nominal(pr, BigInt(pr.receivedOnchain))} received — default action: refund in full`);
  await enqueueWebhook("payment.exception", { orderId: pr.orderId, paymentRequestId: pr.id, reason: "underpaid_expired" });
}

// ---------------------------------------------------------------------------------------------
// expire

/** Only expire once the scanner has seen blocks past the deadline, so a just-in-time payment isn't missed. */
export async function expire(scannedUpToTs: number) {
  const now = Date.now();
  const due = await db
    .select()
    .from(schema.paymentRequests)
    .where(and(inArray(schema.paymentRequests.status, ["awaiting_payment", "underpaid"]), lt(schema.paymentRequests.expiresAt, Math.min(now, scannedUpToTs))));
  for (const pr of due) {
    if (pr.status === "underpaid") {
      await underpaidExpired(pr);
      continue;
    }
    await updatePr(pr.id, { status: "expired" });
    await setOrderStatus(pr.orderId, "expired");
    await logActivity(pr.orderId, pr.id, "payment.expired", "No payment within 15 minutes — request expired");
    await enqueueWebhook("payment.expired", { orderId: pr.orderId, paymentRequestId: pr.id });
  }
  return due.length;
}
