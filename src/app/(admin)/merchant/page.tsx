import Link from "next/link";
import { and, eq, gte, inArray } from "drizzle-orm";
import { ArrowRight, Inbox } from "lucide-react";
import { db, schema } from "@/db/client";
import { balances, listOrders } from "@/lib/queries";
import { getMerchantSettings } from "@/lib/settings";
import { formatUsdc } from "@/lib/money";
import { PLATFORM_FEE_BPS } from "@/config/app";
import { OrdersTable } from "./OrdersTable";

export default async function MerchantOverview() {
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

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-sm text-slate-500">USDC payments matched to your orders automatically.</p>
        </div>
        <Link href="/store" className="btn-secondary">
          Open store checkout <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Paid, last 24 h" value={formatUsdc(todayVolume)} unit="USDC" sub={`${today.length} payment${today.length === 1 ? "" : "s"}`} />
        <Stat label="Pending finality" value={formatUsdc(b.pendingFinality)} unit="USDC" sub="Buyer sees success; funds not yet available" />
        <Stat label="Available balance" value={formatUsdc(b.available)} unit="USDC" sub={`Net of ${(PLATFORM_FEE_BPS / 100).toFixed(2)}% fee (illustrative)`} highlight />
        <Stat label="Frozen — under review" value={formatUsdc(b.frozen)} unit="USDC" sub="Held by compliance, not in your balance" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <p className="text-xs font-medium text-slate-500">Settlement preference</p>
          <p className="mt-1 font-semibold">
            {settings.settlementPreference === "auto_sgd" ? "Convert to SGD daily and pay out to bank" : "Hold USDC"}
          </p>
          <Link href="/merchant/settlement" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            Change or preview today&apos;s conversion <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <Link href="/ops/exceptions" className="card flex items-center gap-4 p-5 transition hover:shadow-md">
          <Inbox className="h-8 w-8 text-amber-500" />
          <div>
            <p className="text-2xl font-bold">{openEx.length}</p>
            <p className="text-sm text-slate-500">open exception{openEx.length === 1 ? "" : "s"}</p>
          </div>
        </Link>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">Recent orders</h2>
          <Link href="/merchant/orders" className="text-sm font-medium text-brand hover:underline">
            View all
          </Link>
        </div>
        <OrdersTable rows={rows} />
      </section>
    </div>
  );
}

function Stat({ label, value, unit, sub, highlight }: { label: string; value: string; unit: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`card p-5 ${highlight ? "ring-2 ring-emerald-100" : ""}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">
        {value} <span className="text-sm font-medium text-slate-400">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}
