import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { ACTIONS_BY_TYPE } from "@/lib/exceptions";
import { computeMetrics } from "@/lib/metrics";
import { formatUsdc, shortHex } from "@/lib/money";
import { Badge, SimTag } from "@/components/ui";
import { DEFAULT_ACTIONS, exceptionLabel } from "@/components/status";
import { Time } from "@/components/time";
import { ActionButton } from "@/components/ActionButton";

const TONE: Record<string, string> = {
  underpaid: "amber",
  underpaid_expired: "amber",
  overpaid: "blue",
  late_payment: "amber",
  non_usdc: "red",
  screening_hit: "violet",
};

export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
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
          <h1 className="text-2xl font-bold tracking-tight">Exception queue</h1>
          <p className="text-sm text-slate-500">On-chain transfers can&apos;t be reversed, so every exception type has a pre-agreed default (R14).</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Exception rate (queued arrivals ÷ all arrivals, seeded history excluded)</p>
          <p className="text-lg font-bold">
            {rate.toFixed(1)}% <span className="text-xs font-normal text-slate-400">target &lt; 2% · inflated by simulator tests</span>
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
        {["open", "resolved"].map((v) => (
          <Link key={v} href={`/ops/exceptions?view=${v}`} className={`rounded-lg px-4 py-1.5 font-medium capitalize ${view === v ? "bg-white shadow-sm" : "text-slate-500"}`}>
            {v}
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        {rows.map((ex) => {
          const pr = prs.find((p) => p.id === ex.paymentRequestId)!;
          const t = transfers.find((x) => x.id === ex.transferId);
          const exRefunds = refunds.filter((r) => r.exceptionId === ex.id);
          const activeRefund = exRefunds.find((r) => r.status !== "failed");
          const failedRefund = exRefunds.find((r) => r.status === "failed");
          const amount =
            ex.type === "non_usdc" && t
              ? `${formatUsdc(t.amountOnchain)} ${t.tokenSymbol}`
              : `${formatUsdc(BigInt(ex.amountOnchain) * BigInt(pr.divisor))} USDC`;
          return (
            <div key={ex.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[ex.type]}>{exceptionLabel(ex.type)}</Badge>
                    <Link href={`/merchant/orders/${ex.orderId}`} className="mono text-sm font-semibold text-brand hover:underline">
                      {ex.orderId}
                    </Link>
                    <span className="text-sm font-semibold">{amount}</span>
                    {pr.simulated ? <SimTag /> : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    Opened <Time ms={ex.createdAt} />
                    {t && (
                      <>
                        {" "}
                        · from <span className="mono">{shortHex(t.fromAddress)}</span>
                      </>
                    )}
                    {ex.note && <> · {ex.note}</>}
                  </p>
                  <p className="text-sm text-slate-600">
                    <span className="text-slate-400">Default handling:</span> {DEFAULT_ACTIONS[ex.defaultAction] ?? ex.defaultAction}
                  </p>
                  {ex.resolution && <p className="text-sm text-emerald-700">✓ {ex.resolution}</p>}
                  {exRefunds.map((r) => (
                    <p key={r.id} className="text-xs text-slate-500">
                      Refund {r.status} {r.error && <span className="text-rose-600">— {r.error}</span>}
                    </p>
                  ))}
                </div>
                {ex.status === "open" && failedRefund && !activeRefund && (
                  <ActionButton url={`/api/merchant/refunds/${failedRefund.id}/retry`} className="btn-primary btn-sm">
                    Retry refund
                  </ActionButton>
                )}
                {ex.status === "open" && exRefunds.length === 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(ACTIONS_BY_TYPE[ex.type] ?? []).map((a) => (
                      <ActionButton
                        key={a.action}
                        url={`/api/ops/exceptions/${ex.id}`}
                        body={{ action: a.action }}
                        confirm={a.confirm}
                        className={a.primary ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                      >
                        {a.label}
                      </ActionButton>
                    ))}
                    {ex.type === "underpaid" && <span className="text-xs text-slate-500">Waiting for top-up until the request expires</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="card p-8 text-center text-sm text-slate-500">Nothing here. Use the Simulator to create edge cases.</p>}
      </div>
    </div>
  );
}
