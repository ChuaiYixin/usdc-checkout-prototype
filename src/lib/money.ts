// Amount helpers. Client-safe.
//
// Two units are used throughout:
//   - "nominal" USDC micros: what the order is worth (120 USD order = 120_000_000). Ledger, fees, settlement.
//   - "on-chain" base units: what actually moves on the testnet = nominal / divisor (see TESTNET_AMOUNT_DIVISOR).
// USDC has 6 decimals on Base Sepolia (read on-chain via decimals()).

export const USDC_DECIMALS = 6;
const MICRO = 1_000_000n;

export function usdCentsToMicros(cents: number): bigint {
  return BigInt(cents) * 10_000n;
}

export function microsToUsdCents(micros: bigint): number {
  return Number(micros / 10_000n);
}

export function nominalToOnchain(nominal: bigint, divisor: number): bigint {
  return nominal / BigInt(divisor);
}

export function onchainToNominal(onchain: bigint, divisor: number): bigint {
  return onchain * BigInt(divisor);
}

/** 120000000n -> "120.00" (trims to 2–6 decimals) */
export function formatUsdc(micros: bigint | string | number, minDecimals = 2): string {
  const v = BigInt(micros);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / MICRO;
  let frac = (abs % MICRO).toString().padStart(6, "0").replace(/0+$/, "");
  if (frac.length < minDecimals) frac = frac.padEnd(minDecimals, "0");
  const wholeStr = whole.toLocaleString("en-US");
  return `${neg ? "-" : ""}${wholeStr}${frac ? "." + frac : ""}`;
}

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatSgd(cents: number): string {
  return "S$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shortHex(hex: string, head = 6, tail = 4) {
  if (!hex) return "";
  return hex.length <= head + tail + 2 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}
