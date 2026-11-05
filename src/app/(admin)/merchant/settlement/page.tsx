import Link from "next/link";
import { desc } from "drizzle-orm";
import { CheckCircle2, Circle } from "lucide-react";
import { db, schema } from "@/db/client";
import { getMerchantSettings } from "@/lib/settings";
import { DEMO_2FA_CODE, availableToSettle, fxQuote, listSettlements } from "@/lib/settlement";
import { formatSgd, formatUsdc, shortHex } from "@/lib/money";
import { MERCHANT, SIMULATED_FX } from "@/config/app";
import { SimTag } from "@/components/ui";
import { Time } from "@/components/time";
import { ActionButton } from "@/components/ActionButton";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n/core";
import { WhitelistForm, WithdrawForm } from "./WalletForms";

export default async function SettlementPage() {
  const t = await getT();
  const settings = await getMerchantSettings();
  const { items, net, withdrawn, holdable } = await availableToSettle();
  const q = fxQuote(net);
  const history = await listSettlements();
  const wallets = await db.select().from(schema.whitelistWallets);
  const wds = await db.select().from(schema.withdrawals).orderBy(desc(schema.withdrawals.createdAt));
  const auto = settings.settlementPreference === "auto_sgd";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("Settlement")}</h1>
        <p className="text-sm text-slate-500">{t("Choose what you receive. Rates and fees are shown before anything converts (R10).")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PrefCard
          t={t}
          active={auto}
          title={t("Convert to SGD daily")}
          body={t("Every day at {cutoff}, available USDC is converted and paid to {bank}.", { cutoff: t(SIMULATED_FX.cutoffLabel), bank: t(MERCHANT.bankLabel) })}
          tag={t("Default")}
          pref="auto_sgd"
        />
        <PrefCard t={t} active={!auto} title={t("Hold USDC")} body={t("Keep your balance in USDC and withdraw to your own whitelisted wallets when you choose.")} pref="hold_usdc" />
      </div>

      {auto ? (
        <section className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                {t("Today's conversion preview")} <SimTag />
              </h2>
              <p className="mt-1 text-sm text-slate-500">{t(items.length === 1 ? "{n} payment at finality, net of platform fee." : "{n} payments at finality, net of platform fee.", { n: items.length })}</p>
            </div>
            <ActionButton url="/api/merchant/settlement" body={{ action: "run" }} className="btn-primary btn-sm">
              {t("Run today's settlement now (simulated)")}
            </ActionButton>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-4">
            <Metric label={t("USDC to convert")} value={`${formatUsdc(net)} USDC`} />
            <Metric label={t("Rate USD/SGD (simulated)")} value={SIMULATED_FX.usdSgdRate.toFixed(4)} />
            <Metric label={t("FX spread {n}% (illustrative)", { n: (SIMULATED_FX.spreadBps / 100).toFixed(2) })} value={`− ${formatSgd(q.feeSgdCents)}`} />
            <Metric label={t("You receive")} value={formatSgd(q.netSgdCents)} strong />
          </dl>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card p-6">
            <p className="text-xs font-medium text-slate-500">{t("USDC balance available")}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {formatUsdc(holdable)} <span className="text-base text-slate-400">USDC</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">{t("{n} USDC withdrawn so far", { n: formatUsdc(withdrawn) })}</p>
          </section>
          <section className="card p-6">
            <h3 className="mb-3 text-sm font-semibold">{t("Whitelisted wallets (R11)")}</h3>
            <ul className="mb-4 space-y-1 text-xs">
              {wallets.map((w) => (
                <li key={w.address} className="flex justify-between">
                  <span>{w.label}</span>
                  <span className="mono text-slate-500">{shortHex(w.address)}</span>
                </li>
              ))}
            </ul>
            <WhitelistForm demoCode={DEMO_2FA_CODE} />
          </section>
          <section className="card p-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              {t("Withdraw USDC")} <SimTag />
            </h3>
            <WithdrawForm wallets={wallets.map((w) => ({ address: w.address, label: w.label }))} />
            <ul className="mt-4 space-y-1 text-xs text-slate-500">
              {wds.map((w) => (
                <li key={w.id}>
                  {formatUsdc(w.amountMicros)} USDC → {shortHex(w.toAddress)} · {t(w.status)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            {t("Settlement history")} <SimTag />
          </h2>
          <Link href="/merchant/reconciliation" className="text-sm font-medium text-brand hover:underline">
            {t("Reconcile")} →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/60">
              <tr>
                <th className="th">{t("Batch")}</th>
                <th className="th">{t("Date (SGT)")}</th>
                <th className="th text-right">{t("USDC in")}</th>
                <th className="th text-right">{t("Rate")}</th>
                <th className="th text-right">{t("FX fee")}</th>
                <th className="th text-right">{t("SGD out")}</th>
                <th className="th">{t("Bank credit")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {history.map((s) => (
                <tr key={s.id}>
                  <td className="td mono">{s.id}</td>
                  <td className="td">{s.date}</td>
                  <td className="td text-right tabular-nums">{formatUsdc(s.usdcMicros)}</td>
                  <td className="td text-right tabular-nums">{s.fxRate.toFixed(4)}</td>
                  <td className="td text-right tabular-nums">{formatSgd(s.fxFeeSgdCents)}</td>
                  <td className="td text-right font-semibold tabular-nums">{formatSgd(s.sgdNetCents)}</td>
                  <td className="td text-xs text-slate-500">
                    {s.bankRef} · <Time ms={s.bankCreditedAt} />
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="td text-slate-500" colSpan={7}>
                    {t("No settlements yet.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PrefCard({ t, active, title, body, tag, pref }: { t: TFn; active: boolean; title: string; body: string; tag?: string; pref: string }) {
  return (
    <div className={`card p-5 ${active ? "ring-2 ring-brand" : ""}`}>
      <div className="flex items-start gap-3">
        {active ? <CheckCircle2 className="h-5 w-5 text-brand" /> : <Circle className="h-5 w-5 text-slate-300" />}
        <div className="flex-1">
          <p className="font-semibold">
            {title} {tag && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{tag}</span>}
          </p>
          <p className="mt-1 text-sm text-slate-500">{body}</p>
          {!active && (
            <div className="mt-3">
              <ActionButton url="/api/merchant/settings" body={{ settlementPreference: pref }}>
                {t("Switch to this")}
              </ActionButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 tabular-nums ${strong ? "text-xl font-bold text-emerald-700" : "text-lg font-semibold"}`}>{value}</dd>
    </div>
  );
}
