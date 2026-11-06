import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { MERCHANT } from "@/config/app";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Logo } from "@/components/ui";
import { getT } from "@/i18n/server";
import { MobileNav, SideNav } from "./SideNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const hb = await getSetting("worker:heartbeat");
  const beat = hb ? (JSON.parse(hb) as { at: number; block: string; watching: number; backfilling?: number }) : null;
  const online = beat && Date.now() - beat.at < 60_000;
  const backfilling = online ? (beat.backfilling ?? 0) : 0;
  return (
    <div className="flex min-h-screen">
      <AutoRefresh />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="border-b border-line px-5 py-4">
          <Link href="/">
            <Logo />
          </Link>
          <p className="mt-3 text-sm font-medium leading-tight">{MERCHANT.name}</p>
          <p className="text-[11px] text-slate-500">{t("Merchant · Singapore")}</p>
        </div>
        <SideNav />
        <div className="mt-auto border-t border-line p-4 text-xs">
          <p className="flex items-center gap-2 font-medium">
            <span className={`h-2 w-2 rounded-full ${online ? "animate-pulse-dot bg-emerald-500 text-emerald-500" : "bg-rose-500"}`} />
            {t(online ? "Chain watcher online" : "Chain watcher offline")}
          </p>
          <p className="mt-1 text-slate-500">
            {beat ? t("Base Sepolia block #{block} · {n} addresses", { block: Number(beat.block).toLocaleString(), n: beat.watching }) : t("Start with npm run dev")}
          </p>
          {backfilling > 0 && <p className="mt-1 text-slate-500">{t("Rechecking {n} older blocks; new payments are seen right away", { n: backfilling.toLocaleString() })}</p>}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-line bg-surface/95 pt-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 pb-3">
            <Link href="/">
              <Logo />
            </Link>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`} />
              {t(online ? "Watcher online" : "Watcher offline")}
            </span>
          </div>
          <MobileNav />
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 md:px-6 md:pt-8">{children}</main>
      </div>
    </div>
  );
}
