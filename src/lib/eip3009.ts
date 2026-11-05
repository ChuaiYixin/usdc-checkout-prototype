// Server side of EIP-3009: verify an authorisation and submit it from the gas-sponsor wallet.
import { parseSignature, verifyTypedData } from "viem";
import { eip3009Abi, walletClient } from "./chain";
import { gasSponsor } from "./hd";
import { TRANSFER_WITH_AUTHORIZATION_TYPES, usdcDomain, type Authorization } from "./eip3009-types";

export async function verifyAuthorization(auth: Authorization, signature: `0x${string}`) {
  return verifyTypedData({
    address: auth.from,
    domain: usdcDomain(),
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: { ...auth, value: BigInt(auth.value), validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore) },
    signature,
  });
}

/** Gas sponsor submits transferWithAuthorization; returns the tx hash. */
export async function submitAuthorization(auth: Authorization, signature: `0x${string}`) {
  const sig = parseSignature(signature);
  const v = sig.v !== undefined ? Number(sig.v) : sig.yParity + 27;
  return walletClient(gasSponsor()).writeContract({
    address: usdcDomain().verifyingContract,
    abi: eip3009Abi,
    functionName: "transferWithAuthorization",
    args: [auth.from, auth.to, BigInt(auth.value), BigInt(auth.validAfter), BigInt(auth.validBefore), auth.nonce, v, sig.r, sig.s],
  });
}
