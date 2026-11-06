import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type SettlementPreference = "auto_sgd" | "hold_usdc";

export interface MerchantSettings {
  settlementPreference: SettlementPreference;
  webhookUrl: string;
  mockEndpointFailing: boolean; // simulate a merchant outage to demo webhook retries (R9)
}

const DEFAULTS: MerchantSettings = {
  settlementPreference: "auto_sgd", // PRD decision 5: default to daily SGD conversion
  webhookUrl: `${process.env.APP_URL || "http://localhost:3000"}/api/webhook-receiver/webhook`,
  mockEndpointFailing: false,
};

export async function getSetting(key: string): Promise<string | undefined> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  return row?.value;
}

export async function setSetting(key: string, value: string) {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

export async function getMerchantSettings(): Promise<MerchantSettings> {
  const raw = await getSetting("merchant");
  return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
}

export async function updateMerchantSettings(patch: Partial<MerchantSettings>) {
  const next = { ...(await getMerchantSettings()), ...patch };
  await setSetting("merchant", JSON.stringify(next));
  return next;
}

/** Atomically reserve the next HD derivation index (index 0 is the gas sponsor wallet). */
export async function nextDerivationIndex(): Promise<number> {
  await db
    .insert(schema.settings)
    .values({ key: "next_derivation_index", value: "1" })
    .onConflictDoNothing();
  const rows = await db
    .update(schema.settings)
    .set({ value: sql`CAST(${schema.settings.value} AS INTEGER) + 1` })
    .where(eq(schema.settings.key, "next_derivation_index"))
    .returning({ value: schema.settings.value });
  return Number(rows[0].value) - 1;
}
