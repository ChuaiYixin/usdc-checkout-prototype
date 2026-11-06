"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Banknote, BarChart3, FlaskConical, Home, Inbox, ListOrdered, ShieldCheck, ShoppingBag, Webhook } from "lucide-react";
import { useT } from "@/i18n/client";

export const NAV_GROUPS = [
  {
    title: "Merchant",
    items: [
      { href: "/merchant", label: "Overview", icon: Home, exact: true },
      { href: "/merchant/orders", label: "Orders", icon: ListOrdered },
      { href: "/merchant/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/merchant/settlement", label: "Settlement", icon: Banknote, guide: "nav-settlement" },
      { href: "/merchant/reconciliation", label: "Reconciliation", icon: ArrowLeftRight, guide: "nav-reconciliation" },
    ],
  },
  {
    title: "Platform ops (internal)",
    items: [
      { href: "/ops/exceptions", label: "Exception queue", icon: Inbox, guide: "nav-exceptions" },
      { href: "/ops/compliance", label: "Compliance", icon: ShieldCheck },
      { href: "/ops/metrics", label: "Metrics", icon: BarChart3 },
      { href: "/ops/scenarios", label: "Scenarios", icon: FlaskConical, guide: "nav-scenarios" },
    ],
  },
  {
    title: "Storefront",
    items: [{ href: "/store", label: "Open store checkout", icon: ShoppingBag, guide: "nav-store" }],
  },
];

export function SideNav() {
  const path = usePathname();
  const t = useT();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t(g.title)}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = "exact" in it && it.exact ? path === it.href : path.startsWith(it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    data-guide={"guide" in it ? it.guide : undefined}
                    className={`relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition duration-200 ${
                      active ? "bg-slate-100 font-semibold text-ink before:absolute before:-left-3 before:top-1.5 before:h-5 before:w-0.5 before:rounded-full before:bg-brand" : "text-slate-500 hover:bg-slate-50 hover:text-ink"
                    }`}
                  >
                    <it.icon className={`h-4 w-4 ${active ? "text-brand" : ""}`} />
                    {t(it.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phone-width navigation: one horizontally scrolling row of pills. */
export function MobileNav() {
  const path = usePathname();
  const t = useT();
  const items = NAV_GROUPS.flatMap((g) => g.items);
  return (
    <nav className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
      {items.map((it) => {
        const active = "exact" in it && it.exact ? path === it.href : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            data-guide={"guide" in it ? it.guide : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              active ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-slate-600"
            }`}
          >
            <it.icon className="h-3.5 w-3.5" />
            {t(it.label === "Open store checkout" ? "Store" : it.label)}
          </Link>
        );
      })}
    </nav>
  );
}
