// Language support. English strings are the keys, so a missing translation falls back to readable English.
// Client-safe. tests/i18n.test.ts checks that every key used in the code has a Chinese entry.
import { zh } from "./zh";
import { zhPatterns } from "./zh-patterns";

export type Locale = "en" | "zh";
export const LOCALE_COOKIE = "locale";
export type Vars = Record<string, string | number>;
export type TFn = (key: string, vars?: Vars) => string;

export function parseLocale(v: string | null | undefined): Locale {
  return v === "zh" ? "zh" : "en";
}

function toZh(key: string): string {
  const exact = zh[key];
  if (exact) return exact;
  // Sentences built at runtime (timeline entries, API errors): translate by pattern, and translate captured words too.
  for (const [re, tpl] of zhPatterns) {
    const m = key.match(re);
    if (m) return tpl.replace(/\$(\d)/g, (_, i) => zh[m[Number(i)]] ?? m[Number(i)] ?? "");
  }
  return key;
}

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const s = locale === "zh" ? toZh(key) : key;
  return vars ? s.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all)) : s;
}

export const tFor = (locale: Locale): TFn => (key, vars) => translate(locale, key, vars);
