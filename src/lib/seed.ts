import { db, schema } from "@/db/client";
import { DEFAULT_RESTRICTED_REGIONS } from "@/config/app";
import { getSetting, setSetting } from "./settings";

// Made-up addresses for the demo screening list. NOT a real sanctions list.
export const DEMO_RISK_ADDRESSES = [
  { address: "0xbad0000000000000000000000000000000000001", label: "Sanctioned entity" },
  { address: "0xbad0000000000000000000000000000000000002", label: "Mixer-linked address" },
  { address: "0xbad0000000000000000000000000000000000003", label: "Stolen-funds cluster" },
];

export async function seedIfEmpty() {
  if (await getSetting("seeded")) return;
  const now = Date.now();
  await db.insert(schema.riskAddresses).values(DEMO_RISK_ADDRESSES.map((r) => ({ ...r, addedAt: now }))).onConflictDoNothing();
  await db.insert(schema.restrictedRegions).values(DEFAULT_RESTRICTED_REGIONS.map((r) => ({ ...r, addedAt: now }))).onConflictDoNothing();
  await setSetting("regions_seeded", "1");
  const { seedHistory } = await import("./seed-history");
  await seedHistory();
  await setSetting("seeded", "1");
}
