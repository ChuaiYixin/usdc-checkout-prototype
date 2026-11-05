// Compliance & risk (simulated, but wired into the real flow).
//   R15 / R13: address screening against a LOCAL demo list — not a real sanctions provider.
//   R16: buyer-location gating — restricted regions never see "Pay with USDC".
//   Travel rule tiers (MAS Notice PSN02, paragraphs 13.4 and 13.6): basic vs enhanced originator info.
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { DEFAULT_RESTRICTED_REGIONS, SIMULATED_FX, TRAVEL_RULE } from "@/config/app";

export interface ScreeningResult {
  hit: boolean;
  label?: string;
  checkedAt: number;
  provider: string;
}

export async function screenAddress(address: string): Promise<ScreeningResult> {
  const row = await db.query.riskAddresses.findFirst({
    where: eq(schema.riskAddresses.address, address.toLowerCase()),
  });
  return { hit: !!row, label: row?.label, checkedAt: Date.now(), provider: "Local demo list (simulated)" };
}

export async function listRestrictedRegions() {
  const rows = await db.select().from(schema.restrictedRegions);
  if (rows.length === 0 && !(await db.query.settings.findFirst({ where: eq(schema.settings.key, "regions_seeded") }))) {
    return DEFAULT_RESTRICTED_REGIONS;
  }
  return rows.map((r) => ({ code: r.code, reason: r.reason }));
}

export async function isRegionRestricted(country: string) {
  const list = await listRestrictedRegions();
  return list.find((r) => r.code === country.toUpperCase());
}

export type TravelRuleTier = "basic" | "enhanced";

/** Order total in USD cents -> tier, using the simulated USD/SGD rate. */
export function travelRuleTier(totalUsdCents: number): TravelRuleTier {
  const sgd = (totalUsdCents / 100) * SIMULATED_FX.usdSgdRate;
  return sgd > TRAVEL_RULE.enhancedThresholdSgd ? "enhanced" : "basic";
}

export function travelRuleThresholdUsdCents() {
  return Math.round((TRAVEL_RULE.enhancedThresholdSgd / SIMULATED_FX.usdSgdRate) * 100);
}
