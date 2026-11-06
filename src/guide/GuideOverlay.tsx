"use client";

// First-run guide: a dark translucent mask with a hole cut around the one element to use next, a card pointing at it,
// and the flow's progress across the top.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { Logo } from "@/components/ui";
import { FlowProgress } from "./FlowProgress";
import { getPart, pick, PARTS, type Part, type Step } from "./parts";
import { useGuide } from "./GuideProvider";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
/** Height kept clear at the bottom of the screen for the flow's progress. */
const RAIL_SPACE = 104;
const MASK = "0 0 0 200vmax rgba(2, 3, 6, 0.8)";

/** Follows the target as the page scrolls, resizes or re-renders. Targets are re-queried because refreshes replace them. */
function useTargetBox(selector: string | null, active: boolean) {
  const [box, setBox] = useState<Box | null>(null);
  const last = useRef<Box | null>(null);
  useEffect(() => {
    last.current = null;
    setBox(null);
    if (!selector || !active) return;
    let frame = 0;
    let scrolled = false;
    const measure = () => {
      const el = [...document.querySelectorAll<HTMLElement>(`[data-guide="${selector}"]`)].find((e) => e.getBoundingClientRect().width > 0);
      if (!el) {
        if (last.current) {
          last.current = null;
          setBox(null);
        }
      } else {
        if (!scrolled) {
          scrolled = true;
          const r = el.getBoundingClientRect();
          // Inline too: on phones the nav is a sideways-scrolling row.
          if (r.top < 16 || r.bottom > window.innerHeight - RAIL_SPACE - 40 || r.left < 0 || r.right > window.innerWidth) el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        }
        const r = el.getBoundingClientRect();
        const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
        const p = last.current;
        if (!p || Math.abs(p.top - next.top) > 0.5 || Math.abs(p.left - next.left) > 0.5 || Math.abs(p.width - next.width) > 0.5 || Math.abs(p.height - next.height) > 0.5) {
          last.current = next;
          setBox(next);
        }
      }
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [selector, active]);
  return box;
}

/** Puts the card beside the target, on the side with room, and returns where its arrow goes. */
function usePlacement(box: Box | null, cardRef: React.RefObject<HTMLDivElement | null>, depends: unknown, pinned: boolean) {
  const [pos, setPos] = useState<{ top: number; left: number; side: "top" | "bottom" | "left" | "right" | null; arrow: number }>({ top: -999, left: -999, side: null, arrow: 0 });
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const place = () => {
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 16;
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
      // While waiting the page stays usable, so the card sits out of the way above the progress.
      if (pinned) return setPos({ top: vh - h - RAIL_SPACE - 8, left: (vw - w) / 2, side: null, arrow: 0 });
      if (!box) return setPos({ top: Math.max(16, (vh - RAIL_SPACE - h) / 2), left: (vw - w) / 2, side: null, arrow: 0 });
      const roomRight = vw - (box.left + box.width);
      const roomBelow = vh - RAIL_SPACE - (box.top + box.height);
      let side: "top" | "bottom" | "left" | "right";
      if (vw >= 640 && roomRight >= w + gap + 12 && box.width < vw * 0.3) side = "right";
      else if (roomBelow >= h + gap + 12) side = "bottom";
      else if (box.top >= h + gap + 12) side = "top";
      else if (vw >= 640 && box.left >= w + gap + 12) side = "left";
      else side = roomBelow >= box.top ? "bottom" : "top";
      const left = side === "right" ? box.left + box.width + gap : side === "left" ? box.left - w - gap : clamp(box.left + box.width / 2 - w / 2, 12, vw - w - 12);
      const top = side === "bottom" ? box.top + box.height + gap : side === "top" ? box.top - h - gap : clamp(box.top + box.height / 2 - h / 2, 12, vh - h - RAIL_SPACE);
      const clampedTop = clamp(top, 12, Math.max(12, vh - h - RAIL_SPACE));
      const arrow = side === "left" || side === "right" ? clamp(box.top + box.height / 2 - clampedTop, 20, h - 20) : clamp(box.left + box.width / 2 - left, 20, w - 20);
      setPos({ top: clampedTop, left, side, arrow });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(card);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [box, cardRef, depends, pinned]);
  return pos;
}

export function GuideOverlay() {
  const guide = useGuide();
  const path = usePathname();
  const inConsole = /^\/(merchant|ops)/.test(path);
  const { state, ready } = guide;

  // Opens by itself the first time someone reaches the dashboard.
  if (!ready) return null;
  if (!state.seen && inConsole) return <Welcome />;

  const part = state.active ? getPart(state.active) : undefined;
  const progress = state.active ? state.parts[state.active] : undefined;
  if (!part || !progress || path === "/") return null;
  if (progress.reached >= part.steps.length) return <PartComplete part={part} />;
  return <Spotlight key={part.id} part={part} index={progress.reached} />;
}

function Spotlight({ part, index }: { part: Part; index: number }) {
  const t = useT();
  const locale = useLocale();
  const path = usePathname();
  const router = useRouter();
  const guide = useGuide();
  const progress = guide.state.parts[part.id];
  const step: Step = part.steps[index];

  const onPage = !step.page || new RegExp(step.page).test(path);
  const target = onPage && step.target ? step.target.replace("{order}", progress.orderId ?? "") : null;
  const box = useTargetBox(target, onPage);
  const route = guide.hrefFor(part.id, step);
  const cardRef = useRef<HTMLDivElement>(null);
  const pos = usePlacement(box, cardRef, `${part.id}:${index}:${onPage}`, !!step.waiting);

  // Steps that finish by reaching a page.
  const untilPath = typeof step.until === "object" && "path" in step.until ? step.until.path : null;
  useEffect(() => {
    if (untilPath && new RegExp(untilPath).test(path)) guide.finishStep(part.id, index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [untilPath, path, part.id, index]);

  const masked = !step.waiting;
  // Block everything except the hole; with no target (or while waiting) block all or nothing respectively.
  const blockers: React.CSSProperties[] = !masked
    ? []
    : box
      ? [
          { top: 0, left: 0, right: 0, height: Math.max(0, box.top) },
          { top: box.top + box.height, left: 0, right: 0, bottom: 0 },
          { top: box.top, left: 0, width: Math.max(0, box.left), height: box.height },
          { top: box.top, left: box.left + box.width, right: 0, height: box.height },
        ]
      : [{ inset: 0 }];

  const showRoute = (!onPage || step.cta) && route;
  const isManual = step.until === "next";

  return (
    <>
      {blockers.map((style, i) => (
        <div key={i} aria-hidden className="fixed z-[1001]" style={style} />
      ))}

      {box ? (
        <div className="spotlight-hole" style={{ ...box, boxShadow: masked ? MASK : "none" }} />
      ) : (
        masked && <div aria-hidden className="pointer-events-none fixed inset-0 z-[1000] animate-[page-in_0.3s_ease-out] bg-[rgba(2,3,6,0.8)]" />
      )}

      {/* The flow's progress, always in the same place */}
      <div className="fixed inset-x-3 bottom-3 z-[1002] mx-auto max-w-xl animate-[page-in_0.5s_var(--ease-out-soft)] rounded-2xl border border-slate-300 bg-surface px-4 pb-2.5 pt-3 shadow-[0_18px_50px_rgba(0,0,0,0.6)] backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-semibold">{pick(part.title, locale)}</span>
          <span className="flex shrink-0 items-center gap-3 text-slate-500">
            <span className="tabular-nums">{t("Flow {n} of {total}", { n: PARTS.indexOf(part) + 1, total: PARTS.length })}</span>
            <button type="button" onClick={guide.exit} aria-label={t("Close")} className="transition hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
        <FlowProgress part={part} reached={index} />
      </div>

      {/* The card pointing at the target. The key restarts its entrance on every step. */}
      <div
        ref={cardRef}
        role="dialog"
        aria-live="polite"
        aria-label={pick(step.title, locale)}
        className="fixed z-[1003] w-[min(360px,calc(100vw-24px))] transition-[top,left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ top: pos.top, left: pos.left, visibility: pos.top < -100 ? "hidden" : "visible" }}
      >
        {pos.side && <Arrow side={pos.side} offset={pos.arrow} />}
        <div key={index} className="animate-pop rounded-2xl border border-brand/50 bg-[#14171e] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_40px_rgba(198,255,74,0.12)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">{t("Step {i} of {total}", { i: index + 1, total: part.steps.length })}</p>
          <h2 className="mt-1.5 text-base font-semibold text-ink">{pick(step.title, locale)}</h2>
          <p className="mt-1.5 text-sm text-slate-700">{pick(step.text, locale)}</p>
          {step.why && onPage && <p className="mt-2.5 border-l-2 border-slate-300 pl-3 text-xs leading-relaxed text-slate-500">{pick(step.why, locale)}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {showRoute ? (
              <button type="button" className="btn-primary btn-sm" onClick={() => router.push(route)}>
                {pick(step.route!.label, locale)} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : isManual ? (
              <button type="button" className="btn-primary btn-sm" onClick={() => guide.finishStep(part.id, index)}>
                {t("Next")} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                {step.waiting ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" /> : <span className="h-2 w-2 animate-pulse-dot rounded-full bg-brand text-brand" />}
                {t(step.waiting ? "Waiting for the network" : "Moves on when you've done it")}
              </span>
            )}
            <button type="button" className="ml-auto text-xs font-medium text-slate-400 transition hover:text-ink" onClick={() => guide.finishStep(part.id, index)}>
              {t("Skip step")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Arrow({ side, offset }: { side: "top" | "bottom" | "left" | "right"; offset: number }) {
  const base = "absolute h-3 w-3 rotate-45 bg-[#14171e] border-brand/50 transition-[top,left] duration-500";
  if (side === "bottom") return <span className={`${base} -top-1.5 border-l border-t`} style={{ left: offset - 6 }} />;
  if (side === "top") return <span className={`${base} -bottom-1.5 border-b border-r`} style={{ left: offset - 6 }} />;
  if (side === "right") return <span className={`${base} -left-1.5 border-b border-l`} style={{ top: offset - 6 }} />;
  return <span className={`${base} -right-1.5 border-r border-t`} style={{ top: offset - 6 }} />;
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1100] grid animate-[page-in_0.3s_ease-out] place-items-center overflow-y-auto bg-[rgba(2,3,6,0.82)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg animate-pop rounded-3xl border border-slate-300 bg-[#101218] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.8),0_0_60px_rgba(198,255,74,0.1)]">{children}</div>
    </div>
  );
}

function Welcome() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const guide = useGuide();
  const begin = () => {
    guide.start(PARTS[0].id);
    router.push("/merchant");
  };
  return (
    <Modal>
      <Logo />
      <h2 className="mt-5 text-2xl font-bold tracking-tight">{t("Welcome. Let's run your first payment.")}</h2>
      <p className="mt-2 text-sm text-slate-600">{t("Three short flows take you from a buyer's checkout to your bank statement. We'll point at each thing to click.")}</p>
      <ol className="mt-5 space-y-2">
        {PARTS.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-slate-50 px-3.5 py-2.5 text-sm" style={{ animation: `rise-in 0.5s var(--ease-out-soft) ${0.1 + i * 0.08}s backwards` }}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-bold text-brand">{i + 1}</span>
            <span className="flex-1 font-medium">{pick(p.title, locale)}</span>
            <span className="shrink-0 text-xs text-slate-500">{t("about {n} min", { n: p.minutes })}</span>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex items-center gap-3">
        <button type="button" className="btn-primary flex-1 py-3" onClick={begin}>
          {t("Start")} <ArrowRight className="h-4 w-4" />
        </button>
        <button type="button" className="btn-secondary py-3" onClick={guide.markSeen}>
          {t("Skip for now")}
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">{t("You can reopen this any time from Guide, at the bottom of the screen.")}</p>
    </Modal>
  );
}

function PartComplete({ part }: { part: Part }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const guide = useGuide();
  const number = PARTS.indexOf(part) + 1;
  const next = PARTS[number];
  return (
    <Modal>
      <div className="grid h-14 w-14 place-items-center rounded-full bg-brand/15">
        {next ? (
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-brand" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path className="check-draw" pathLength={1} d="M5 12.5 10 17.5 19 7.5" />
          </svg>
        ) : (
          <Sparkles className="h-7 w-7 text-brand" />
        )}
      </div>
      <h2 className="mt-4 text-2xl font-bold tracking-tight">{next ? pick(part.title, locale) : t("You're all set")}</h2>
      <p className="mt-1.5 text-sm text-slate-600">{next ? t("Done. Next up: {title}.", { title: pick(next.title, locale) }) : t("You've taken a payment, handled what can go wrong, and followed the money to the bank.")}</p>
      <div className="mt-6 rounded-2xl border border-line bg-slate-50 px-3 py-4">
        <FlowProgress part={part} reached={part.steps.length} />
      </div>
      <div className="mt-6 flex items-center gap-3">
        {next ? (
          <>
            <button
              type="button"
              className="btn-primary flex-1 py-3"
              onClick={() => {
                guide.start(next.id);
                const href = guide.hrefFor(next.id, next.steps[0]);
                if (href && !(next.steps[0].page && new RegExp(next.steps[0].page).test(location.pathname))) router.push(href);
              }}
            >
              {t("Continue")} <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" className="btn-secondary py-3" onClick={guide.exit}>
              {t("Later")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary flex-1 py-3"
            onClick={() => {
              guide.exit();
              router.push("/merchant");
            }}
          >
            <CheckCircle2 className="h-4 w-4" /> {t("Go to the dashboard")}
          </button>
        )}
      </div>
    </Modal>
  );
}
