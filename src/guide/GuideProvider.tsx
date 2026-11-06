"use client";

// Progress through the three flows. Kept in this browser; if storage is unavailable it still works for this page view.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getPart, PARTS, type Step } from "./parts";

export interface Progress {
  since: number;
  /** Number of steps finished. Only grows, so doing things out of order never holds the person back. */
  reached: number;
  requestId?: string;
  orderId?: string;
}

interface State {
  active: string | null;
  /** The welcome has been answered, so it doesn't open again by itself. */
  seen: boolean;
  /** The active flow's card is folded away while the person looks around. */
  parts: Record<string, Progress>;
}

const KEY = "quayline-guide-v1";
const EMPTY: State = { active: null, seen: false, parts: {} };

function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<State>) } : EMPTY;
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
  ready: boolean;
  state: State;
  start: (id: string) => void;
  resume: (id: string) => void;
  finishStep: (id: string, index: number) => void;
  exit: () => void;
  markSeen: () => void;
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
  const [ready, setReady] = useState(false);
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
    setReady(true);
    // Buyer view opens in a new tab: keep both tabs on the same step.
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const activeId = state.active;
  const since = activeId ? state.parts[activeId]?.since : undefined;
  const part = activeId ? getPart(activeId) : undefined;
  const finished = !!part && !!activeId && (state.parts[activeId]?.reached ?? 0) >= part.steps.length;

  // Poll the app's records so steps finish themselves as the person works.
  useEffect(() => {
    if (!part || !activeId || !since || finished) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/guide/check?since=${since}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const { checks, latest } = (await res.json()) as { checks: Record<string, boolean>; latest: { requestId: string; orderId: string } | null };
        const seen = part.steps.reduce((last, step, i) => (typeof step.until === "object" && "check" in step.until && checks[step.until.check] ? i + 1 : last), 0);
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
    const timer = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [part, activeId, since, finished, update]);

  const guide = useMemo<Guide>(
    () => ({
      ready,
      state,
      start: (id) => update((s) => ({ ...s, seen: true, active: id, parts: { ...s.parts, [id]: { since: Date.now(), reached: 0 } } })),
      resume: (id) => update((s) => ({ ...s, seen: true, active: id })),
      finishStep: (id, index) =>
        update((s) => {
          const p = s.parts[id];
          return p ? { ...s, parts: { ...s.parts, [id]: { ...p, reached: Math.max(p.reached, index + 1) } } } : s;
        }),
      exit: () => update((s) => ({ ...s, active: null, seen: true })),
      markSeen: () => update((s) => ({ ...s, seen: true })),
      hrefFor: (partId, step) => {
        const route = step.route;
        if (!route) return undefined;
        const mine = state.parts[partId];
        const first = state.parts[PARTS[0].id];
        if (route.to === "request" && mine?.requestId) return `/pay/${mine.requestId}`;
        if (route.to === "order" && mine?.orderId) return `/merchant/orders/${mine.orderId}`;
        if (route.to === "first-order" && first?.orderId) return `/merchant/orders/${first.orderId}`;
        return route.href;
      },
    }),
    [ready, state, update],
  );

  return <GuideContext.Provider value={guide}>{children}</GuideContext.Provider>;
}
