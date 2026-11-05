"use client";

// The current step, carried along on every page except the homepage (which shows the full list).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { getPart, pick, PARTS } from "./parts";
import { useGuide } from "./GuideProvider";

const LINK_BUTTON = "inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-stone-900 hover:bg-stone-200";
const QUIET_BUTTON = "rounded-lg px-2 py-1.5 text-xs font-medium text-stone-300 hover:text-white";

export function GuideBar() {
  const t = useT();
  const locale = useLocale();
  const path = usePathname();
  const router = useRouter();
  const { state, start, finishStep, exit, hrefFor } = useGuide();

  const part = state.active ? getPart(state.active) : undefined;
  const progress = state.active ? state.parts[state.active] : undefined;
  if (path === "/" || !part || !progress) return null;

  const number = PARTS.indexOf(part) + 1;
  const step = part.steps[progress.reached];
  const next = PARTS[number];
  const href = step ? hrefFor(part.id, step) : undefined;

  return (
    <>
      {/* Lets every page scroll clear of the card, so it never hides a button. */}
      <div aria-hidden className="h-60 sm:h-48" />
      <aside aria-label={t("Main flow")} className="fixed inset-x-3 bottom-14 z-40 mx-auto max-w-2xl rounded-2xl bg-stone-900 p-4 text-white shadow-xl lg:bottom-4">
        <div className="flex items-center justify-between gap-3 text-xs text-stone-400">
          <span>
            {t("Part {n}", { n: number })} · {pick(part.title, locale)}
            {step && ` · ${t("Step {i} of {total}", { i: progress.reached + 1, total: part.steps.length })}`}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <Link href="/" className="hover:text-white">
              {t("All steps")}
            </Link>
            <button type="button" onClick={exit} aria-label={t("Close")} className="hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>

        {step ? (
          <>
            <p className="mt-2 text-sm font-medium">{pick(step.text, locale)}</p>
            {step.why && <p className="mt-1 hidden text-xs text-stone-400 sm:block">{pick(step.why, locale)}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {href && href !== path && (
                <Link href={href} className={step.link!.fallback ? "text-xs font-medium text-stone-300 underline hover:text-white" : LINK_BUTTON}>
                  {pick(step.link!.label, locale)} {!step.link!.fallback && <ArrowRight className="h-3.5 w-3.5" />}
                </Link>
              )}
              {step.check ? (
                <>
                  <span className="text-xs text-stone-400">{t("Moves on by itself once it happens")}</span>
                  <button type="button" className={`${QUIET_BUTTON} ml-auto`} onClick={() => finishStep(part.id, progress.reached)}>
                    {t("Skip")}
                  </button>
                </>
              ) : (
                <button type="button" className={LINK_BUTTON} onClick={() => finishStep(part.id, progress.reached)}>
                  {t("Next step")} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              {t(next ? "Part {n} complete" : "All three parts complete", { n: number })}
            </p>
            {next ? (
              <button
                type="button"
                className={LINK_BUTTON}
                onClick={() => {
                  start(next.id);
                  const first = hrefFor(next.id, next.steps[0]);
                  if (first) router.push(first);
                }}
              >
                {t("Next: {title}", { title: pick(next.title, locale) })} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <Link href="/" onClick={exit} className={LINK_BUTTON}>
                {t("Back to the main flow")}
              </Link>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
