import { computeMetrics } from "@/lib/metrics";
import { funnelReport } from "@/lib/funnel";
import { SimTag } from "@/components/ui";
import { getT } from "@/i18n/server";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

export default async function MetricsPage() {
  const t = await getT();
  const secs = (v: number | null) => (v === null ? "—" : v < 120 ? t("{n} s", { n: v.toFixed(1) }) : t("{n} min", { n: (v / 60).toFixed(1) }));
  const [m, f] = await Promise.all([computeMetrics(), funnelReport()]);
  const cards = [
    {
      name: "Payment completion rate",
      value: pct(m.completion.value),
      n: t("{n} closed requests", { n: m.completion.n }),
      def: "Paid within the 15-min window ÷ requests whose window closed or that completed",
      target: "≥ merchant's card completion rate",
      why: "Is the buyer threshold too high?",
    },
    {
      name: "Exception rate",
      value: pct(m.exceptionRate.value),
      n: t("{n} arrivals · {s}% from the simulator", { n: m.exceptionRate.n, s: (m.exceptionRate.simulatedShare * 100).toFixed(0) }),
      def: "Arrivals entering the exception queue ÷ all arrivals",
      target: "< 2%",
      why: "Does the checkout prevent mistakes? (Inflated here on purpose by edge-case testing.)",
    },
    {
      name: "Payment → buyer success (median)",
      value: secs(m.medianToSuccess.value),
      n: t("{n} real testnet payments (current thresholds)", { n: m.medianToSuccess.n }),
      def: "Block time of first transfer → 'Payment successful'",
      target: "Seconds",
      why: "Checkout should feel as fast as a card",
    },
    {
      name: "Payment → funds available (median)",
      value: secs(m.medianToAvailable.value),
      n: t("{n} real testnet payments (current thresholds)", { n: m.medianToAvailable.n }),
      def: "Block time of first transfer → merchant funds available (L1-safe)",
      target: "< 15 min",
      why: "The 'fast' merchants care about",
    },
    {
      name: "Automatic match rate",
      value: pct(m.autoMatch.value),
      n: t("{n} succeeded payments", { n: m.autoMatch.n }),
      def: "Succeeded payments that needed no human action",
      target: "100% for normal payments (R7)",
      why: "Unique deposit address per request",
    },
    {
      name: "Auto-reconciliation rate",
      value: pct(m.autoReconciliation.value),
      n: t("{n} settled orders", { n: m.autoReconciliation.n }),
      def: "Orders matched across chain ↔ FX ↔ bank with no break",
      target: "> 98%",
      why: "Will finance keep using it? (Seeded history contains two deliberate breaks.)",
      sim: true,
    },
    {
      name: "Refund failure rate (guardrail)",
      value: pct(m.refundFailure.value),
      n: t("{n} finished refunds", { n: m.refundFailure.n }),
      def: "Failed ÷ finished refunds",
      target: "Must not rise",
      why: "Counter-metric",
    },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("PRD metrics")}</h1>
        <p className="text-sm text-slate-500">{t("Computed live from this prototype's records (seeded history excluded unless noted). Targets are portfolio assumptions from the PRD, not data.")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.name} className="card p-5">
            <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
              {t(c.name)} {c.sim && <SimTag>Simulated data</SimTag>}
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{c.value}</p>
            <p className="text-xs text-slate-400">{c.n}</p>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-slate-600">
              <div>
                <dt className="inline text-slate-400">{t("Definition:")} </dt>
                <dd className="inline">{t(c.def)}</dd>
              </div>
              <div>
                <dt className="inline text-slate-400">{t("Target:")} </dt>
                <dd className="inline">{t(c.target)}</dd>
              </div>
              <div>
                <dt className="inline text-slate-400">{t("Why:")} </dt>
                <dd className="inline">{t(c.why)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <section className="card p-6">
        <h2 className="font-semibold">{t("Checkout funnel")}</h2>
        <p className="mt-1 text-xs text-slate-500">{t("Decomposes the completion rate so the team knows where to work. Counts payment requests that reached at least each step (test traffic, so absolute numbers mean little).")}</p>
        <p className="mt-3 text-sm text-slate-600">
          {t("Checkout page views, tracked separately by browser session:")} <span className="font-medium tabular-nums">{f.steps[0].count}</span>
        </p>
        <div className="mt-3 space-y-2">
          {f.steps.slice(1).map((s, i, requestSteps) => {
            // Sessions and requests are different units, so the bars only compare request steps.
            const top = Math.max(requestSteps[0].count, 1);
            const prev = i === 0 ? 0 : requestSteps[i - 1].count;
            return (
              <div key={s.step} className="grid grid-cols-[minmax(0,220px)_1fr_120px] items-center gap-3 text-sm">
                <span className="truncate text-slate-600">{t(s.label)}</span>
                <div className="h-6 rounded-md bg-slate-100">
                  <div className="h-6 rounded-md bg-blue-600/80" style={{ width: `${Math.min(100, Math.max(2, (s.count / top) * 100))}%` }} />
                </div>
                <span className="text-right tabular-nums">
                  {s.count} {prev > 0 && <span className="text-xs text-slate-400">({Math.round((s.count / prev) * 100)}%)</span>}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-slate-500">{t("Top drop-off reasons")}</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {f.reasons.map(([r, n]) => (
                <li key={r} className="flex justify-between">
                  <span>{t(r)}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
              {f.reasons.length === 0 && <li className="text-slate-400">{t("None recorded yet")}</li>}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">{t("How buyers paid")}</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {f.modes.map(([m2, n]) => (
                <li key={m2} className="flex justify-between">
                  <span>{t(m2)}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
              {f.modes.length === 0 && <li className="text-slate-400">{t("None recorded yet")}</li>}
            </ul>
          </div>
        </div>
      </section>
      <p className="text-xs text-slate-500">{t("North star: weekly value of stablecoin orders successfully credited — it needs both \"buyer could pay\" and \"merchant got paid\".")}</p>
    </div>
  );
}
