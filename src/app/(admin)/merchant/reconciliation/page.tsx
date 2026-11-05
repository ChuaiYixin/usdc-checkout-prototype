import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { reconcile, unsettled } from "@/lib/reconciliation";
import { CHAINS, txUrl } from "@/config/chains";
import { formatSgd, formatUsdc, shortHex } from "@/lib/money";
import { ExplorerLink, SimTag } from "@/components/ui";
import { FundsBadge } from "@/components/status";
import { getT } from "@/i18n/server";

export default async function ReconciliationPage() {
  const t = await getT();
  const days = await reconcile();
  const pending = await unsettled();
  const broken = days.filter((d) => d.issues.length || d.rows.some((r) => r.issues.length)).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("Reconciliation")}</h1>
          <p className="text-sm text-slate-500">{t("Daily three-way match: on-chain receipts ↔ FX conversion ↔ bank credit (R12). Breaks are flagged in red.")}</p>
        </div>
        <a href="/api/merchant/reconciliation/csv" className="btn-secondary">
          <Download className="h-4 w-4" /> {t("Export CSV")}
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <SimTag />
        {t("On-chain receipts for real testnet orders are live. FX conversion and bank credits are simulated; the three seeded days include two deliberate breaks to show how mismatches surface.")}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs text-slate-500">{t("Settlement batches")}</p>
          <p className="mt-1 text-2xl font-bold">{days.length}</p>
        </div>
        <div className={`card p-5 ${broken ? "ring-2 ring-rose-200" : ""}`}>
          <p className="text-xs text-slate-500">{t("Batches with breaks")}</p>
          <p className={`mt-1 text-2xl font-bold ${broken ? "text-rose-600" : "text-emerald-600"}`}>{broken}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500">{t("Awaiting next cut-off")}</p>
          <p className="mt-1 text-2xl font-bold">{pending.length}</p>
        </div>
      </div>

      {days.map((d) => {
        const bad = d.issues.length > 0 || d.rows.some((r) => r.issues.length);
        return (
          <section key={d.settlement.id} className={`card overflow-hidden ${bad ? "ring-2 ring-rose-200" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <div className="flex items-center gap-3">
                {bad ? <AlertTriangle className="h-5 w-5 text-rose-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                <h2 className="font-semibold">{d.settlement.date}</h2>
                <span className="mono text-xs text-slate-500">{d.settlement.id}</span>
              </div>
              <span className="text-xs text-slate-500">{t("Rate {rate} (simulated) · bank ref {ref}", { rate: d.settlement.fxRate.toFixed(4), ref: d.settlement.bankRef ?? "—" })}</span>
            </div>
            {d.issues.length > 0 && (
              <ul className="space-y-1 bg-rose-50 px-5 py-3 text-sm text-rose-700">
                {d.issues.map((i) => (
                  <li key={i}>● {t(i)}</li>
                ))}
              </ul>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/60">
                  <tr>
                    <th className="th">{t("Order")}</th>
                    <th className="th border-l border-line">{t("① On-chain received")}</th>
                    <th className="th text-right">{t("Fee")}</th>
                    <th className="th text-right">{t("Net USDC")}</th>
                    <th className="th border-l border-line text-right">{t("② FX → SGD")}</th>
                    <th className="th border-l border-line text-right">{t("③ Bank credit")}</th>
                    <th className="th">{t("Status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.rows.map((r) => {
                    const rowBad = r.issues.length > 0;
                    const bankBad = d.settlement.bankCreditCents !== d.settlement.sgdNetCents;
                    return (
                      <tr key={r.paymentRequestId} className={rowBad ? "bg-rose-50/70" : ""}>
                        <td className="td">
                          <Link href={`/merchant/orders/${r.orderId}`} className="mono font-semibold text-brand hover:underline">
                            {r.orderId}
                          </Link>
                          {r.simulated && <span className="ml-1.5"><SimTag /></span>}
                        </td>
                        <td className="td border-l border-line">
                          <span className="tabular-nums">{formatUsdc(r.onchainGrossMicros)} USDC</span>
                          <span className="block text-xs">
                            {r.txHash ? r.simulated ? <span className="mono text-slate-400">{shortHex(r.txHash)}</span> : <ExplorerLink href={txUrl(CHAINS["base-sepolia"], r.txHash)}>{shortHex(r.txHash)}</ExplorerLink> : null}
                          </span>
                        </td>
                        <td className="td text-right text-slate-500 tabular-nums">−{formatUsdc(r.feeMicros)}</td>
                        <td className="td text-right tabular-nums">{formatUsdc(r.netMicros)}</td>
                        <td className={`td border-l border-line text-right tabular-nums ${r.fxSgdCents === null ? "font-semibold text-rose-600" : ""}`}>
                          {r.fxSgdCents === null ? t("missing") : formatSgd(r.fxSgdCents)}
                        </td>
                        <td className={`td border-l border-line text-right tabular-nums ${r.bankSgdCents === null || bankBad ? "font-semibold text-rose-600" : ""}`}>
                          {r.bankSgdCents === null ? t("missing") : formatSgd(r.bankSgdCents)}
                        </td>
                        <td className="td">
                          {rowBad ? (
                            <span className="text-xs font-semibold text-rose-600">{r.issues.map((i) => t(i)).join("; ")}</span>
                          ) : bankBad ? (
                            <span className="text-xs font-semibold text-rose-600">{t("Batch bank credit short")}</span>
                          ) : (
                            <span className="text-xs font-semibold text-emerald-600">{t("Matched")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="td">{t("Total")}</td>
                    <td className="td border-l border-line" />
                    <td className="td" />
                    <td className={`td text-right tabular-nums ${d.totals.onchainNet !== d.totals.fxUsdcIn ? "text-rose-600" : ""}`}>
                      {formatUsdc(d.totals.onchainNet)}
                      <span className="block text-[11px] font-normal text-slate-500">{t("FX input {n}", { n: formatUsdc(d.totals.fxUsdcIn) })}</span>
                    </td>
                    <td className="td border-l border-line text-right tabular-nums">{formatSgd(d.totals.fxSgd)}</td>
                    <td className={`td border-l border-line text-right tabular-nums ${d.totals.bank !== d.totals.fxSgd ? "text-rose-600" : ""}`}>{formatSgd(d.totals.bank)}</td>
                    <td className="td" />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 font-semibold">{t("Received, awaiting next cut-off")}</h2>
        <table className="w-full">
          <tbody className="divide-y divide-line">
            {pending.map((p) => (
              <tr key={p.id}>
                <td className="td">
                  <Link href={`/merchant/orders/${p.orderId}`} className="mono font-semibold text-brand hover:underline">
                    {p.orderId}
                  </Link>
                </td>
                <td className="td tabular-nums">{formatUsdc(p.amountMicros)} USDC</td>
                <td className="td">
                  <FundsBadge status={p.fundsStatus} />
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td className="td text-slate-500">{t("Nothing pending.")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
