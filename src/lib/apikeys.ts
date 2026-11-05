// Merchant API keys (test mode). Only a SHA-256 hash is stored; the full key is shown once at creation.
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { randomId } from "./ids";

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function createApiKey(label: string) {
  const key = `sk_test_${randomBytes(20).toString("hex")}`;
  await db.insert(schema.apiKeys).values({ id: randomId("key", 6), label: label || "Default", keyHash: hash(key), prefix: key.slice(0, 14), createdAt: Date.now() });
  return key;
}

export async function authenticate(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key.startsWith("sk_test_")) return null;
  const row = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.keyHash, hash(key)) });
  if (row) await db.update(schema.apiKeys).set({ lastUsedAt: Date.now() }).where(eq(schema.apiKeys.id, row.id));
  return row ?? null;
}

export async function revokeApiKey(id: string) {
  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id));
}
