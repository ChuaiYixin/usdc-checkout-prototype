// Fixed timezone so server and browser render the same string (merchant is in Singapore).
// Numeric month-day, so the same format reads naturally in both languages.
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Singapore",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatTime(ms: number | null | undefined) {
  if (!ms) return "—";
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function Time({ ms }: { ms: number | null | undefined }) {
  return <time className="whitespace-nowrap tabular-nums">{formatTime(ms)}</time>;
}
