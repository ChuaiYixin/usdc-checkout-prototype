"use client";

// Progress through the three parts, shared by the homepage and the step card on every other page.
// Kept in this browser. If storage is unavailable, it still works for the current page view.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getPart, PARTS, type Step } from "./parts";

export interface Progress {
  since: number;
  /** Number of steps finished. Only grows, so a skipped manual step never holds the person back. */
  reached: number;
  requestId?: string;
  orderId?: string;
}

interface State {
  active: string | null;
  parts: Record<string, Progress>;
}

const KEY = "guide-progress-v1";
const EMPTY: State = { active: null, parts: {} };

function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as State) : EMPTY;
  } catch {
    return null;
  }
}

function save(state: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

interface Guide {
  state: State;
  start: (id: string) => void;
  resume: (id: string) => void;
  finishStep: (id: string, index: number) => void;
  exit: () => void;
  hrefFor: (partId: string, step: Step) => string | undefined;
}

const GuideContext = createContext<Guide | null>(null);

export function useGuide() {
  const guide = useContext(GuideContext);
  if (!guide) throw new Error("useGuide must be used inside GuideProvider");
  return guide;
}

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(EMPTY);
  const stateRef = useRef(state);

  const update = useCallback((change: (s: State) => State) => {
    const next = change(load() ?? stateRef.current);
    stateRef.current = next;
    save(next);
    setState(next);
  }, []);

  useEffect(() => {
    const sync = () => {
      const stored = load();
      if (stored) {
        stateRef.current = stored;
        setState(stored);
      }
    };
    sync();
    // Buyer view opens in a new tab: keep both tabs on the same step.
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const activeId = state.active;
  const since = activeId ? state.parts[activeId]?.since : undefined;
  const part = activeId ? getPart(activeId) : undefined;
  const finished = !!part && !!activeId && (state.parts[activeId]?.reached ?? 0) >= part.steps.length;

  // Poll the app's records so steps finish themselves while the person works on other pages.
  useEffect(() => {
    if (!part || !activeId || !since || finished) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/guide/check?since=${since}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const { checks, latest } = (await res.json()) as { checks: Record<string, boolean>; latest: { requestId: string; orderId: string } | null };
        const seen = part.steps.reduce((last, step, i) => (step.check && checks[step.check] ? i + 1 : last), 0);
        const current = stateRef.current.parts[activeId];
        if (!current || current.since !== since) return;
        if (seen <= current.reached && latest?.requestId === current.requestId) return;
        update((s) => {
          const p = s.parts[activeId];
          if (!p || p.since !== since) return s;
          return { ...s, parts: { ...s.parts, [activeId]: { ...p, reached: Math.max(p.reached, seen), requestId: latest?.requestId ?? p.requestId, orderId: latest?.orderId ?? p.orderId } } };
        });
      } catch {}
    };
    tick();
    const timer = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [part, activeId, since, finished, update]);

  const guide = useMemo<Guide>(
    () => ({
      state,
      start: (id) => update((s) => ({ active: id, parts: { ...s.parts, [id]: { since: Date.now(), reached: 0 } } })),
      resume: (id) => update((s) => ({ ...s, active: id })),
      finishStep: (id, index) =>
        update((s) => {
          const p = s.parts[id];
          return p ? { ...s, parts: { ...s.parts, [id]: { ...p, reached: Math.max(p.reached, index + 1) } } } : s;
        }),
      exit: () => update((s) => ({ ...s, active: null })),
      hrefFor: (partId, step) => {
        const link = step.link;
        if (!link) return undefined;
        const mine = state.parts[partId];
        const first = state.parts[PARTS[0].id];
        if (link.to === "request" && mine?.requestId) return `/pay/${mine.requestId}`;
        if (link.to === "order" && mine?.orderId) return `/merchant/orders/${mine.orderId}`;
        if (link.to === "first-order" && first?.orderId) return `/merchant/orders/${first.orderId}`;
        return link.href;
      },
    }),
    [state, update],
  );

  return <GuideContext.Provider value={guide}>{children}</GuideContext.Provider>;
}
