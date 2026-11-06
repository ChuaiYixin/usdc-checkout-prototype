"use client";

import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/track";
import { useT } from "@/i18n/client";
import { useRouter } from "next/navigation";
import { CreditCard, Gem, Info, Loader2, Lock, Minus, Plus, ShieldAlert } from "lucide-react";
import { COUNTRIES, MERCHANT, PRODUCTS, SHIPPING_CENTS, TESTNET_AMOUNT_DIVISOR } from "@/config/app";
import { formatUsd } from "@/lib/money";
import { UsdcIcon } from "@/components/icons";

interface Props {
  restricted: { code: string; reason: string }[];
  travelRuleThresholdCents: number;
  travelRuleThresholdSgd: number;
  travelRuleSource: string;
}

export function CheckoutForm({ restricted, travelRuleThresholdCents, travelRuleThresholdSgd, travelRuleSource }: Props) {
  const router = useRouter();
  const t = useT();
  const product = PRODUCTS[0];
  const [qty, setQty] = useState(2);
  const [form, setForm] = useState({
    fullName: "Jordan Lee",
    email: "jordan.lee@example.com",
    country: "US",
    shippingAddress: "1450 Market St, Apt 7, San Francisco, CA 94103",
    residentialAddress: "",
    dateOfBirth: "",
  });
  const [method, setMethod] = useState<"usdc" | "card">("usdc");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Funnel top: anonymous per-browser id (storage may be unavailable — then a per-visit id).
  useEffect(() => {
    let sid = "";
    try {
      sid = localStorage.getItem("checkout_sid") ?? "";
      if (!sid) localStorage.setItem("checkout_sid", (sid = `cs_${Math.random().toString(36).slice(2, 12)}`));
    } catch {
      sid = `cs_${Math.random().toString(36).slice(2, 12)}`;
    }
    track(sid, "checkout_viewed");
  }, []);

  const subtotal = product.priceCents * qty;
  const total = subtotal + SHIPPING_CENTS;
  const regionBlock = useMemo(() => restricted.find((r) => r.code === form.country), [restricted, form.country]);
  const enhanced = total > travelRuleThresholdCents;
  const usdcAvailable = !regionBlock;
  const effectiveMethod = usdcAvailable ? method : "card";

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (effectiveMethod !== "usdc") return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity: qty, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      router.push(`/pay/${data.paymentRequestId}`);
    } catch (err) {
      setError(t(err instanceof Error ? err.message : String(err)));
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-stone-200 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Gem className="h-5 w-5 text-stone-700" />
            <span className="font-serif text-xl tracking-wide text-stone-900">{MERCHANT.name}</span>
            <span className="ml-2 hidden text-xs text-stone-500 sm:inline">{t(MERCHANT.tagline)}</span>
          </div>
          <span className="flex items-center gap-1 text-xs text-stone-500">
            <Lock className="h-3.5 w-3.5" /> {t("Secure checkout")}
          </span>
        </div>
      </header>

      <form onSubmit={placeOrder} className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-base font-semibold">{t("Contact & shipping")}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">{t("Full name")}</label>
                <input className="input" value={form.fullName} onChange={set("fullName")} required />
              </div>
              <div>
                <label className="label">{t("Email")}</label>
                <input className="input" type="email" value={form.email} onChange={set("email")} required />
              </div>
              <div className="sm:col-span-2">
                <label className="label">{t("Country / region")}</label>
                <select className="input" value={form.country} onChange={set("country")}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {t(c.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">{t("Shipping address")}</label>
                <input className="input" value={form.shippingAddress} onChange={set("shippingAddress")} required />
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-base font-semibold">{t("Payment method")}</h2>
            <div className="mt-4 space-y-3">
              {usdcAvailable ? (
                <PayOption
                  checked={effectiveMethod === "usdc"}
                  onChange={() => setMethod("usdc")}
                  icon={<UsdcIcon className="h-7 w-7" />}
                  title={t("Pay with USDC")}
                  subtitle={t("Base · no card fees, no chargebacks, settles in seconds")}
                  badge={t("New")}
                />
              ) : (
                // R16: restricted regions never see the USDC option.
                <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  {t("Stablecoin payment isn't available for your region.")}
                </div>
              )}
              <PayOption
                checked={effectiveMethod === "card"}
                onChange={() => setMethod("card")}
                icon={<CreditCard className="h-6 w-6 text-slate-600" />}
                title={t("Credit or debit card")}
                subtitle={t("Coming soon")}
                disabled
              />
            </div>

            {effectiveMethod === "usdc" && (
              <div className="mt-5 rounded-xl border border-line bg-slate-50 p-4">
                <div className="flex items-start gap-2 text-xs text-slate-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-700">
                      {t(enhanced ? "Additional payer information required" : "Payer information")}
                    </p>
                    <p className="mt-0.5">
                      {t("Regulated payment providers must pass payer details with crypto transfers (travel rule).")}{" "}
                      {enhanced
                        ? t("Orders above S${n} need a few more details.", { n: travelRuleThresholdSgd.toLocaleString() })
                        : t("Your name and country above are enough for this order.")}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">{t("Threshold source: {source}.", { source: t(travelRuleSource) })}</p>
                  </div>
                </div>
                {enhanced && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="label">{t("Residential address")}</label>
                      <input className="input" value={form.residentialAddress} onChange={set("residentialAddress")} required />
                    </div>
                    <div>
                      <label className="label">{t("Date of birth")}</label>
                      <input className="input" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} required />
                    </div>
                    <p className="self-end text-[11px] text-slate-500">
                      {t("You'll also sign a free message to prove you control the paying wallet.")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-6">
            <h2 className="text-base font-semibold">{t("Order summary")}</h2>
            <div className="mt-4 flex gap-4">
              <div className={`h-20 w-20 shrink-0 rounded-xl bg-gradient-to-br ${product.hue} grid place-items-center`}>
                <Gem className="h-8 w-8 text-stone-500/70" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{t(product.name)}</p>
                <p className="text-xs text-slate-500">{t(product.variant)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" className="btn-secondary btn-sm px-2" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label={t("Decrease")}>
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
                  <button type="button" className="btn-secondary btn-sm px-2" onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label={t("Increase")}>
                    <Plus className="h-3 w-3" />
                  </button>
                  <span className="ml-auto text-sm tabular-nums">{formatUsd(subtotal)}</span>
                </div>
              </div>
            </div>
            <dl className="mt-6 space-y-2 border-t border-line pt-4 text-sm">
              <Row label={t("Subtotal")} value={formatUsd(subtotal)} />
              <Row label={t("Shipping (Singapore → US)")} value={formatUsd(SHIPPING_CENTS)} />
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
                <dt>{t("Total")}</dt>
                <dd className="tabular-nums">{formatUsd(total)}</dd>
              </div>
            </dl>
            {effectiveMethod === "usdc" && (
              <p className="mt-2 text-right text-xs text-slate-500">
                = {(total / 100).toFixed(2)} USDC
                {TESTNET_AMOUNT_DIVISOR > 1 && ` ${t("({n} USDC on-chain)", { n: (total / 100 / TESTNET_AMOUNT_DIVISOR).toFixed(2) })}`}
              </p>
            )}
            {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            <button data-guide="store-pay" className="btn-primary mt-6 w-full py-3 text-base" disabled={submitting || effectiveMethod !== "usdc"}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsdcIcon className="h-5 w-5" mono />}
              {effectiveMethod === "usdc" ? t("Pay {n} USDC", { n: (total / 100).toFixed(2) }) : t("Card checkout coming soon")}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function PayOption(props: {
  checked: boolean;
  onChange: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
        props.checked ? "border-brand bg-brand/10 ring-4 ring-brand/15" : "border-line"
      } ${props.disabled ? "cursor-not-allowed opacity-50" : "hover:border-slate-300"}`}
    >
      <input type="radio" className="h-4 w-4 accent-[#c6ff4a]" checked={props.checked} onChange={props.onChange} disabled={props.disabled} />
      {props.icon}
      <div className="flex-1">
        <p className="text-sm font-semibold">
          {props.title}
          {props.badge && <span className="ml-2 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-on-brand">{props.badge}</span>}
        </p>
        <p className="text-xs text-slate-500">{props.subtitle}</p>
      </div>
    </label>
  );
}
