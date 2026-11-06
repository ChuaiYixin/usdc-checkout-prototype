import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

// One SQLite file shared by the Next.js server and the chain worker (two processes). WAL + busy_timeout
// lets them write concurrently without "database is locked" errors.

type Db = LibSQLDatabase<typeof schema>;

const g = globalThis as unknown as { __db?: Db; __dbClient?: Client; __dbReady?: Promise<void> };

function databaseUrl() {
  const url = process.env.DATABASE_URL || "file:data/app.db";
  if (url.startsWith("file:")) {
    const file = path.resolve(/* turbopackIgnore: true */ process.cwd(), url.slice(5));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    return "file:" + file;
  }
  return url;
}

export function getClient(): Client {
  if (!g.__dbClient) {
    // `timeout` rather than a PRAGMA: the client can open new connections, and a PRAGMA only reaches the current one.
    g.__dbClient = createClient({ url: databaseUrl(), timeout: 8000 });
    g.__dbReady = (async () => {
      await g.__dbClient!.execute("PRAGMA journal_mode = WAL");
    })();
  }
  return g.__dbClient;
}

export function getDb(): Db {
  if (!g.__db) g.__db = drizzle(getClient(), { schema });
  return g.__db;
}

export async function dbReady() {
  getClient();
  await g.__dbReady;
}

export const db = new Proxy({} as Db, {
  get(_t, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export { schema };
