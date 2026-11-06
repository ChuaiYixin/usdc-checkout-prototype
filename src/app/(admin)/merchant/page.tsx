import Link from "next/link";
import { and, eq, gte, inArray } from "drizzle-orm";
import { ArrowRight, Inbox } from "lucide-react";
import { db, schema } from "@/db/client";
import { balances, listOrders } from "@/lib/queries";
import { getMerchantSettings } from "@/lib/settings";
import { formatUsdc } from "@/lib/money";
import { PLATFORM_FEE_BPS } from "@/config/app";
import { GettingStarted } from "@/guide/GuideLauncher";
import { getT } from "@/i18n/server";
import { OrdersTable } from "./OrdersTable";

export default async function MerchantOverview() {
  const t = await getT();
  const [b, rows, settings, openEx] = await Promise.all([
    balances(),
    listOrders(8),
    getMerchantSettings(),
    db.select().from(schema.exceptions).where(eq(schema.exceptions.status, "open")),
  ]);
  const dayStart = Date.now() - 24 * 3600 * 1000;
  const today = await db
    .select()
    .from(schema.paymentRequests)
    .where(and(gte(schema.paymentRequests.succeededAt, dayStart), inArray(schema.paymentRequests.status, ["succeeded", "refunded"])));
  const todayVolume = today.reduce((s, p) => s + BigInt(p.amountMicros), 0n);
  const weekPaid = await db
    .select()
    .from(schema.paymentRequests)
    .where(and(gte(schema.paymentRequests.succeededAt, Date.now() - 7 * 86_400_000), inArray(schema.paymentRequests.status, ["succeeded", "refunded"])));
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (6 - i));
    const from = start.getTime();
    const rows = weekPaid.filter((p) => p.succeededAt! >= from && p.succeededAt! < from + 86_400_000);
    return { label: `${start.getMonth() + 1}/${start.getDate()}`, volume: rows.reduce((s, p) => s + Number(p.amountMicros) / 1e6, 0) };
  });
  const peak = Math.max(1, ...days.map((d) => d.volume));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("Overview")}</h1>
          <p className="text-sm text-slate-500">{t("USDC payments matched to your orders automatically.")}</p>
        </div>
        <Link href="/store" className="btn-secondary">
          {t("Open store checkout")} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <GettingStarted />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("Paid, last 24 h")} value={formatUsdc(todayVolume)} unit="USDC" sub={t(today.length === 1 ? "{n} payment" : "{n} payments", { n: today.length })} />
        <Stat label={t("Pending finality")} value={formatUsdc(b.pendingFinality)} unit="USDC" sub={t("Buyer sees success; funds not yet available")} />
        <Stat label={t("Available balance")} value={formatUsdc(b.available)} unit="USDC" sub={t("Net of {n}% fee", { n: (PLATFORM_FEE_BPS / 100).toFixed(2) })} highlight />
        <Stat label={t("Frozen — under review")} value={formatUsdc(b.frozen)} unit="USDC" sub={t("Held by compliance, not in your balance")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <p className="text-xs font-medium text-slate-500">{t("Volume, last 7 days")}</p>
          <div className="mt-4 flex h-36 items-end gap-2 sm:gap-3">
            {days.map((d, i) => (
              <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <div
                  className={`w-full origin-bottom animate-grow rounded-t-lg ${d.volume ? "bg-brand" : "bg-slate-100"}`}
                  style={{ height: `${Math.max(3, (d.volume / peak) * 100)}%`, animationDelay: `${i * 60}ms` }}
                  title={`${d.volume.toFixed(2)} USDC`}
                />
                <span className="text-[11px] tabular-nums text-slate-500">{d.label}</span>
              </div>
            ))}
          </div>
        </section>
        <div className="grid gap-4">
          <div className="card p-5">
            <p className="text-xs font-medium text-slate-500">{t("Settlement preference")}</p>
            <p className="mt-1 font-semibold">{t(settings.settlementPreference === "auto_sgd" ? "Convert to SGD daily and pay out to bank" : "Hold USDC")}</p>
            <Link href="/merchant/settlement" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              {t("Change or preview today's conversion")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <Link href="/ops/exceptions" className="card flex items-center gap-4 p-5 hover:-translate-y-0.5 hover:border-slate-300">
            <Inbox className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{openEx.length}</p>
              <p className="text-sm text-slate-500">{t(openEx.length === 1 ? "open exception" : "open exceptions")}</p>
            </div>
          </Link>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">{t("Recent orders")}</h2>
          <Link href="/merchant/orders" className="text-sm font-medium text-brand hover:underline">
            {t("View all")}
          </Link>
        </div>
        <OrdersTable rows={rows} />
      </section>
    </div>
  );
}

function Stat({ label, value, unit, sub, highlight }: { label: string; value: string; unit: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`card p-5 hover:-translate-y-0.5 hover:border-slate-300 ${highlight ? "border-brand/50 shadow-[0_0_30px_rgba(198,255,74,0.08)]" : ""}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${highlight ? "text-brand" : ""}`}>
        {value} <span className="text-sm font-medium text-slate-400">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}
