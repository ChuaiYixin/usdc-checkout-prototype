import Link from "next/link";
import { TestnetDisclaimer } from "@/components/ui";
import { TESTNET_AMOUNT_DIVISOR } from "@/config/app";
import { GuideHome } from "@/guide/GuideHome";
import { getT } from "@/i18n/server";
import { getSetting } from "@/lib/settings";

const SHORTCUTS = [
  { href: "/store", label: "Buyer checkout" },
  { href: "/merchant", label: "Merchant dashboard" },
  { href: "/ops/exceptions", label: "Platform ops" },
];

export default async function Home() {
  const t = await getT();
  const hb = await getSetting("worker:heartbeat");
  const watcherOnline = !!hb && Date.now() - (JSON.parse(hb) as { at: number }).at < 60_000;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-semibold text-brand">{t("Portfolio prototype · Stablecoin payments")}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t("Cross-border USDC checkout for a Singapore merchant")}</h1>
      <p className="mt-3 text-slate-600">
        {t("Three parts take you through one payment from checkout to the bank. Follow the steps: most move on by themselves as soon as the app sees them happen. The payment runs on the real Base Sepolia testnet; FX and banking are simulated and labelled as such.")}
      </p>

      {!watcherOnline && <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{t("The chain watcher isn't running, so payments won't be detected. Start it with npm run dev.")}</p>}

      <div className="mt-8">
        <GuideHome />
      </div>

      <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
        <span>{t("Go straight to:")}</span>
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href} className="font-medium text-brand hover:underline">
            {t(s.label)}
          </Link>
        ))}
      </p>

      {TESTNET_AMOUNT_DIVISOR > 1 && (
        <p className="mt-6 text-xs text-slate-500">
          {t("Testnet amount scaling is on: orders are priced normally, but the wallet sends 1/{n} of the amount in test USDC, because Circle's faucet gives 20 USDC per address every 2 hours.", {
            n: TESTNET_AMOUNT_DIVISOR,
          })}
        </p>
      )}
      <TestnetDisclaimer className="mt-8" />
    </main>
  );
}
