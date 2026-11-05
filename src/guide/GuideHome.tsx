"use client";

// The homepage's main flow: three parts, each with its steps.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ChevronDown, Circle, Clock, RotateCcw } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { Badge } from "@/components/ui";
import { pick, PARTS, type Part } from "./parts";
import { useGuide } from "./GuideProvider";

export function GuideHome() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const guide = useGuide();
  const { state } = guide;
  const [opened, setOpened] = useState<string | null>(null);

  const isFinished = (p: Part) => (state.parts[p.id]?.reached ?? 0) >= p.steps.length;
  // The part to work on now is open by default; any other opens on click.
  const current = PARTS.find((p) => p.id === state.active && !isFinished(p)) ?? PARTS.find((p) => !isFinished(p));
  const openId = opened ?? current?.id ?? null;

  const begin = (p: Part, restart: boolean) => {
    const progress = state.parts[p.id];
    if (restart || !progress) guide.start(p.id);
    else guide.resume(p.id);
    const step = p.steps[restart || !progress ? 0 : progress.reached];
    const href = step && guide.hrefFor(p.id, step);
    if (href) router.push(href);
    else setOpened(p.id);
  };

  return (
    <div className="space-y-3">
      {PARTS.map((part, n) => {
        const progress = state.parts[part.id];
        const reached = progress?.reached ?? 0;
        const finished = isFinished(part);
        const open = openId === part.id;
        return (
          <section key={part.id} className={`card overflow-hidden ${open && !finished ? "ring-2 ring-brand" : ""}`}>
            <button type="button" aria-expanded={open} onClick={() => setOpened(open ? "" : part.id)} className="flex w-full items-start gap-4 p-5 text-left">
              {finished ? (
                <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-500" />
              ) : (
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${open ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>{n + 1}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{pick(part.title, locale)}</span>
                <span className="mt-0.5 block text-sm text-slate-600">{pick(part.summary, locale)}</span>
                <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge tone={part.tone}>{pick(part.badge, locale)}</Badge>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {t("about {n} min", { n: part.minutes })}
                  </span>
                  {progress && !finished && <span>{t("Step {i} of {total}", { i: reached + 1, total: part.steps.length })}</span>}
                  {finished && <span>{t("Completed")}</span>}
                </span>
              </span>
              <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
              <div className="border-t border-line">
                <ol className="divide-y divide-line">
                  {part.steps.map((step, i) => {
                    const done = i < reached;
                    const now = !!progress && !finished && i === reached;
                    const href = now ? guide.hrefFor(part.id, step) : undefined;
                    return (
                      <li key={i} className={`flex gap-3 px-5 py-3.5 ${now ? "bg-slate-50" : ""}`}>
                        {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <Circle className={`mt-0.5 h-5 w-5 shrink-0 ${now ? "text-brand" : "text-slate-300"}`} />}
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm ${done ? "text-slate-500" : now ? "font-medium text-ink" : "text-slate-700"}`}>{pick(step.text, locale)}</p>
                          {step.why && (done || now) && <p className="mt-1 text-xs text-slate-500">{pick(step.why, locale)}</p>}
                          {now && (
                            <p className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                              {href && (
                                <Link href={href} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline" onClick={() => guide.resume(part.id)}>
                                  {pick(step.link!.label, locale)} <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              )}
                              {step.check && <span className="text-slate-400">{t("Moves on by itself once it happens")}</span>}
                              <button type="button" className="font-medium text-slate-500 hover:text-ink" onClick={() => guide.finishStep(part.id, i)}>
                                {t(step.check ? "Skip" : "Next step")}
                              </button>
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5">
                  {!finished && (
                    <button type="button" className="btn-primary btn-sm" onClick={() => begin(part, false)}>
                      {t(progress ? "Continue" : "Start")} <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {progress && (
                    <button type="button" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-ink" onClick={() => begin(part, true)}>
                      <RotateCcw className="h-3 w-3" /> {t("Start over")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
