// Fixed timezone so server and browser render the same string (merchant is in Singapore).
const fmt = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatTime(ms: number | null | undefined) {
  if (!ms) return "—";
  return fmt.format(new Date(ms));
}

export function Time({ ms }: { ms: number | null | undefined }) {
  return <time className="whitespace-nowrap tabular-nums">{formatTime(ms)}</time>;
}
