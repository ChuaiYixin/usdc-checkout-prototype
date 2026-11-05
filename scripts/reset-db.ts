// Wipes the local SQLite DB and re-seeds. Stop `npm run dev` first.
// The HD derivation counter is carried over so new payment requests never re-use a deposit address
// from before the reset (R7: one address per request).
import { loadEnv } from "../src/lib/env";

loadEnv();

async function main() {
  const { getClient, dbReady } = await import("../src/db/client");
  await dbReady();
  const c = getClient();

  let nextIndex: string | undefined;
  try {
    const r = await c.execute("SELECT value FROM settings WHERE key = 'next_derivation_index'");
    nextIndex = r.rows[0]?.value as string | undefined;
  } catch {}

  // Drop tables instead of deleting the file (Windows keeps the file handle locked).
  const tables = await c.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  for (const row of tables.rows) await c.execute(`DROP TABLE IF EXISTS "${row.name as string}"`);

  const { runMigrations } = await import("../src/db/migrate");
  await runMigrations();
  if (nextIndex) {
    const { setSetting } = await import("../src/lib/settings");
    await setSetting("next_derivation_index", nextIndex);
  }
  const { seedIfEmpty } = await import("../src/lib/seed");
  await seedIfEmpty();
  console.log(`✓ database reset and seeded${nextIndex ? ` (HD index continues at ${nextIndex})` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
