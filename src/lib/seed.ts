import { db, schema } from "@/db/client";
import { DEFAULT_RESTRICTED_REGIONS } from "@/config/app";
import { getSetting, setSetting } from "./settings";

// Made-up addresses for the demo screening list. NOT a real sanctions list.
export const DEMO_RISK_ADDRESSES = [
  { address: "0xbad0000000000000000000000000000000000001", label: "Demo: sanctioned entity (simulated)" },
  { address: "0xbad0000000000000000000000000000000000002", label: "Demo: mixer-linked address (simulated)" },
  { address: "0xbad0000000000000000000000000000000000003", label: "Demo: stolen-funds cluster (simulated)" },
];

// Simulated address labels (a real product would use a blockchain-analytics provider's exchange attribution).
export const DEMO_ADDRESS_LABELS = [
  { address: "0xe8c0000000000000000000000000000000000001", kind: "exchange", label: "Demo Exchange hot wallet (simulated)" },
  { address: "0xe8c0000000000000000000000000000000000002", kind: "exchange", label: "Demo Exchange 2 hot wallet (simulated)" },
];

/** Idempotent additions that must also reach databases seeded by an earlier version. */
async function seedAdditions() {
  await db.insert(schema.addressLabels).values(DEMO_ADDRESS_LABELS).onConflictDoNothing();
}

export async function seedIfEmpty() {
  await seedAdditions();
  if (await getSetting("seeded")) return;
  const now = Date.now();
  await db.insert(schema.riskAddresses).values(DEMO_RISK_ADDRESSES.map((r) => ({ ...r, addedAt: now }))).onConflictDoNothing();
  await db.insert(schema.restrictedRegions).values(DEFAULT_RESTRICTED_REGIONS.map((r) => ({ ...r, addedAt: now }))).onConflictDoNothing();
  await setSetting("regions_seeded", "1");
  const { seedHistory } = await import("./seed-history");
  await seedHistory();
  await setSetting("seeded", "1");
}
