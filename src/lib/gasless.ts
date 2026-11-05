// Gasless checkout (R18) — what the platform is willing to sponsor. Kept pure so it can be unit-tested.
import { getAddress, isAddress, isHex } from "viem";
import type { schema } from "@/db/client";
import type { Authorization } from "./eip3009-types";
import { verifyAuthorization } from "./eip3009";

type PR = typeof schema.paymentRequests.$inferSelect;

/** Returns an error message, or null when the platform should submit (and pay gas for) this authorisation. */
export async function checkGaslessAuthorization(pr: PR, a: Authorization | undefined, signature: string | undefined, nowMs = Date.now()) {
  if (!["awaiting_payment", "underpaid"].includes(pr.status)) return "This payment request is not accepting payments";
  if (nowMs > pr.expiresAt) return "This payment request has expired";
  if (!a || !isAddress(a.from) || !isAddress(a.to) || !isHex(a.nonce) || !signature || !isHex(signature)) return "Malformed authorisation";
  // Only exactly what this request still needs, to this request's own deposit address.
  if (getAddress(a.to) !== getAddress(pr.address)) return "Wrong destination";
  if (BigInt(a.value) !== BigInt(pr.amountOnchain) - BigInt(pr.receivedOnchain)) return "Amount must equal the amount due";
  const nowSec = BigInt(Math.floor(nowMs / 1000));
  if (BigInt(a.validAfter) > nowSec || BigInt(a.validBefore) < nowSec + 60n || BigInt(a.validBefore) > nowSec + 3600n) {
    return "Authorisation validity window is not acceptable";
  }
  if (!(await verifyAuthorization(a, signature as `0x${string}`))) return "Signature does not match the paying wallet";
  return null;
}
