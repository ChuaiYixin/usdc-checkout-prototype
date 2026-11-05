import Link from "next/link";
import { desc } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { db, schema } from "@/db/client";
import { formatUsd } from "@/lib/money";
import { Badge } from "@/components/ui";
import { Time } from "@/components/time";
import { ActionButton } from "@/components/ActionButton";
import { PostForm } from "@/components/PostForm";

export default async function PaymentLinksPage() {
  const links = await db.select().from(schema.paymentLinks).orderBy(desc(schema.paymentLinks.createdAt));
  const base = process.env.APP_URL || "http://localhost:3000";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment links</h1>
        <p className="text-sm text-slate-500">
          No code needed: share a link in a chat, social post or invoice. Each buyer who opens it gets their own payment request and deposit
          address, so matching stays automatic.
        </p>
      </div>
      <section className="card p-6">
        <h2 className="mb-3 font-semibold">Create a link</h2>
        <PostForm
          url="/api/merchant/links"
          submitLabel="Create link"
          fields={[
            { name: "title", placeholder: "e.g. Custom pearl ring — deposit" },
            { name: "amount", placeholder: "Amount in USD, e.g. 250.00", width: "w-56" },
          ]}
        />
      </section>
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/60">
              <tr>
                <th className="th">Title</th>
                <th className="th text-right">Amount</th>
                <th className="th">Link</th>
                <th className="th">Orders</th>
                <th className="th">Created</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {links.map((l) => (
                <tr key={l.id}>
                  <td className="td font-medium">{l.title}</td>
                  <td className="td text-right tabular-nums">{formatUsd(l.amountCents)}</td>
                  <td className="td">
                    <Link href={`/l/${l.id}`} target="_blank" className="mono inline-flex items-center gap-1 text-brand hover:underline">
                      {base.replace(/^https?:\/\//, "")}/l/{l.id} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="td">{l.uses}</td>
                  <td className="td text-xs text-slate-500">
                    <Time ms={l.createdAt} />
                  </td>
                  <td className="td text-right">
                    <span className="mr-2">{l.active ? <Badge tone="green">active</Badge> : <Badge>disabled</Badge>}</span>
                    <ActionButton url="/api/merchant/links" body={{ action: "toggle", id: l.id }}>
                      {l.active ? "Disable" : "Enable"}
                    </ActionButton>
                  </td>
                </tr>
              ))}
              {links.length === 0 && (
                <tr>
                  <td className="td text-slate-500" colSpan={6}>
                    No links yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
