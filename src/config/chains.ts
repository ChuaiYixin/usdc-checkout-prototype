// Chain registry. Client-safe (no secrets).
//
// PRD decision 1: v1 supports three chains (one major L1 + two cheap/fast chains). In the prototype only
// Base Sepolia is wired to a real testnet; the others are shown in the chain picker but cannot be selected (R2).
//
// PRD decision 2: confirmation thresholds are per chain and split into two states:
//   - success*: blocks until the BUYER sees "Payment successful" (fewer for small amounts)
//   - finality: when the MERCHANT balance becomes available. On OP Stack chains (Base) this uses the RPC's
//     `safe` head — the L2 block has been posted to Ethereum L1 — with a block count as fallback.
// Calibrated against Base Sepolia on 2026-10-24: 0.2 s per block; `safe` lags the head by ~1–2 min,
// `finalized` by ~15–16 min. Values are still demo choices pending engineering review (PRD open question).

export type ChainKey = "base-sepolia" | "ethereum-sepolia" | "solana-devnet";

export type ChainAvailability = "live" | "simulated" | "unavailable";

export interface ChainConfig {
  key: ChainKey;
  name: string;
  shortName: string;
  availability: ChainAvailability;
  evmChainId?: number;
  // USDC contract — verified against Circle docs (developers.circle.com/stablecoins/usdc-contract-addresses), 2026-10-23.
  usdcAddress?: `0x${string}`;
  // EIP-712 domain of the USDC contract (read on-chain via name()/version(), 2026-10-23)
  usdcEip712?: { name: string; version: string };
  explorerUrl?: string;
  estFeeLabel: string;
  estTimeLabel: string;
  blockTimeSec: number;
  confirmations: {
    largeAmountUsd: number; // payments >= this use the "large" success threshold
    successSmall: number;
    successLarge: number;
    finality: number; // block-count fallback when the RPC can't report finalityTag
    finalityTag?: "safe" | "finalized";
  };
  finalityLabel: string;
  note?: string;
}

export const CHAINS: Record<ChainKey, ChainConfig> = {
  "base-sepolia": {
    key: "base-sepolia",
    name: "Base Sepolia",
    shortName: "Base",
    availability: "live",
    evmChainId: 84532,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcEip712: { name: "USDC", version: "2" },
    explorerUrl: "https://sepolia.basescan.org",
    estFeeLabel: "< $0.01 network fee",
    estTimeLabel: "~5 seconds",
    blockTimeSec: 0.2,
    confirmations: { largeAmountUsd: 1000, successSmall: 10, successLarge: 50, finality: 300, finalityTag: "safe" },
    finalityLabel: "posted to Ethereum L1 (safe head, a few minutes)",
  },
  "ethereum-sepolia": {
    key: "ethereum-sepolia",
    name: "Ethereum Sepolia",
    shortName: "Ethereum",
    availability: "unavailable",
    evmChainId: 11155111,
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    explorerUrl: "https://sepolia.etherscan.io",
    estFeeLabel: "Higher network fee",
    estTimeLabel: "~3 minutes",
    blockTimeSec: 12,
    confirmations: { largeAmountUsd: 1000, successSmall: 3, successLarge: 12, finality: 64, finalityTag: "finalized" },
    finalityLabel: "finalized (~13 min)",
    note: "Coming soon",
  },
  "solana-devnet": {
    key: "solana-devnet",
    name: "Solana Devnet",
    shortName: "Solana",
    availability: "unavailable",
    estFeeLabel: "< $0.01 network fee",
    estTimeLabel: "~15 seconds",
    blockTimeSec: 0.4,
    confirmations: { largeAmountUsd: 1000, successSmall: 1, successLarge: 1, finality: 32 },
    finalityLabel: "32 slots",
    note: "Coming soon",
  },
};

export const LIVE_CHAIN: ChainConfig = CHAINS["base-sepolia"];

export function successThresholdFor(chain: ChainConfig, amountUsdCents: number) {
  return amountUsdCents >= chain.confirmations.largeAmountUsd * 100
    ? chain.confirmations.successLarge
    : chain.confirmations.successSmall;
}

export function txUrl(chain: ChainConfig, hash: string) {
  return chain.explorerUrl ? `${chain.explorerUrl}/tx/${hash}` : undefined;
}

export function addressUrl(chain: ChainConfig, address: string) {
  return chain.explorerUrl ? `${chain.explorerUrl}/address/${address}` : undefined;
}
