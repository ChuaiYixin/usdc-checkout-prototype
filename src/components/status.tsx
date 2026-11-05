import { Badge } from "./ui";

const PR_STATUS: Record<string, [string, string]> = {
  awaiting_payment: ["Awaiting payment", "gray"],
  confirming: ["Confirming", "blue"],
  underpaid: ["Underpaid", "amber"],
  succeeded: ["Succeeded", "green"],
  expired: ["Expired", "gray"],
  exception: ["Exception", "amber"],
  under_review: ["Under review", "violet"],
  refunded: ["Refunded", "gray"],
};

const FUNDS: Record<string, [string, string]> = {
  none: ["—", "gray"],
  pending_finality: ["Pending finality", "blue"],
  available: ["Available", "green"],
  frozen: ["Frozen", "violet"],
  settled: ["Settled", "green"],
  refunded: ["Refunded", "gray"],
};

const REFUND: Record<string, [string, string]> = {
  queued: ["Queued", "blue"],
  submitted: ["Submitted", "blue"],
  succeeded: ["Refunded", "green"],
  failed: ["Failed", "red"],
  blocked: ["Blocked (screening)", "violet"],
};

const EXCEPTION_TYPES: Record<string, string> = {
  underpaid: "Underpaid (awaiting top-up)",
  underpaid_expired: "Underpaid, then expired",
  overpaid: "Overpaid",
  late_payment: "Paid after expiry",
  non_usdc: "Non-USDC token",
  screening_hit: "Address screening hit",
};

export const DEFAULT_ACTIONS: Record<string, string> = {
  await_top_up: "Wait for buyer top-up until expiry",
  refund_full: "Refund the amount received in full",
  refund_excess: "Refund the excess automatically",
  merchant_decide: "Merchant accepts the order, or refunds in full",
  manual_review_return: "Do not credit; review, then return the token",
  compliance_review: "Keep frozen; compliance releases or files a report",
};

export function PrStatusBadge({ status }: { status: string }) {
  const [label, tone] = PR_STATUS[status] ?? [status, "gray"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function FundsBadge({ status }: { status: string }) {
  if (status === "none") return <span className="text-xs text-slate-400">—</span>;
  const [label, tone] = FUNDS[status] ?? [status, "gray"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function RefundBadge({ status }: { status: string }) {
  const [label, tone] = REFUND[status] ?? [status, "gray"];
  return <Badge tone={tone}>{label}</Badge>;
}

export function exceptionLabel(type: string) {
  return EXCEPTION_TYPES[type] ?? type;
}
