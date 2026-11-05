"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Banknote, BarChart3, Code2, Link2, FlaskConical, Home, Inbox, ListOrdered, ShieldCheck, ShoppingBag, Webhook } from "lucide-react";

const GROUPS = [
  {
    title: "Merchant",
    items: [
      { href: "/merchant", label: "Overview", icon: Home, exact: true },
      { href: "/merchant/orders", label: "Orders", icon: ListOrdered },
      { href: "/merchant/links", label: "Payment links", icon: Link2 },
      { href: "/merchant/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/merchant/developers", label: "Developers", icon: Code2 },
      { href: "/merchant/settlement", label: "Settlement", icon: Banknote },
      { href: "/merchant/reconciliation", label: "Reconciliation", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Platform ops (internal)",
    items: [
      { href: "/ops/exceptions", label: "Exception queue", icon: Inbox },
      { href: "/ops/compliance", label: "Compliance", icon: ShieldCheck },
      { href: "/ops/metrics", label: "PRD metrics", icon: BarChart3 },
      { href: "/ops/simulator", label: "Simulator", icon: FlaskConical },
    ],
  },
  {
    title: "Buyer",
    items: [{ href: "/store", label: "Open store checkout", icon: ShoppingBag }],
  },
];

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = "exact" in it && it.exact ? path === it.href : path.startsWith(it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition ${
                      active ? "bg-slate-100 font-semibold text-ink" : "text-slate-600 hover:bg-slate-50 hover:text-ink"
                    }`}
                  >
                    <it.icon className="h-4 w-4" />
                    {it.label}
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
  const items = GROUPS.flatMap((g) => g.items);
  return (
    <nav className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
      {items.map((it) => {
        const active = "exact" in it && it.exact ? path === it.href : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              active ? "border-ink bg-ink text-white" : "border-line bg-white text-slate-600"
            }`}
          >
            <it.icon className="h-3.5 w-3.5" />
            {it.label.replace("Open store checkout", "Store")}
          </Link>
        );
      })}
    </nav>
  );
}
