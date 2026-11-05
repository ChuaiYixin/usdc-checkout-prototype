// Chain worker: one loop that scans Base Sepolia, advances payment state, executes refunds and delivers
// webhooks. Runs next to the Next.js server (`npm run dev` starts both).
import { loadEnv } from "../src/lib/env";

loadEnv();

const INTERVAL_MS = 3000;

async function main() {
  const { runMigrations } = await import("../src/db/migrate");
  await runMigrations();
  const { seedIfEmpty } = await import("../src/lib/seed");
  await seedIfEmpty();
  const { scan, evaluate, expire } = await import("../src/lib/engine");
  const { processRefunds } = await import("../src/lib/refunds");
  const { dispatchDueWebhooks } = await import("../src/lib/webhooks");
  const { gasSponsor } = await import("../src/lib/hd");
  const { rpcUrl } = await import("../src/lib/chain");

  console.log(`[worker] watching Base Sepolia via ${rpcUrl()} every ${INTERVAL_MS / 1000}s; gas sponsor ${gasSponsor().address}`);

  let lastLog = 0;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      try {
        const { latest, latestTs, safe, found } = await scan();
        await evaluate(latest, safe);
        await expire(latestTs);
        if (found || Date.now() - lastLog > 60_000) {
          console.log(`[worker] block ${latest}${found ? ` · ${found} new transfer(s)` : ""}`);
          lastLog = Date.now();
        }
      } catch (e) {
        console.error("[worker] chain step failed:", (e as { shortMessage?: string }).shortMessage ?? e);
      }
      await processRefunds().catch((e) => console.error("[worker] refunds failed:", e));
      await dispatchDueWebhooks().catch((e) => console.error("[worker] webhooks failed:", e));
    } finally {
      running = false;
    }
  };
  await tick();
  setInterval(tick, INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
