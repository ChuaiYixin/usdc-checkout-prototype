import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { dbReady, getDb } from "./client";

export async function runMigrations() {
  await dbReady();
  await migrate(getDb(), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
}
