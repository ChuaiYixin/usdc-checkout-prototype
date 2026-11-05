import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { getOrderDetail, refundableOnchain } from "@/lib/queries";
import { CHAINS, addressUrl, txUrl, type ChainKey } from "@/config/chains";
import { PLATFORM_FEE_BPS, countryName } from "@/config/app";
import { formatUsdc, shortHex } from "@/lib/money";
import { Badge, ExplorerLink, SimTag } from "@/components/ui";
import { FundsBadge, PrStatusBadge, RefundBadge, exceptionLabel } from "@/components/status";
import { Time } from "@/components/time";
import { ActionButton } from "@/components/ActionButton";
import { getT } from "@/i18n/server";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();
  const d = await getOrderDetail(id);
  if (!d) notFound();
  const { order, pr, transfers, refunds, exceptions, events, activity } = d;
  const chain = pr ? CHAINS[pr.chainKey as ChainKey] : null;
  const items = JSON.parse(order.itemsJson) as { name: string; quantity: number; unitCents: number }[];
  const travel = JSON.parse(order.travelRuleJson) as Record<string, string>;
  const refundable = pr ? refundableOnchain(pr, refunds) : 0n;
  const usdc = (onchain: string | bigint) => formatUsdc(BigInt(onchain) * BigInt(pr?.divisor ?? 1));
  const isSim = !!order.simulated;

  return (
    <div className="space-y-6">
      <Link href="/merchant/orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {t("Orders")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mono flex flex-wrap items-center gap-3 text-2xl font-bold">
            {order.id} {pr && <PrStatusBadge status={pr.status} />} {pr && <FundsBadge status={pr.fundsStatus} />}
            {isSim && <SimTag />}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("Placed by {name} ({country})", { name: order.customerName, country: t(countryName(order.country)) })} · <Time ms={order.createdAt} /> SGT
            {pr?.fundedVia === "gasless" && <> · {t("paid by gasless signature (platform paid gas)")}</>}
          </p>
        </div>
        {pr && refundable > 0n && (
          <div className="text-right">
            <ActionButton
              url="/api/merchant/refunds"
              body={{ paymentRequestId: pr.id }}
              className="btn-danger"
              confirm={t("Refund {n} USDC in full to the original paying address {address}?\n\nThe destination is re-screened first. On-chain refunds can't be reversed.", {
                n: usdc(refundable),
                address: pr.payerAddress ?? "",
              })}
            >
              <RotateCcw className="h-4 w-4" /> {t("Refund in full")}
            </ActionButton>
            <p className="mt-1 text-xs text-slate-500">{t("Only to the original address {address}", { address: shortHex(pr.payerAddress ?? "") })}</p>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold">{t("Payment")}</h2>
          {pr ? (
            <dl className="mt-4 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm sm:grid-cols-[180px_minmax(0,1fr)] [&_dd]:break-all">
              <Dt>{t("Amount")}</Dt>
              <dd>
                <b>{formatUsdc(pr.amountMicros)} USDC</b> <span className="text-slate-500">{t("= ${n} order total", { n: (order.totalCents / 100).toFixed(2) })}</span>
                {pr.divisor > 1 && <span className="block text-xs text-amber-700">{t("On-chain (testnet 1/{d} scale): {n} test USDC", { d: pr.divisor, n: formatUsdc(pr.amountOnchain) })}</span>}
              </dd>
              <Dt>{t("Received")}</Dt>
              <dd>
                {usdc(pr.receivedOnchain)} USDC
                {BigInt(pr.excessRefundedOnchain) > 0n && <span className="text-slate-500"> · {t("{n} excess refunded", { n: usdc(pr.excessRefundedOnchain) })}</span>}
              </dd>
              <Dt>{t("Network")}</Dt>
              <dd>{chain?.name}</dd>
              <Dt>{t("Deposit address")}</Dt>
              <dd>
                {isSim ? <span className="mono">{pr.address}</span> : <ExplorerLink href={addressUrl(chain!, pr.address)}>{pr.address}</ExplorerLink>}
                <span className="ml-2 text-xs text-slate-400">{t("HD index {n}", { n: pr.derivationIndex })}</span>
              </dd>
              <Dt>{t("Payer (original address)")}</Dt>
              <dd className="mono">{pr.payerAddress ?? "—"}</dd>
              <Dt>{t("Confirmations")}</Dt>
              <dd>
                {pr.confirmations} · {t("buyer success at {n} blocks; funds available once", { n: pr.successThreshold })}{" "}
                {chain?.confirmations.finalityTag ? t(chain.finalityLabel) : t("{n} blocks", { n: pr.finalityThreshold })}
              </dd>
              <Dt>{t("Request window")}</Dt>
              <dd>
                <Time ms={pr.createdAt} /> → <Time ms={pr.expiresAt} />
              </dd>
              <Dt>{t("Fee")}</Dt>
              <dd>
                {formatUsdc(pr.feeMicros)} USDC <span className="text-xs text-slate-400">{t("({n}%, illustrative pricing)", { n: (PLATFORM_FEE_BPS / 100).toFixed(2) })}</span>
              </dd>
              <Dt>{t("Net to merchant")}</Dt>
              <dd className="font-semibold">{formatUsdc(BigInt(pr.amountMicros) - BigInt(pr.feeMicros))} USDC</dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{t("No payment request.")}</p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">{t("Buyer & travel rule")}</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {items.map((it) => (
              <p key={it.name} className="text-slate-600">
                {it.quantity} × {t(it.name)}
              </p>
            ))}
            <p className="text-slate-600">{t("Ship to: {address}", { address: order.shippingAddress })}</p>
          </dl>
          <div className="mt-4 break-all rounded-xl bg-slate-50 p-3 text-xs">
            <p className="mb-1 font-semibold">
              {t("Originator record")} · <Badge tone={order.travelRuleTier === "enhanced" ? "violet" : "gray"}>{t(order.travelRuleTier === "enhanced" ? "enhanced tier" : "basic tier")}</Badge>
            </p>
            {Object.entries(travel).map(([k, v]) => (
              <p key={k} className="text-slate-600">
                <span className="text-slate-400">{t(k)}:</span> {v}
              </p>
            ))}
            <p className="text-slate-600">
              <span className="text-slate-400">{t("walletOwnership")}:</span>{" "}
              {pr?.walletVerifiedAddress ? t("verified by signature ({address})", { address: shortHex(pr.walletVerifiedAddress) }) : t("not required / not signed")}
            </p>
            <p className="mt-2 text-[11px] text-slate-400">{t("Tier threshold: S$1,500 (MAS Notice PSN02, paragraphs 13.4 and 13.6). Identity verification is not modelled.")}</p>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 font-semibold">{t("On-chain transfers")}</h2>
        {transfers.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">{t("Nothing received yet.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="th">{t("Tx hash")}</th>
                  <th className="th">{t("From")}</th>
                  <th className="th text-right">{t("Amount")}</th>
                  <th className="th">{t("Block")}</th>
                  <th className="th">{t("Conf.")}</th>
                  <th className="th">{t("Status")}</th>
                  <th className="th">{t("Flags")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {transfers.map((tr) => (
                  <tr key={tr.id}>
                    <td className="td">
                      {tr.simulated ? <span className="mono text-slate-500">{shortHex(tr.txHash, 8, 6)}</span> : <ExplorerLink href={txUrl(chain!, tr.txHash)}>{shortHex(tr.txHash, 8, 6)}</ExplorerLink>}
                    </td>
                    <td className="td mono">{shortHex(tr.fromAddress)}</td>
                    <td className="td text-right tabular-nums">{tr.kind === "usdc" ? `${usdc(tr.amountOnchain)} USDC` : `${formatUsdc(tr.amountOnchain)} ${tr.tokenSymbol}`}</td>
                    <td className="td text-slate-500">{tr.blockNumber.toLocaleString()}</td>
                    <td className="td">{tr.confirmations}</td>
                    <td className="td">
                      <Badge tone={tr.status === "confirmed" ? "green" : tr.status === "reorged" ? "red" : "blue"}>{t(tr.status)}</Badge>
                    </td>
                    <td className="td space-x-1">
                      {tr.simulated ? <SimTag /> : null}
                      {tr.kind === "non_usdc" && <Badge tone="amber">{t("non-USDC")}</Badge>}
                      {tr.late ? <Badge tone="amber">{t(tr.acceptedLate ? "late · accepted" : "late")}</Badge> : null}
                      {tr.screeningHit ? <Badge tone="violet">{t("screening hit")}</Badge> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(refunds.length > 0 || exceptions.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card overflow-hidden">
            <h2 className="border-b border-line px-5 py-3 font-semibold">{t("Refunds")}</h2>
            {refunds.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">{t("None.")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {refunds.map((r) => (
                  <li key={r.id} className="space-y-1 px-5 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span>
                        <b>{r.tokenSymbol === "USDC" ? `${usdc(r.amountOnchain)} USDC` : `${formatUsdc(r.amountOnchain)} ${r.tokenSymbol}`}</b>{" "}
                        <span className="text-slate-500">· {t(r.reason)}</span>
                      </span>
                      <RefundBadge status={r.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {t("To {address} · method {method} · screening {result}", { address: shortHex(r.toAddress), method: t(r.method), result: t(r.screeningResult) })}
                    </p>
                    {r.txHash && (
                      <p className="text-xs">
                        {r.method === "simulated" ? <span className="mono text-slate-500">{r.txHash}</span> : <ExplorerLink href={txUrl(chain!, r.txHash)}>{shortHex(r.txHash, 10, 8)}</ExplorerLink>}
                      </p>
                    )}
                    {r.buyerNotifiedAt && (
                      <p className="text-xs text-slate-500">
                        {t("Buyer notified by email (simulated) at")} <Time ms={r.buyerNotifiedAt} />
                      </p>
                    )}
                    {r.error && <p className="text-xs text-rose-600">{t(r.error)}</p>}
                    {r.status === "failed" && <ActionButton url={`/api/merchant/refunds/${r.id}/retry`}>{t("Retry refund")}</ActionButton>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card overflow-hidden">
            <h2 className="flex items-center justify-between border-b border-line px-5 py-3 font-semibold">
              {t("Exceptions")}{" "}
              <Link href="/ops/exceptions" className="text-xs font-medium text-brand hover:underline">
                {t("Exception queue")} →
              </Link>
            </h2>
            {exceptions.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">{t("None.")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {exceptions.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>
                      {t(exceptionLabel(e.type))}
                      {e.resolution && <span className="block text-xs text-slate-500">{t(e.resolution)}</span>}
                    </span>
                    <Badge tone={e.status === "open" ? "amber" : "gray"}>{t(e.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="flex items-center justify-between border-b border-line px-5 py-3 font-semibold">
            {t("Webhooks sent")}{" "}
            <Link href="/merchant/webhooks" className="text-xs font-medium text-brand hover:underline">
              {t("Delivery log")} →
            </Link>
          </h2>
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="mono">{e.type}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {t(e.attempts === 1 ? "{n} attempt" : "{n} attempts", { n: e.attempts })}
                  <Badge tone={e.status === "delivered" ? "green" : e.status === "failed" ? "red" : "amber"}>{t(e.status)}</Badge>
                </span>
              </li>
            ))}
            {events.length === 0 && <li className="p-5 text-sm text-slate-500">{t("None yet.")}</li>}
          </ul>
        </section>
        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 font-semibold">{t("Timeline")}</h2>
          <ol className="max-h-96 space-y-3 overflow-y-auto px-5 py-4">
            {activity.map((a) => (
              <li key={a.id} className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 break-words text-sm sm:grid-cols-[110px_minmax(0,1fr)]">
                <span className="text-xs text-slate-400">
                  <Time ms={a.createdAt} />
                </span>
                <span className="text-slate-700">{t(a.message)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-slate-500">{children}</dt>;
}
