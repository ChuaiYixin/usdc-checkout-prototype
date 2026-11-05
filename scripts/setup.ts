// One-time local setup: creates .env with freshly generated TESTNET secrets, migrates and seeds the DB.
//   npm run setup
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { english, generateMnemonic, generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const envPath = path.resolve(".env");

function ensureEnv() {
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : fs.readFileSync(".env.example", "utf8");
  const fill = (key: string, value: () => string) => {
    const re = new RegExp(`^${key}=(.*)$`, "m");
    const m = text.match(re);
    if (m && m[1].trim()) return false;
    text = m ? text.replace(re, `${key}=${value()}`) : `${text}\n${key}=${value()}\n`;
    return true;
  };
  const created = [
    fill("PLATFORM_MNEMONIC", () => generateMnemonic(english)) && "PLATFORM_MNEMONIC",
    fill("TEST_BUYER_PRIVATE_KEY", () => generatePrivateKey()) && "TEST_BUYER_PRIVATE_KEY",
    fill("WEBHOOK_SECRET", () => randomBytes(24).toString("hex")) && "WEBHOOK_SECRET",
  ].filter(Boolean);
  fs.writeFileSync(envPath, text);
  return created;
}

async function main() {
  const created = ensureEnv();
  if (created.length) console.log(`✓ .env: generated ${created.join(", ")} (testnet only, git-ignored)`);
  else console.log("✓ .env already has secrets — left unchanged");

  const { loadEnv } = await import("../src/lib/env");
  loadEnv();
  const { runMigrations } = await import("../src/db/migrate");
  await runMigrations();
  const { seedIfEmpty } = await import("../src/lib/seed");
  await seedIfEmpty();
  console.log("✓ database migrated and seeded");

  const { gasSponsor } = await import("../src/lib/hd");
  console.log("\nGas sponsor wallet (needs a little Base Sepolia ETH to pay refund gas):");
  console.log("  " + gasSponsor().address);
  const buyerKey = process.env.TEST_BUYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (buyerKey) {
    console.log("Optional test buyer wallet (for `npm run pay:test`, needs Base Sepolia ETH + USDC):");
    console.log("  " + privateKeyToAccount(buyerKey).address);
  }
  console.log("\nNext: npm run dev  →  http://localhost:3000");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
