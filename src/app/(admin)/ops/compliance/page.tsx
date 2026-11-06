import { desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { COUNTRIES, SIMULATED_FX, TRAVEL_RULE, countryName } from "@/config/app";
import { travelRuleThresholdUsdCents } from "@/lib/compliance";
import { formatUsd } from "@/lib/money";
import { ActionButton } from "@/components/ActionButton";
import { PostForm } from "@/components/PostForm";
import { getT } from "@/i18n/server";

export default async function CompliancePage() {
  const t = await getT();
  const risk = await db.select().from(schema.riskAddresses).orderBy(desc(schema.riskAddresses.addedAt));
  const regions = await db.select().from(schema.restrictedRegions);
  const threshold = TRAVEL_RULE.enhancedThresholdSgd.toLocaleString();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("Compliance")}</h1>
        <p className="text-sm text-slate-500">{t("Rules the compliance team can change without an engineer.")}</p>
      </div>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          {t("Address screening list")} 
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {t("Payer addresses are screened before funds reach the merchant balance; refund destinations are screened again before sending. A hit freezes the payment for review and the buyer only sees \"processing\".")}
        </p>
        <div className="mt-4">
          <PostForm
            url="/api/ops/compliance"
            extra={{ action: "add_risk" }}
            submitLabel={t("Add to list")}
            fields={[
              { name: "address", placeholder: t("0x… address"), mono: true },
              { name: "label", placeholder: t("Reason / label"), width: "w-64" },
            ]}
          />
        </div>
        <table className="mt-4 w-full">
          <tbody className="divide-y divide-line">
            {risk.map((r) => (
              <tr key={r.address}>
                <td className="td mono break-all">{r.address}</td>
                <td className="td text-slate-600">{t(r.label)}</td>
                <td className="td text-right">
                  <ActionButton url="/api/ops/compliance" body={{ action: "remove_risk", address: r.address }}>
                    {t("Remove")}
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 rounded-xl bg-slate-50 p-4">
          <p className="mb-2 text-xs font-semibold text-slate-500">{t("Screen an address")}</p>
          <PostForm url="/api/ops/compliance" extra={{ action: "screen" }} submitLabel={t("Screen")} fields={[{ name: "address", placeholder: t("0x… address"), mono: true }]} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">{t("Buyer-location access")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("Buyers shipping to these regions never see \"Pay with USDC\" at checkout (also enforced server-side).")}</p>
        <div className="mt-4">
          <PostForm
            url="/api/ops/compliance"
            extra={{ action: "add_region" }}
            submitLabel={t("Restrict region")}
            fields={[
              { name: "code", placeholder: "", options: COUNTRIES.filter((c) => !regions.some((r) => r.code === c.code)).map((c) => ({ value: c.code, label: t(c.name) })), width: "w-52" },
              { name: "reason", placeholder: t("Reason (cite the rule)") },
            ]}
          />
        </div>
        <table className="mt-4 w-full">
          <tbody className="divide-y divide-line">
            {regions.map((r) => (
              <tr key={r.code}>
                <td className="td font-medium sm:w-48">
                  {t(countryName(r.code))} <span className="text-xs text-slate-400">{r.code}</span>
                </td>
                <td className="td text-slate-600">{t(r.reason)}</td>
                <td className="td text-right">
                  <ActionButton url="/api/ops/compliance" body={{ action: "remove_region", code: r.code }}>
                    {t("Remove")}
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">{t("Travel rule tiers")}</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold">{t("Basic — up to S${n}", { n: threshold })}</p>
            <p className="mt-1 text-slate-600">{t("Originator name, country, email, paying wallet address.")}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold">{t("Enhanced — above S${n}", { n: threshold })}</p>
            <p className="mt-1 text-slate-600">{t("Adds residential address and date of birth, plus a signed proof that the buyer controls the self-hosted wallet.")}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {t("Source: {source}. At the current rate of {rate} the threshold is about {usd} per order.", {
            source: t(TRAVEL_RULE.source),
            rate: SIMULATED_FX.usdSgdRate,
            usd: formatUsd(travelRuleThresholdUsdCents()),
          })}
        </p>
      </section>
    </div>
  );
}
