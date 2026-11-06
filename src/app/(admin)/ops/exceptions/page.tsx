import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { ACTIONS_BY_TYPE } from "@/lib/exceptions";
import { computeMetrics } from "@/lib/metrics";
import { formatUsdc, shortHex } from "@/lib/money";
import { Badge } from "@/components/ui";
import { DEFAULT_ACTIONS, exceptionLabel } from "@/components/status";
import { Time } from "@/components/time";
import { ActionButton } from "@/components/ActionButton";
import { getT } from "@/i18n/server";

const TONE: Record<string, string> = {
  underpaid: "amber",
  underpaid_expired: "amber",
  overpaid: "blue",
  late_payment: "amber",
  non_usdc: "red",
  screening_hit: "violet",
};

export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const t = await getT();
  const { view = "open" } = await searchParams;
  const rows = await db
    .select()
    .from(schema.exceptions)
    .where(view === "open" ? eq(schema.exceptions.status, "open") : inArray(schema.exceptions.status, ["resolved", "auto_resolved"]))
    .orderBy(desc(schema.exceptions.createdAt))
    .limit(100);
  const prIds = [...new Set(rows.map((r) => r.paymentRequestId))];
  const prs = prIds.length ? await db.select().from(schema.paymentRequests).where(inArray(schema.paymentRequests.id, prIds)) : [];
  const transferIds = rows.map((r) => r.transferId).filter((x): x is number => !!x);
  const transfers = transferIds.length ? await db.select().from(schema.transfers).where(inArray(schema.transfers.id, transferIds)) : [];
  const refunds = prIds.length ? await db.select().from(schema.refunds).where(inArray(schema.refunds.paymentRequestId, prIds)) : [];
  // Same figure as /ops/metrics: seeded history excluded, so the two pages can't disagree.
  const { exceptionRate } = await computeMetrics();
  const rate = (exceptionRate.value ?? 0) * 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("Exception queue")}</h1>
          <p className="text-sm text-slate-500">{t("On-chain transfers can't be reversed, so every exception type has a pre-agreed default.")}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">{t("Exception rate (queued arrivals ÷ all arrivals)")}</p>
          <p className="text-lg font-bold">
            {rate.toFixed(1)}% <span className="text-xs font-normal text-slate-400">{t("target < 2%")}</span>
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
        {["open", "resolved"].map((v) => (
          <Link key={v} href={`/ops/exceptions?view=${v}`} className={`rounded-lg px-4 py-1.5 font-medium capitalize ${view === v ? "bg-brand text-on-brand" : "text-slate-500 hover:text-ink"}`}>
            {t(v)}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {rows.map((ex) => {
          const pr = prs.find((p) => p.id === ex.paymentRequestId)!;
          const tr = transfers.find((x) => x.id === ex.transferId);
          const exRefunds = refunds.filter((r) => r.exceptionId === ex.id);
          const activeRefund = exRefunds.find((r) => r.status !== "failed");
          const failedRefund = exRefunds.find((r) => r.status === "failed");
          const amount =
            ex.type === "non_usdc" && tr
              ? `${formatUsdc(tr.amountOnchain)} ${tr.tokenSymbol}`
              : `${formatUsdc(BigInt(ex.amountOnchain) * BigInt(pr.divisor))} USDC`;
          return (
            <div key={ex.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[ex.type]}>{t(exceptionLabel(ex.type))}</Badge>
                    <Link href={`/merchant/orders/${ex.orderId}`} className="mono text-sm font-semibold text-brand hover:underline">
                      {ex.orderId}
                    </Link>
                    <span className="text-sm font-semibold">{amount}</span>
                    
                  </p>
                  <p className="text-xs text-slate-500">
                    {t("Opened")} <Time ms={ex.createdAt} />
                    {tr && (
                      <>
                        {" "}
                        · {t("from")} <span className="mono">{shortHex(tr.fromAddress)}</span>
                      </>
                    )}
                    {ex.note && <> · {t(ex.note)}</>}
                  </p>
                  <p className="text-sm text-slate-600">
                    <span className="text-slate-400">{t("Default handling:")}</span> {t(DEFAULT_ACTIONS[ex.defaultAction] ?? ex.defaultAction)}
                  </p>
                  {ex.resolution && <p className="text-sm text-emerald-700">✓ {t(ex.resolution)}</p>}
                  {exRefunds.map((r) => (
                    <p key={r.id} className="text-xs text-slate-500">
                      {t("Refund status: {status}", { status: t(r.status) })} {r.error && <span className="text-rose-600">— {t(r.error)}</span>}
                    </p>
                  ))}
                </div>
                {ex.status === "open" && failedRefund && !activeRefund && (
                  <ActionButton url={`/api/merchant/refunds/${failedRefund.id}/retry`} className="btn-primary btn-sm">
                    {t("Retry refund")}
                  </ActionButton>
                )}
                {ex.status === "open" && exRefunds.length === 0 && (
                  <div data-guide={`exception-${ex.orderId}`} className="flex flex-wrap gap-2">
                    {(ACTIONS_BY_TYPE[ex.type] ?? []).map((a) => (
                      <ActionButton
                        key={a.action}
                        url={`/api/ops/exceptions/${ex.id}`}
                        body={{ action: a.action }}
                        confirm={a.confirm ? t(a.confirm) : undefined}
                        className={a.primary ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                      >
                        {t(a.label)}
                      </ActionButton>
                    ))}
                    {ex.type === "underpaid" && <span className="text-xs text-slate-500">{t("Waiting for top-up until the request expires")}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="card p-8 text-center text-sm text-slate-500">{t("Nothing here. All clear.")}</p>}
      </div>
    </div>
  );
}
