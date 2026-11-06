import Link from "next/link";
import { ExternalLink } from "lucide-react";

const TONES: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-300",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  brand: "bg-brand/10 text-brand ring-brand/30",
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

/** The product's mark and name. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-on-brand">
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M3 13.5h9.5M3 8.5h14" />
          <path d="M13.5 13.5 17 17" />
        </svg>
      </span>
      Quayline
    </span>
  );
}
