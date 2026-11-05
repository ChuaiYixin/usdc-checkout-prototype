"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gem, Loader2, Lock, ShieldAlert } from "lucide-react";
import { COUNTRIES, MERCHANT } from "@/config/app";
import { formatUsd } from "@/lib/money";
import { TestnetDisclaimer } from "@/components/ui";
import { UsdcIcon } from "@/components/icons";

export function LinkCheckout({
  link,
  restricted,
  enhanced,
}: {
  link: { id: string; title: string; amountCents: number; active: boolean };
  restricted: { code: string; reason: string }[];
  enhanced: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({ fullName: "", email: "", country: "US", residentialAddress: "", dateOfBirth: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = restricted.some((r) => r.code === f.country);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-[#faf8f5] px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-stone-800">
          <Gem className="h-5 w-5" /> <span className="font-serif text-xl">{MERCHANT.name}</span>
        </div>
        <form
          className="card space-y-4 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(`/api/links/${link.id}/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error);
              router.push(`/pay/${data.paymentRequestId}`);
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          <div>
            <p className="text-sm text-slate-500">Payment request</p>
            <h1 className="text-lg font-semibold">{link.title}</h1>
            <p className="mt-2 text-3xl font-bold tabular-nums">{formatUsd(link.amountCents)}</p>
            <p className="text-xs text-slate-500">= {(link.amountCents / 100).toFixed(2)} USDC</p>
          </div>
          {!link.active ? (
            <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">This link is no longer active.</p>
          ) : (
            <>
              <input className="input" placeholder="Full name" value={f.fullName} onChange={set("fullName")} required />
              <input className="input" type="email" placeholder="Email (for your receipt)" value={f.email} onChange={set("email")} required />
              <select className="input" value={f.country} onChange={set("country")}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              {enhanced && (
                <>
                  <input className="input" placeholder="Residential address" value={f.residentialAddress} onChange={set("residentialAddress")} required />
                  <input className="input" type="date" value={f.dateOfBirth} onChange={set("dateOfBirth")} required />
                  <p className="text-[11px] text-slate-500">Required above the travel-rule threshold of S$1,500 (MAS Notice PSN02, paragraph 13.6).</p>
                </>
              )}
              {blocked ? (
                <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Stablecoin payment isn&apos;t available for your region.
                </p>
              ) : (
                <button className="btn-primary w-full py-3" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsdcIcon className="h-5 w-5" mono />} Pay with USDC
                </button>
              )}
              {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            </>
          )}
          <p className="flex items-center justify-center gap-1 text-xs text-slate-400">
            <Lock className="h-3 w-3" /> Secure checkout
          </p>
        </form>
        <TestnetDisclaimer className="mt-6" />
      </div>
    </div>
  );
}
