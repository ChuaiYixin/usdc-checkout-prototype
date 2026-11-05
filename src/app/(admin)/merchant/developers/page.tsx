import { desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { Time } from "@/components/time";
import { ActionButton } from "@/components/ActionButton";
import { PostForm } from "@/components/PostForm";

const EVENTS = [
  ["payment.confirming", "Transfer seen on-chain; waiting for confirmations"],
  ["payment.succeeded", "Paid in full — safe to fulfil the order"],
  ["payment.underpaid", "Partial payment; buyer can top up until expiry"],
  ["payment.under_review", "Held for compliance review (funds frozen)"],
  ["payment.funds_available", "Funds final (block posted to L1) and in your balance"],
  ["payment.expired", "No payment within the window"],
  ["payment.exception", "Late payment, wrong token or underpaid-then-expired"],
  ["refund.succeeded / refund.failed", "Refund outcome"],
];

export default async function DevelopersPage() {
  const keys = await db.select().from(schema.apiKeys).orderBy(desc(schema.apiKeys.createdAt));
  const base = process.env.APP_URL || "http://localhost:3000";
  const create = `curl -X POST ${base}/api/v1/payment_requests \\
  -H "Authorization: Bearer sk_test_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": "120.00",
    "currency": "USD",
    "merchant_reference": "SHOPIFY-1042",
    "description": "2 × Kelong Pearl Drop Earrings",
    "customer": { "name": "Jordan Lee", "email": "jordan@example.com", "country": "US" }
  }'`;
  const response = `{
  "object": "payment_request",
  "id": "pr_…",
  "status": "awaiting_payment",
  "amount": { "value": "120.00", "currency": "USDC" },
  "chain": "base-sepolia",
  "deposit_address": "0x…",          // unique to this request (R7)
  "expires_at": "2026-10-24T03:15:00Z",
  "pay_url": "${base}/pay/pr_…",       // redirect the buyer here
  "livemode": false
}`;
  const verify = `import { createHmac, timingSafeEqual } from "node:crypto";

// header: x-webhook-signature: t=<unix seconds>,v1=<hex hmac>
export function verify(rawBody: string, header: string, secret: string) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // replay window
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
// Delivery is at-least-once: de-duplicate on the event "id".`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Developers</h1>
        <p className="text-sm text-slate-500">
          For merchants with their own store backend. No-code merchants use payment links instead. Test mode only.
        </p>
      </div>

      <section className="card p-6">
        <h2 className="font-semibold">API keys</h2>
        <div className="mt-3">
          <PostForm url="/api/merchant/apikeys" submitLabel="Create test key" fields={[{ name: "label", placeholder: "Label, e.g. Shopify backend" }]} />
        </div>
        <ul className="mt-4 divide-y divide-line text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="mono">{k.prefix}…</span> <span className="text-slate-500">· {k.label}</span>
              </span>
              <span className="flex items-center gap-3 text-xs text-slate-500">
                last used <Time ms={k.lastUsedAt} />
                <ActionButton url="/api/merchant/apikeys" body={{ action: "revoke", id: k.id }} confirm="Revoke this key? Calls using it will start failing.">
                  Revoke
                </ActionButton>
              </span>
            </li>
          ))}
          {keys.length === 0 && <li className="py-2 text-slate-500">No keys yet.</li>}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Only a SHA-256 hash of each key is stored; the full key is shown once.</p>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">Create a payment request</h2>
        <p className="text-sm text-slate-600">
          Call this when the shopper picks &quot;Pay with USDC&quot;, then redirect them to <span className="mono">pay_url</span>. Re-sending the
          same <span className="mono">merchant_reference</span> returns the existing active request (idempotent, and one active request per order — R1).
        </p>
        <Code>{create}</Code>
        <Code>{response}</Code>
        <p className="text-sm text-slate-600">
          Poll with <span className="mono">GET /api/v1/payment_requests/:id</span> if you must; webhooks are the primary channel.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold">Webhook events</h2>
        <table className="mt-3 w-full text-sm">
          <tbody className="divide-y divide-line">
            {EVENTS.map(([e, d]) => (
              <tr key={e}>
                <td className="td mono w-72">{e}</td>
                <td className="td text-slate-600">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="mt-6 text-sm font-semibold">Verifying signatures</h3>
        <div className="mt-2">
          <Code>{verify}</Code>
        </div>
      </section>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-[12px] leading-relaxed text-slate-100">{children}</pre>;
}
