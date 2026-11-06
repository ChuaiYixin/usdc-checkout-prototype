// Machine checks for the language switch: every English string the code sends through t() has a Chinese entry,
// and translations keep their {placeholders}.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { translate } from "../src/i18n/core";
import { zh } from "../src/i18n/zh";
import { PARTS } from "../src/guide/parts";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

const sources = walk("src").filter((f) => /\.tsx?$/.test(f) && !f.includes(path.join("src", "i18n")) && !f.endsWith(path.join("guide", "parts.ts")));
const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\'/g, "'");

// Data fields whose values reach t() through a variable.
const DATA_FIELDS = /\b(?:label|title|hint|body|tag|def|target|why|confirm|note|estFeeLabel|estTimeLabel|finalityLabel|variant|tagline|bankLabel|cutoffLabel|source|reason|name):\s*"((?:[^"\\]|\\.)+)"/g;
const STATUS_TUPLE = /:\s*\["((?:[^"\\]|\\.)+)",\s*"(?:gray|blue|green|amber|red|violet)"\]/g;
const ERRORS = /(?:new (?:Error|CheckoutError|RefundError)\(|error:\s*)"((?:[^"\\]|\\.)+)"/g;
const CALLS = /\bt\(\s*"((?:[^"\\]|\\.)+)"/g;
const TERNARY = /\bt\(\s*[^"()]+\?\s*"((?:[^"\\]|\\.)+)"\s*:\s*(?:"((?:[^"\\]|\\.)+)"\s*:\s*"((?:[^"\\]|\\.)+)"|"((?:[^"\\]|\\.)+)")/g;
const NOT_UI = new Set(["Base Sepolia", "Ethereum Sepolia", "Solana Devnet", "Base", "Ethereum", "Solana", "Atelier Kelong", "USDC Checkout Prototype", "Default",  "—", "bad event", "bad signature", "service unavailable (simulated outage)", "since is required", "Not found", "Bad address", "Unknown action", "Test wallet disabled", "USDC", "useGuide must be used inside GuideProvider", "PLATFORM_MNEMONIC is missing — run `npm run setup` to generate a local testnet seed."]);

function keysFrom(f: string) {
  const text = fs.readFileSync(f, "utf8");
  const keys: string[] = [];
  const data = /[\\/](config|components)[\\/]|SideNav|ops[\\/]metrics|app[\\/]page\.tsx|lib[\\/](simulator|funnel|exceptions)\.ts/.test(f);
  const res = [CALLS, TERNARY, ERRORS, STATUS_TUPLE, ...(data ? [DATA_FIELDS] : [])];
  for (const re of res) for (const m of text.matchAll(re)) for (const g of m.slice(1)) if (g) keys.push(unescape(g));
  return keys;
}

test("every string sent through t() has a Chinese translation", () => {
  const missing = new Set<string>();
  for (const f of sources) {
    for (const k of keysFrom(f)) {
      if (NOT_UI.has(k) || !/[A-Za-z]/.test(k) || k.startsWith("/")) continue;
      if (!(k in zh) && translate("zh", k) === k) missing.add(`${k}   (${f})`);
    }
  }
  assert.deepEqual([...missing], []);
});

test("translations keep the same {placeholders}", () => {
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [en, cn] of Object.entries(zh)) assert.deepEqual(vars(cn), vars(en), en);
});

test("translate(): English passes through, Chinese applies variables, and runtime sentences are matched", () => {
  assert.equal(translate("en", "Pay {n} USDC", { n: "1.20" }), "Pay 1.20 USDC");
  assert.equal(translate("zh", "Pay {n} USDC", { n: "1.20" }), "支付 1.20 USDC");
  assert.equal(translate("zh", "Unknown English stays readable"), "Unknown English stays readable");
  assert.equal(translate("zh", "Payment is succeeded — refund no longer applies"), "付款状态为 成功，这笔退款已不适用");
  assert.match(translate("zh", "Bank credit S$390.28 ≠ FX payout S$391.13 (−S$0.85)"), /^银行入账/);
});

test("every part of the main flow has both languages throughout", () => {
  const texts = PARTS.flatMap((p) => [p.title, p.summary, ...p.stages, ...p.steps.flatMap((s) => [s.title, s.text, ...(s.why ? [s.why] : []), ...(s.route ? [s.route.label] : [])])]);
  for (const t of texts) {
    assert.ok(t.en.trim(), "missing English");
    assert.ok(/[一-龥]/.test(t.zh), `missing Chinese for: ${t.en}`);
  }
  assert.equal(new Set(PARTS.map((p) => p.id)).size, PARTS.length);
});
