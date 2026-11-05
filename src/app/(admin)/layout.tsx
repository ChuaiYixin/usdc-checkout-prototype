import Link from "next/link";
import { Gem } from "lucide-react";
import { getSetting } from "@/lib/settings";
import { MERCHANT } from "@/config/app";
import { AutoRefresh } from "@/components/AutoRefresh";
import { TestnetDisclaimer } from "@/components/ui";
import { MobileNav, SideNav } from "./SideNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const hb = await getSetting("worker:heartbeat");
  const beat = hb ? (JSON.parse(hb) as { at: number; block: string; watching: number; behind?: number }) : null;
  const online = beat && Date.now() - beat.at < 60_000;
  const catchingUp = online && (beat.behind ?? 0) > 300;
  return (
    <div className="flex min-h-screen">
      <AutoRefresh />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white md:flex">
        <Link href="/" className="flex items-center gap-2 border-b border-line px-5 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-900 text-white">
            <Gem className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight">{MERCHANT.name}</span>
            <span className="block text-[11px] text-slate-500">Merchant · Singapore</span>
          </span>
        </Link>
        <SideNav />
        <div className="mt-auto border-t border-line p-4 text-xs">
          <p className="flex items-center gap-2 font-medium">
            <span className={`h-2 w-2 rounded-full ${catchingUp ? "bg-amber-500" : online ? "bg-emerald-500" : "bg-rose-500"}`} />
            Chain watcher {catchingUp ? "catching up" : online ? "online" : "offline"}
          </p>
          <p className="mt-1 text-slate-500">
            {beat ? (
              catchingUp ? (
                <>{beat.behind!.toLocaleString()} blocks behind — no blocks are skipped</>
              ) : (
                <>
                  Base Sepolia block #{Number(beat.block).toLocaleString()} · {beat.watching} addresses
                </>
              )
            ) : (
              "Start with npm run dev"
            )}
          </p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800 md:px-6">
          Testnet prototype · Base Sepolia · fictional merchant and PSP · FX and bank legs are simulated
        </div>
        <header className="sticky top-0 z-10 border-b border-line bg-white/95 pt-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 pb-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
              <Gem className="h-4 w-4" /> {MERCHANT.name}
            </Link>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`} />
              Watcher {online ? "online" : "offline"}
            </span>
          </div>
          <MobileNav />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">{children}</main>
        <TestnetDisclaimer className="pb-8" />
      </div>
    </div>
  );
}
