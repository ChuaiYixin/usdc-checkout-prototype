import Link from "next/link";
import { desc } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { db, schema } from "@/db/client";
import { SCENARIOS } from "@/lib/simulator";
import { formatUsdc } from "@/lib/money";
import { PrStatusBadge } from "@/components/status";
import { Time } from "@/components/time";
import { ActionButton } from "@/components/ActionButton";
import { getT } from "@/i18n/server";

export default async function ScenariosPage() {
  const t = await getT();
  const prs = await db.select().from(schema.paymentRequests).orderBy(desc(schema.paymentRequests.createdAt)).limit(12);
  const now = Date.now();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            {t("Payment scenarios")}
          </h1>
          <p className="max-w-3xl text-sm text-slate-500">
            {t("Run a scenario against any open payment request and see how the platform responds, from the buyer's page to the exception queue.")}
          </p>
        </div>
        <span data-guide="scen-new" className="inline-flex">
        <ActionButton
          url="/api/checkout"
          body={{ quantity: 2, fullName: "Morgan Reyes", email: "morgan.reyes@example.com", country: "US", shippingAddress: "88 Harbor St, Seattle, WA 98101" }}
          className="btn-primary"
        >
          {t("New order (120 USD)")}
        </ActionButton>
        </span>
      </div>

      <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
        {SCENARIOS.map((s) => (
          <p key={s.key}>
            <b className="text-slate-700">{t(s.label)}:</b> {t(s.hint)}
          </p>
        ))}
        <p>
          <b className="text-slate-700">{t("Expire now")}:</b> {t("Closes the 15-minute window immediately, so you don't have to wait")}
        </p>
      </div>

      <div className="space-y-3">
        {prs.map((pr, i) => {
          const expired = now > pr.expiresAt;
          return (
            <div key={pr.id} className={`card p-4 ${i === 0 ? "animate-rise" : ""}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/merchant/orders/${pr.orderId}`} data-guide={i === 0 ? "scen-order" : undefined} className="mono font-semibold text-brand hover:underline">
                  {pr.orderId}
                </Link>
                <PrStatusBadge status={pr.status} />
                <span className="text-sm">{formatUsdc(pr.amountMicros)} USDC</span>
                <span className="text-xs text-slate-500">
                  {t(expired ? "expired" : "expires")} <Time ms={pr.expiresAt} />
                </span>
                                <Link href={`/pay/${pr.id}`} target="_blank" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  {t("Buyer view")} <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {SCENARIOS.map((s) => (
                  <span key={s.key} data-guide={i === 0 ? `scen-${s.key}` : undefined} className="inline-flex">
                    <ActionButton url="/api/ops/simulate" body={{ paymentRequestId: pr.id, scenario: s.key }}>
                      {t(s.label)}
                    </ActionButton>
                  </span>
                ))}
                {["awaiting_payment", "underpaid"].includes(pr.status) && (
                  <ActionButton url="/api/ops/simulate" body={{ paymentRequestId: pr.id, scenario: "expire_now" }}>
                    {t("Expire now")}
                  </ActionButton>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
