// EIP-3009 TransferWithAuthorization typed data (client-safe). Used in both directions:
//   buyer → deposit address : gasless checkout (buyer signs, platform submits and pays gas)
//   deposit → buyer         : refunds (deposit address signs, platform submits and pays gas)
import { LIVE_CHAIN } from "@/config/chains";

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function usdcDomain() {
  return {
    ...LIVE_CHAIN.usdcEip712!,
    chainId: LIVE_CHAIN.evmChainId!,
    verifyingContract: LIVE_CHAIN.usdcAddress!,
  } as const;
}

export interface Authorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string; // base units
  validAfter: string; // unix seconds
  validBefore: string;
  nonce: `0x${string}`;
}
