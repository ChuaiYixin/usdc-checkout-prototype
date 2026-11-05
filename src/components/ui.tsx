import Link from "next/link";
import { ExternalLink, FlaskConical } from "lucide-react";
import { T } from "@/i18n/client";

export function TestnetDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-slate-500 ${className}`}>
      <FlaskConical className="mr-1 inline h-3.5 w-3.5 -translate-y-px" />
      <T>This prototype connects to testnets only and does not process real funds.</T>
    </p>
  );
}

export function SimTag({ children = "Simulated" }: { children?: string }) {
  return (
    <span className="sim-tag">
      <T>{children}</T>
    </span>
  );
}

const TONES: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES | string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone] ?? TONES.gray}`}>
      {children}
    </span>
  );
}

export function ExplorerLink({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return <span className="mono text-slate-600">{children}</span>;
  return (
    <Link href={href} target="_blank" rel="noreferrer" className="mono inline-flex items-center gap-1 text-brand hover:underline">
      {children}
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}
