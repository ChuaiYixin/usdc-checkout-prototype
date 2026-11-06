import Link from "next/link";
import { ArrowRight, ArrowUpRight, Banknote, Fingerprint, Globe2, Inbox, Layers3, RotateCcw, ScanSearch, ShieldCheck, Webhook, Zap } from "lucide-react";
import { Logo } from "@/components/ui";
import { Reveal } from "@/components/Reveal";
import { PLATFORM_FEE_BPS, SIMULATED_FX, TRAVEL_RULE } from "@/config/app";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n/core";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#platform", label: "Platform" },
  { href: "#compliance", label: "Compliance" },
  { href: "#pricing", label: "Pricing" },
];

const JOURNEY = [
  { title: "Checkout", body: "Your buyer chooses USDC and signs once. No gas token, no copied address." },
  { title: "Confirmation", body: "The payment is seen on-chain and the buyer gets an answer in seconds." },
  { title: "Matching", body: "A deposit address made for each order means every transfer finds its order by itself." },
  { title: "Settlement", body: "Available USDC converts to SGD at the daily cut-off and goes to your bank account." },
  { title: "Reconciliation", body: "Chain, FX and bank lines up every day. Anything off is flagged in red." },
];

const FEATURES = [
  { icon: Zap, title: "Gasless checkout", body: "Buyers holding USDC but no ETH can still pay. We submit the transaction and cover the network fee, only for the exact amount to the exact address." },
  { icon: Fingerprint, title: "One address per order", body: "No memos and no special amounts. The address alone says which order a payment belongs to." },
  { icon: Inbox, title: "An exception queue with defaults", body: "Underpaid, overpaid, late or the wrong token: each case has a rule decided in advance, and a person steps in only where one is needed." },
  { icon: RotateCcw, title: "Refunds that can't be redirected", body: "Money only goes back to the address that paid, re-screened before it's sent." },
  { icon: Webhook, title: "Webhooks that survive outages", body: "Every status change is signed and retried until your server acknowledges it." },
  { icon: Layers3, title: "Three-way reconciliation", body: "On-chain receipts, FX conversion and bank credits matched daily, with a CSV for your accountant." },
];

const COMPLIANCE = [
  { icon: ScanSearch, title: "Address screening", body: "Payers are screened before funds reach your balance. A hit freezes the payment for review." },
  { icon: Globe2, title: "Buyer-location access", body: "Choose where USDC is offered. Restricted regions never see the option, and the server enforces it too." },
  { icon: ShieldCheck, title: "Travel rule by tier", body: "Payer details are collected at checkout, with more above S${n} per MAS Notice PSN02." },
];

export default async function Home() {
  const t = await getT();
  return (
    <div className="relative overflow-x-clip">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[780px]" />
      <div className="pointer-events-none absolute left-1/2 top-[-260px] h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-brand/15 blur-[130px]" />

      <header className="sticky top-0 z-40 border-b border-transparent backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-500 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-ink">
                {t(n.label)}
              </a>
            ))}
          </nav>
          <Link href="/merchant" className="btn-secondary btn-sm">
            {t("Open dashboard")} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-24">
          <div>
            <p className="inline-flex animate-rise items-center gap-2 rounded-full border border-slate-300 bg-surface/70 px-3 py-1 text-xs text-slate-600">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand text-brand" />
              {t("USDC payments for Singapore merchants")}
            </p>
            <h1 className="mt-6 animate-rise text-5xl font-semibold leading-[1.04] tracking-tight [animation-delay:80ms] sm:text-6xl lg:text-7xl">
              {t("Get paid in USDC.")}
              <br />
              <span className="text-brand">{t("Bank it in SGD.")}</span>
            </h1>
            <p className="mt-6 max-w-xl animate-rise text-lg leading-relaxed text-slate-600 [animation-delay:160ms]">
              {t("Buyers anywhere pay from their own wallet with one signature. Every payment matches its order by itself, and your balance reaches your Singapore bank account every day.")}
            </p>
            <div className="mt-8 flex animate-rise flex-wrap items-center gap-3 [animation-delay:240ms]">
              <Link href="/merchant" className="btn-primary px-6 py-3.5 text-base">
                {t("Try it now")} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/store" className="btn-secondary px-6 py-3.5 text-base">
                {t("Try the checkout")}
              </Link>
            </div>
          </div>
          <div className="animate-rise [animation-delay:200ms]">
            <LivePayment t={t} />
          </div>
        </section>

        <section className="border-y border-line bg-surface/60">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-5 lg:grid-cols-4">
            {[
              ["~3 s", "Buyer sees success"],
              ["< 5 min", "Funds available to you"],
              ["0", "Gas tokens your buyer needs"],
              [`${(PLATFORM_FEE_BPS / 100).toFixed(2)}%`, "Per payment, no chargebacks"],
            ].map(([value, label], i) => (
              <Reveal key={label} delay={i * 70} className="py-8 sm:px-4">
                <dd className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{value}</dd>
                <dt className="mt-1 text-sm text-slate-500">{t(label)}</dt>
              </Reveal>
            ))}
          </dl>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 lg:py-28">
          <Reveal>
            <Heading eyebrow={t("How it works")} title={t("From a buyer's wallet to your bank statement")} />
          </Reveal>
          <ol className="relative mt-14 grid gap-8 md:grid-cols-5 md:gap-5">
            <div aria-hidden className="absolute left-0 right-0 top-4 hidden h-px overflow-hidden bg-line md:block">
              <span className="absolute top-0 h-px w-1/4 animate-beam bg-gradient-to-r from-transparent via-brand to-transparent" />
            </div>
            {JOURNEY.map((j, i) => (
              <Reveal key={j.title} delay={i * 90}>
                <li className="relative list-none">
                  <span className="relative grid h-8 w-8 place-items-center rounded-full border border-brand/60 bg-canvas text-xs font-bold text-brand">{i + 1}</span>
                  <h3 className="mt-4 font-semibold">{t(j.title)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t(j.body)}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        <section id="platform" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 lg:pb-28">
          <Reveal>
            <Heading eyebrow={t("Platform")} title={t("Built for the parts that go wrong")} />
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 80}>
                <article className="card group h-full p-6 hover:-translate-y-1 hover:border-brand/50 hover:shadow-[0_0_40px_rgba(198,255,74,0.08)]">
                  <f.icon className="h-6 w-6 text-brand transition duration-300 group-hover:scale-110" />
                  <h3 className="mt-4 font-semibold">{t(f.title)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{t(f.body)}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="compliance" className="scroll-mt-20 border-y border-line bg-surface/60">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
            <Reveal>
              <Heading eyebrow={t("Compliance")} title={t("In the flow, not bolted on")} />
              <p className="mt-4 text-slate-500">{t("Rules your compliance team can change without an engineer, applied before money reaches your balance.")}</p>
            </Reveal>
            <div className="space-y-3">
              {COMPLIANCE.map((c, i) => (
                <Reveal key={c.title} delay={i * 80}>
                  <div className="flex gap-4 rounded-2xl border border-line bg-canvas/70 p-5">
                    <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                    <div>
                      <h3 className="font-semibold">{t(c.title)}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">{t(c.body, { n: TRAVEL_RULE.enhancedThresholdSgd.toLocaleString() })}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 lg:py-28">
          <Reveal>
            <Heading eyebrow={t("Pricing")} title={t("Two numbers, shown before anything converts")} />
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              [`${(PLATFORM_FEE_BPS / 100).toFixed(2)}%`, "Platform fee", "Per successful payment."],
              [`${(SIMULATED_FX.spreadBps / 100).toFixed(2)}%`, "FX spread", "Only when USDC converts to SGD. Hold USDC instead and it doesn't apply."],
              ["$0", "Network fees", "Covered for gasless payments and refunds."],
            ].map(([value, title, body], i) => (
              <Reveal key={title} delay={i * 80}>
                <div className="card h-full p-7">
                  <p className="text-5xl font-semibold tracking-tight text-brand">{value}</p>
                  <h3 className="mt-4 font-semibold">{t(title)}</h3>
                  <p className="mt-1.5 text-sm text-slate-500">{t(body)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-brand px-7 py-14 text-on-brand sm:px-14">
              <Banknote className="absolute -right-6 -top-6 h-48 w-48 rotate-12 opacity-10" />
              <h2 className="relative max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">{t("Take your first USDC payment in three minutes.")}</h2>
              <Link href="/merchant" className="btn relative mt-7 bg-[#0b0f02] px-6 py-3.5 text-base text-[#fbfcfd] hover:bg-black">
                {t("Open dashboard")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 pr-36 text-sm text-slate-500">
          <Logo />
          <nav className="flex flex-wrap gap-5">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-ink">
                {t(n.label)}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <>
      <p className="text-sm font-semibold text-brand">{eyebrow}</p>
      <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h2>
    </>
  );
}

/** The hero's picture: one payment moving through its stages on a loop. */
function LivePayment({ t }: { t: TFn }) {
  const rows = [
    ["Order placed", "ORD-65003"],
    ["Signed by buyer", "No gas"],
    ["Confirmed on-chain", "10 blocks"],
    ["Matched to order", "Automatic"],
    ["Funds available", "118.80 USDC"],
    ["Paid to bank", "S$153.39"],
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[36px] bg-brand/10 blur-3xl" />
      <div className="card relative overflow-hidden p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-500">{t("Payment")}</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
              120.00 <span className="text-lg font-medium text-slate-500">USDC</span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand ring-1 ring-inset ring-brand/30">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand text-brand" /> {t("Live")}
          </span>
        </div>
        <ol className="relative mt-6 space-y-1">
          {rows.map(([label, value], i) => (
            <li key={label} className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm" style={{ animation: `journey-in 9s linear ${i * 1.1}s infinite both` }}>
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-on-brand">
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3.5 8.5 6.5 11.5 12.5 5" />
                </svg>
              </span>
              <span className="flex-1">{t(label)}</span>
              <span className="mono text-slate-500">{value === "No gas" || value === "Automatic" || value === "10 blocks" ? t(value) : value}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
