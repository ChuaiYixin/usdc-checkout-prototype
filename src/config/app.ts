// Product configuration. Client-safe. Numbers here are demo assumptions unless a source is named;
// the UI labels them accordingly.

export const MERCHANT = {
  name: "Atelier Kelong",
  tagline: "Designer accessories · Singapore",
  bankLabel: "SGD current account ••••4821",
};

// R4: payment request validity. PRD decision 3: 15 minutes.
export const PAYMENT_REQUEST_TTL_MS = 15 * 60 * 1000;

// Circle's testnet faucet: 20 USDC per address per chain every 2 hours (faucet.circle.com, checked 2026-10-23).
// So the on-chain amount is the order amount divided by this number. 1 = pay 1:1.
export const TESTNET_AMOUNT_DIVISOR = Math.max(
  1,
  Number(process.env.NEXT_PUBLIC_TESTNET_AMOUNT_DIVISOR ?? "100") || 100,
);

// Illustrative pricing for the fictional PSP — NOT a real price and NOT Stripe's rate.
export const PLATFORM_FEE_BPS = 100; // 1.00%

// R10: daily USDC→SGD conversion (simulated). The rate and spread are made-up demo values.
export const SIMULATED_FX = {
  usdSgdRate: 1.2950,
  spreadBps: 30, // 0.30%
  cutoffLabel: "17:00 SGT daily",
};

// Travel rule tiers. Checked against MAS Notice PSN02 (last revised 30 June 2025), paragraphs 13.4 and 13.6.
// Configurable here on purpose. Above the threshold the notice also requires identity verification, which isn't modelled.
export const TRAVEL_RULE = {
  enhancedThresholdSgd: 1500,
  source: "MAS Notice PSN02 (last revised 30 June 2025), paragraphs 13.4 and 13.6",
};

// R16: default buyer-location restrictions. Editable at /ops/compliance (stored in the DB).
export const DEFAULT_RESTRICTED_REGIONS: { code: string; reason: string }[] = [
  { code: "ID", reason: "Bank Indonesia prohibits crypto as a means of payment (source: BeInCrypto)" },
  { code: "KP", reason: "Comprehensive sanctions" },
  { code: "IR", reason: "Comprehensive sanctions" },
];

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "SG", name: "Singapore" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
  { code: "HK", name: "Hong Kong SAR" },
  { code: "DE", name: "Germany" },
  { code: "CA", name: "Canada" },
  { code: "ID", name: "Indonesia" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "KP", name: "North Korea" },
  { code: "IR", name: "Iran" },
];

export function countryName(code: string) {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export const PRODUCTS = [
  {
    id: "pearl-drop",
    name: "Kelong Pearl Drop Earrings",
    variant: "Freshwater pearl · 18k gold vermeil",
    priceCents: 5400,
    hue: "from-slate-200 via-slate-100 to-brand/20",
  },
];

export const SHIPPING_CENTS = 1200;
