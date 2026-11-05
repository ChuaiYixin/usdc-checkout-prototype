// Loads .env for processes Next.js doesn't start (worker, scripts). Next.js loads it on its own.
import * as nextEnv from "@next/env";

let loaded = false;
export function loadEnv() {
  if (loaded) return;
  const mod = nextEnv as unknown as { loadEnvConfig?: typeof nextEnv.loadEnvConfig; default?: typeof nextEnv };
  const load = mod.loadEnvConfig ?? mod.default!.loadEnvConfig;
  load(process.cwd(), process.env.NODE_ENV !== "production");
  loaded = true;
}
