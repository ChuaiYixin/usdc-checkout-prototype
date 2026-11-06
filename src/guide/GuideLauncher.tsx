"use client";

// Reopens the guide: the flows with their progress, as a card on the overview and behind a button on every console page.
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Compass, Clock, RotateCcw, X } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { FlowProgress } from "./FlowProgress";
import { pick, PARTS, type Part } from "./parts";
import { useGuide } from "./GuideProvider";

export function GuideFlows({ onPick, compact = false }: { onPick?: () => void; compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const guide = useGuide();

  const open = (part: Part, restart: boolean) => {
    const progress = guide.state.parts[part.id];
    const fresh = restart || !progress;
    if (fresh) guide.start(part.id);
    else guide.resume(part.id);
    const step = part.steps[fresh ? 0 : progress.reached];
    onPick?.();
    const href = step && guide.hrefFor(part.id, step);
    if (href && step.page && !new RegExp(step.page).test(location.pathname)) router.push(href);
  };

  return (
    <ul className={`grid gap-3 ${compact ? "" : "lg:grid-cols-3"}`}>
      {PARTS.map((part, n) => {
        const progress = guide.state.parts[part.id];
        const reached = progress?.reached ?? 0;
        const finished = reached >= part.steps.length;
        return (
          <li key={part.id} className="flex flex-col rounded-2xl border border-line bg-slate-50 p-4 transition duration-300 hover:border-slate-300">
            <div className="flex items-start gap-3">
              {finished ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-brand" />
              ) : (
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-bold text-brand">{n + 1}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{pick(part.title, locale)}</p>
                {!compact && <p className="mt-0.5 text-xs text-slate-500">{pick(part.summary, locale)}</p>}
              </div>
            </div>
            <div className="mt-4 flex-1">
              <FlowProgress part={part} reached={reached} started={!!progress} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              {finished ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => open(part, true)}>
                  <RotateCcw className="h-3 w-3" /> {t("Run again")}
                </button>
              ) : (
                <button type="button" className="btn-primary btn-sm" onClick={() => open(part, false)}>
                  {t(progress ? "Continue" : "Start")} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
              {progress && !finished && (
                <button type="button" className="text-xs text-slate-500 transition hover:text-ink" onClick={() => open(part, true)}>
                  {t("Start over")}
                </button>
              )}
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3" /> {t("about {n} min", { n: part.minutes })}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The overview's checklist. Leaves once every flow is done. */
export function GettingStarted() {
  const t = useT();
  const { state, ready } = useGuide();
  const done = PARTS.filter((p) => (state.parts[p.id]?.reached ?? 0) >= p.steps.length).length;
  if (!ready || done === PARTS.length) return null;
  return (
    <section className="card relative animate-rise overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{t("Get started")}</h2>
        <span className="text-xs tabular-nums text-slate-500">{t("{done} of {total} done", { done, total: PARTS.length })}</span>
      </div>
      <div className="relative">
        <GuideFlows />
      </div>
    </section>
  );
}

/** Bottom-of-screen button on console pages, next to the language switch. */
export function GuideLauncher() {
  const t = useT();
  const path = usePathname();
  const { state, ready } = useGuide();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  if (!ready || !/^\/(merchant|ops)/.test(path)) return null;
  const done = PARTS.filter((p) => (state.parts[p.id]?.reached ?? 0) >= p.steps.length).length;
  const share = done / PARTS.length;

  return (
    <>
      {open && (
        <div className="fixed bottom-16 right-3 z-50 max-h-[calc(100vh-88px)] w-[min(380px,calc(100vw-24px))] animate-pop overflow-y-auto rounded-2xl border border-slate-300 bg-[#101218] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.7)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("Guide")}</h2>
            <button type="button" aria-label={t("Close")} className="text-slate-500 transition hover:text-ink" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <GuideFlows compact onPick={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-3 right-[136px] z-50 flex h-[34px] items-center gap-1.5 rounded-full border border-slate-300 bg-surface/95 pl-2 pr-3 text-xs font-semibold shadow-md backdrop-blur transition hover:border-brand"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-brand) ${share * 360}deg, var(--color-slate-200) 0)` }}>
          <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-surface">
            <Compass className="h-2.5 w-2.5" />
          </span>
        </span>
        {t("Guide")}
      </button>
    </>
  );
}
