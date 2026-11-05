import { desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { COUNTRIES, SIMULATED_FX, TRAVEL_RULE, countryName } from "@/config/app";
import { travelRuleThresholdUsdCents } from "@/lib/compliance";
import { formatUsd } from "@/lib/money";
import { SimTag } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { PostForm } from "@/components/PostForm";

export default async function CompliancePage() {
  const risk = await db.select().from(schema.riskAddresses).orderBy(desc(schema.riskAddresses.addedAt));
  const regions = await db.select().from(schema.restrictedRegions);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compliance</h1>
        <p className="text-sm text-slate-500">
          Rules the compliance team can change without an engineer. Not legal advice; screening uses a local demo list, not a real provider.
        </p>
      </div>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          Address screening list (R15, R13) <SimTag>Demo list</SimTag>
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Payer addresses are screened before funds reach the merchant balance; refund destinations are screened again before sending.
          A hit freezes the payment for review and the buyer only sees &quot;processing&quot;. Tip: add your own test wallet here to demo a freeze.
        </p>
        <div className="mt-4">
          <PostForm url="/api/ops/compliance" extra={{ action: "add_risk" }} submitLabel="Add to list" fields={[{ name: "address", placeholder: "0x… address", mono: true }, { name: "label", placeholder: "Reason / label", width: "w-64" }]} />
        </div>
        <table className="mt-4 w-full">
          <tbody className="divide-y divide-line">
            {risk.map((r) => (
              <tr key={r.address}>
                <td className="td mono break-all">{r.address}</td>
                <td className="td text-slate-600">{r.label}</td>
                <td className="td text-right">
                  <ActionButton url="/api/ops/compliance" body={{ action: "remove_risk", address: r.address }}>
                    Remove
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 rounded-xl bg-slate-50 p-4">
          <p className="mb-2 text-xs font-semibold text-slate-500">Screen an address</p>
          <PostForm url="/api/ops/compliance" extra={{ action: "screen" }} submitLabel="Screen" fields={[{ name: "address", placeholder: "0x… address", mono: true }]} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">Buyer-location access (R16)</h2>
        <p className="mt-1 text-sm text-slate-500">Buyers shipping to these regions never see &quot;Pay with USDC&quot; at checkout (also enforced server-side).</p>
        <div className="mt-4">
          <PostForm
            url="/api/ops/compliance"
            extra={{ action: "add_region" }}
            submitLabel="Restrict region"
            fields={[
              { name: "code", placeholder: "", options: COUNTRIES.filter((c) => !regions.some((r) => r.code === c.code)).map((c) => ({ value: c.code, label: c.name })), width: "w-52" },
              { name: "reason", placeholder: "Reason (cite the rule)" },
            ]}
          />
        </div>
        <table className="mt-4 w-full">
          <tbody className="divide-y divide-line">
            {regions.map((r) => (
              <tr key={r.code}>
                <td className="td font-medium sm:w-48">
                  {countryName(r.code)} <span className="text-xs text-slate-400">{r.code}</span>
                </td>
                <td className="td text-slate-600">{r.reason}</td>
                <td className="td text-right">
                  <ActionButton url="/api/ops/compliance" body={{ action: "remove_region", code: r.code }}>
                    Remove
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">Travel rule tiers</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold">Basic — up to S${TRAVEL_RULE.enhancedThresholdSgd.toLocaleString()}</p>
            <p className="mt-1 text-slate-600">Originator name, country, email, paying wallet address.</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold">Enhanced — above S${TRAVEL_RULE.enhancedThresholdSgd.toLocaleString()}</p>
            <p className="mt-1 text-slate-600">Adds residential address and date of birth, plus a signed proof that the buyer controls the self-hosted wallet.</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Threshold is configurable (<span className="mono">src/config/app.ts</span>). Source: {TRAVEL_RULE.source}. At the simulated rate of{" "}
          {SIMULATED_FX.usdSgdRate} the threshold is about {formatUsd(travelRuleThresholdUsdCents())} per order.
        </p>
      </section>
    </div>
  );
}
