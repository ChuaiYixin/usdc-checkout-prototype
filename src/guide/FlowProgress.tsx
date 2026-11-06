"use client";

// A flow's progress: stages joined by a line that fills as the person moves through them.
import { Check } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { pick, type Part } from "./parts";

/** The stage the person is on, or stages.length once the whole flow is done. */
export function stageOf(part: Part, reached: number) {
  return reached >= part.steps.length ? part.stages.length : part.steps[reached].stage;
}

export function FlowProgress({ part, reached, started = true, labels = true }: { part: Part; reached: number; started?: boolean; labels?: boolean }) {
  const locale = useLocale();
  const stage = started ? stageOf(part, reached) : -1;
  const count = part.stages.length;
  // Each node sits at the centre of an equal column, so the line runs between the first and last centre.
  const inset = 100 / (count * 2);
  const fill = started ? Math.min(1, Math.max(0, stage) / (count - 1)) : 0;
  return (
    <div className="relative w-full" role="img" aria-label={part.stages.map((s) => pick(s, locale)).join(" → ")}>
      <div className="absolute top-3 h-0.5 rounded-full bg-slate-200" style={{ left: `${inset}%`, right: `${inset}%` }}>
        <div className="h-full rounded-full bg-brand shadow-[0_0_10px_rgba(198,255,74,0.7)] transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${fill * 100}%` }} />
      </div>
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {part.stages.map((s, i) => {
          const done = i < stage;
          const now = i === stage;
          return (
            <li key={i} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold transition-all duration-500 ${
                  done ? "bg-brand text-on-brand" : now ? "bg-brand text-on-brand animate-pulse-dot ring-4 ring-brand/25 [color:#0b0f02]" : "border border-slate-300 bg-surface text-slate-400"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              {labels && <span className={`text-[11px] leading-tight transition-colors duration-500 ${now ? "font-semibold text-ink" : done ? "text-slate-600" : "text-slate-400"}`}>{pick(s, locale)}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
