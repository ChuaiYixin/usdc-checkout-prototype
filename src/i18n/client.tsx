"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALE_COOKIE, tFor, type Locale, type TFn } from "./core";

const Ctx = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);

export function useT(): TFn {
  const locale = useLocale();
  return useMemo(() => tFor(locale), [locale]);
}

/** For server-rendered shared components that can't await getT(): <T>Some text</T> */
export function T({ children }: { children: string }) {
  return <>{useT()(children)}</>;
}

/** Floating switch shown on every page. The choice lives in a cookie so server-rendered pages follow it. */
export function LanguageSwitch() {
  const locale = useLocale();
  const router = useRouter();
  const set = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    router.refresh();
  };
  const cls = (active: boolean) => `rounded-full px-2.5 py-1 text-xs font-semibold transition ${active ? "bg-ink text-canvas" : "text-slate-500 hover:text-ink"}`;
  return (
    <div role="group" aria-label="Language / 语言" className="fixed bottom-3 right-3 z-50 flex items-center gap-0.5 rounded-full border border-slate-300 bg-surface/95 p-1 shadow-md backdrop-blur">
      <Languages className="mx-1 h-3.5 w-3.5 text-slate-400" aria-hidden />
      <button type="button" className={cls(locale === "en")} aria-pressed={locale === "en"} onClick={() => set("en")}>
        EN
      </button>
      <button type="button" className={cls(locale === "zh")} aria-pressed={locale === "zh"} onClick={() => set("zh")}>
        中文
      </button>
    </div>
  );
}
