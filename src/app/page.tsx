import Link from "next/link";
import { ArrowRight, LayoutDashboard, ShieldCheck, ShoppingBag } from "lucide-react";
import { TestnetDisclaimer } from "@/components/ui";
import { TESTNET_AMOUNT_DIVISOR } from "@/config/app";

const ENTRIES = [
  {
    href: "/store",
    icon: ShoppingBag,
    title: "Buyer checkout",
    body: "A US buyer pays a Singapore store 120 USD in USDC. Real Base Sepolia testnet transfer from your wallet.",
    tag: "Live testnet",
  },
  {
    href: "/merchant",
    icon: LayoutDashboard,
    title: "Merchant dashboard",
    body: "Orders matched to on-chain payments, webhooks with retries, refunds, settlement preference and reconciliation.",
    tag: "Live + simulated",
  },
  {
    href: "/ops/exceptions",
    icon: ShieldCheck,
    title: "Platform ops",
    body: "Exception queue (under/over/late/non-USDC), address screening, region gating, travel-rule config and a payment simulator.",
    tag: "Internal tools",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-sm font-semibold text-brand">Portfolio prototype · Stablecoin payments</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Cross-border USDC checkout for a Singapore merchant</h1>
      <p className="mt-4 max-w-3xl text-lg text-slate-600">
        One USDC payment, end to end: checkout → on-chain confirmation → automatic order matching → webhook → refund →
        daily SGD settlement → three-way reconciliation. The payment leg runs on the real Base Sepolia testnet; FX and
        banking are simulated and labelled as such.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {ENTRIES.map((e) => (
          <Link key={e.href} href={e.href} className="card group p-6 transition hover:-translate-y-0.5 hover:shadow-md">
            <e.icon className="h-6 w-6 text-brand" />
            <div className="mt-4 flex items-center gap-2">
              <h2 className="text-lg font-semibold">{e.title}</h2>
            </div>
            <span className="mt-1 inline-block text-xs font-medium text-slate-500">{e.tag}</span>
            <p className="mt-3 text-sm text-slate-600">{e.body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
              Open <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
      {TESTNET_AMOUNT_DIVISOR > 1 && (
        <p className="mt-8 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Testnet amount scaling is on: orders are priced normally, but the wallet sends 1/{TESTNET_AMOUNT_DIVISOR} of the
          amount in test USDC, because Circle&apos;s faucet gives 20 USDC per address every 2 hours.
        </p>
      )}
      <TestnetDisclaimer className="mt-12" />
    </main>
  );
}
