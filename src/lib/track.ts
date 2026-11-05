"use client";

// Fire-and-forget funnel beacon from the browser.
export function track(subject: string, step: string, meta?: Record<string, unknown>) {
  try {
    const body = JSON.stringify({ subject, step, meta });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/funnel", new Blob([body], { type: "application/json" }));
    else fetch("/api/funnel", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
  } catch {}
}

/** Map a wallet error to a short drop-off reason for the funnel. */
export function errorReason(message: string) {
  const m = message.toLowerCase();
  if (m.includes("rejected") || m.includes("denied")) return "rejected_in_wallet";
  if (m.includes("insufficient funds") || m.includes("gas")) return "no_gas_token";
  if (m.includes("exceeds balance") || m.includes("enough usdc") || m.includes("transfer amount")) return "insufficient_usdc";
  if (m.includes("chain") || m.includes("network")) return "wrong_network";
  if (m.includes("provider not found") || m.includes("no browser wallet")) return "no_wallet";
  return "other";
}
