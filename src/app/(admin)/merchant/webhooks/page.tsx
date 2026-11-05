import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getMerchantSettings } from "@/lib/settings";
import { RETRY_SCHEDULE_MS } from "@/lib/webhooks";
import { Badge } from "@/components/ui";
import { Time } from "@/components/time";
import { ActionButton } from "@/components/ActionButton";
import { getT } from "@/i18n/server";

export default async function WebhooksPage() {
  const t = await getT();
  const settings = await getMerchantSettings();
  const events = await db.select().from(schema.webhookEvents).orderBy(desc(schema.webhookEvents.createdAt)).limit(40);
  const deliveries = events.length
    ? await db.select().from(schema.webhookDeliveries).where(inArray(schema.webhookDeliveries.eventId, events.map((e) => e.id))).orderBy(schema.webhookDeliveries.attempt)
    : [];
  const inbox = await db.select().from(schema.mockMerchantInbox).orderBy(desc(schema.mockMerchantInbox.id)).limit(8);
  const schedule = RETRY_SCHEDULE_MS.map((ms) => (ms < 60_000 ? `${ms / 1000}s` : `${ms / 60_000}m`)).join(" → ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("Webhooks")}</h1>
        <p className="text-sm text-slate-500">{t("Every status change is pushed to your server, signed, and retried until it's acknowledged (R9).")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <p className="text-xs font-medium text-slate-500">{t("Endpoint")}</p>
          <p className="mono mt-1 break-all">{settings.webhookUrl}</p>
          <p className="mt-3 text-xs text-slate-500">
            {t("Signed with HMAC-SHA256 in the x-webhook-signature header. At-least-once delivery — de-duplicate on event id. Retry schedule (compressed for the demo): {schedule}, then marked failed.", { schedule })}
          </p>
        </section>
        <section className="card p-5">
          <p className="text-xs font-medium text-slate-500">{t("Mock merchant server")}</p>
          <p className="mt-1 font-semibold">
            {settings.mockEndpointFailing ? <span className="text-rose-600">{t("Simulating outage (503)")}</span> : <span className="text-emerald-600">{t("Healthy (200)")}</span>}
          </p>
          <div className="mt-3">
            <ActionButton url="/api/merchant/settings" body={{ mockEndpointFailing: !settings.mockEndpointFailing }} className={settings.mockEndpointFailing ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
              {t(settings.mockEndpointFailing ? "Bring endpoint back up" : "Simulate endpoint outage")}
            </ActionButton>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 font-semibold">{t("Events")}</h2>
        <ul className="divide-y divide-line">
          {events.map((e) => {
            const ds = deliveries.filter((d) => d.eventId === e.id);
            return (
              <li key={e.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm hover:bg-slate-50/60">
                    <span className="mono shrink-0 font-semibold sm:w-52">{e.type}</span>
                    {e.orderId ? (
                      <Link href={`/merchant/orders/${e.orderId}`} className="mono w-24 text-brand hover:underline">
                        {e.orderId}
                      </Link>
                    ) : (
                      <span className="w-24" />
                    )}
                    <span className="text-xs text-slate-500">
                      <Time ms={e.createdAt} />
                    </span>
                    <span className="flex items-center gap-3 text-xs text-slate-500 sm:ml-auto">
                      {t(e.attempts === 1 ? "{n} attempt" : "{n} attempts", { n: e.attempts })}
                      {e.status === "pending" && e.attempts > 0 && (
                        <span>
                          {t("next retry")} <Time ms={e.nextAttemptAt} />
                        </span>
                      )}
                      <Badge tone={e.status === "delivered" ? "green" : e.status === "failed" ? "red" : "amber"}>{t(e.status)}</Badge>
                    </span>
                  </summary>
                  <div className="grid min-w-0 gap-4 bg-slate-50/60 px-5 py-4 lg:grid-cols-2 [&>*]:min-w-0">
                    <div>
                      <p className="mb-2 text-xs font-semibold text-slate-500">{t("Delivery attempts")}</p>
                      <ul className="space-y-1 text-xs">
                        {ds.map((d) => (
                          <li key={d.id} className="flex gap-3">
                            <span className="w-6 text-slate-400">#{d.attempt}</span>
                            <Time ms={d.createdAt} />
                            <Badge tone={d.statusCode && d.statusCode < 300 ? "green" : "red"}>{d.statusCode ?? t("error")}</Badge>
                            <span className="text-slate-500">{d.durationMs} ms</span>
                            <span className="truncate text-slate-500">{d.error ?? d.responseBody}</span>
                          </li>
                        ))}
                        {ds.length === 0 && <li className="text-slate-400">{t("Not attempted yet")}</li>}
                      </ul>
                      <div className="mt-3">
                        <ActionButton url={`/api/merchant/webhooks/${e.id}/resend`}>{t("Resend now")}</ActionButton>
                      </div>
                    </div>
                    <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                      {JSON.stringify(JSON.parse(e.payloadJson), null, 2)}
                    </pre>
                  </div>
                </details>
              </li>
            );
          })}
          {events.length === 0 && <li className="p-5 text-sm text-slate-500">{t("No events yet.")}</li>}
        </ul>
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 font-semibold">{t("Mock merchant server — last received")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody className="divide-y divide-line">
              {inbox.map((m) => (
                <tr key={m.id}>
                  <td className="td text-xs text-slate-500"><Time ms={m.receivedAt} /></td>
                  <td className="td mono">{m.type}</td>
                  <td className="td mono text-xs text-slate-500">{m.eventId}</td>
                  <td className="td">{m.signatureValid ? <Badge tone="green">{t("signature valid")}</Badge> : <Badge tone="red">{t("bad signature")}</Badge>}</td>
                  <td className="td"><Badge tone={m.respondedWith === 200 ? "green" : "red"}>{t("responded {n}", { n: m.respondedWith })}</Badge></td>
                </tr>
              ))}
              {inbox.length === 0 && (
                <tr>
                  <td className="td text-slate-500">{t("No webhooks received yet.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
