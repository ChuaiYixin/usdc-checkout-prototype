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

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getOrderDetail(id);
  if (!d) notFound();
  const { order, pr, transfers, refunds, exceptions, events, activity, claims } = d;
  const openClaim = claims.find((c) => c.status === "sent");
  const chain = pr ? CHAINS[pr.chainKey as ChainKey] : null;
  const items = JSON.parse(order.itemsJson) as { name: string; quantity: number; unitCents: number }[];
  const travel = JSON.parse(order.travelRuleJson) as Record<string, string>;
  const refundable = pr ? refundableOnchain(pr, refunds) : 0n;
  const usdc = (onchain: string | bigint) => formatUsdc(BigInt(onchain) * BigInt(pr?.divisor ?? 1));
  const isSim = !!order.simulated;

  return (
    <div className="space-y-6">
      <Link href="/merchant/orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mono flex items-center gap-3 text-2xl font-bold">
            {order.id} {pr && <PrStatusBadge status={pr.status} />} {pr && <FundsBadge status={pr.fundsStatus} />}
            {isSim && <SimTag />}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Placed <Time ms={order.createdAt} /> SGT by {order.customerName} ({countryName(order.country)}) · via {order.source.replace("_", " ")}
            {order.merchantReference && <> · ref <span className="mono">{order.merchantReference}</span></>}
            {pr?.fundedVia && <> · paid by {pr.fundedVia === "gasless" ? "gasless signature (platform paid gas)" : pr.fundedVia === "onramp" ? "card via on-ramp (simulated)" : pr.fundedVia}</>}
          </p>
          {pr?.payerIsExchange ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs text-amber-800 ring-1 ring-amber-200">
              Paid from a known exchange wallet (simulated label) — refunds go through a verified refund-address claim
            </p>
          ) : null}
        </div>
        {pr && refundable > 0n && !openClaim && (
          <div className="text-right">
            <ActionButton
              url="/api/merchant/refunds"
              body={{ paymentRequestId: pr.id }}
              className="btn-danger"
              confirm={
                pr.payerIsExchange
                  ? `This buyer paid from an exchange. Email them a refund claim link for ${usdc(refundable)} USDC?\n\nThey verify their email and name a wallet they control; it's screened before anything is sent.`
                  : `Refund ${usdc(refundable)} USDC in full to the original paying address ${pr.payerAddress}?\n\nThe destination is re-screened first. On-chain refunds can't be reversed.`
              }
            >
              <RotateCcw className="h-4 w-4" /> {pr.payerIsExchange ? "Refund via claim link" : "Refund in full"}
            </ActionButton>
            <p className="mt-1 text-xs text-slate-500">
              {pr.payerIsExchange ? "Buyer confirms a verified address" : `Only to the original address ${shortHex(pr.payerAddress ?? "")}`}
            </p>
          </div>
        )}
        {openClaim && (
          <div className="text-right text-sm">
            <p className="font-medium text-amber-700">Refund claim sent to buyer</p>
            <Link href={`/refund-claim/${openClaim.id}`} target="_blank" className="text-xs text-brand hover:underline">
              Open buyer&apos;s claim page (simulated email link) →
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold">Payment</h2>
          {pr ? (
            <dl className="mt-4 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm sm:grid-cols-[180px_minmax(0,1fr)] [&_dd]:break-all">
              <Dt>Amount</Dt>
              <dd>
                <b>{formatUsdc(pr.amountMicros)} USDC</b> <span className="text-slate-500">= ${(order.totalCents / 100).toFixed(2)} order total</span>
                {pr.divisor > 1 && <span className="block text-xs text-amber-700">On-chain (testnet 1/{pr.divisor} scale): {formatUsdc(pr.amountOnchain)} test USDC</span>}
              </dd>
              <Dt>Received</Dt>
              <dd>{usdc(pr.receivedOnchain)} USDC{BigInt(pr.excessRefundedOnchain) > 0n && <span className="text-slate-500"> · {usdc(pr.excessRefundedOnchain)} excess refunded</span>}</dd>
              <Dt>Network</Dt>
              <dd>{chain?.name}</dd>
              <Dt>Deposit address</Dt>
              <dd>
                {isSim ? <span className="mono">{pr.address}</span> : <ExplorerLink href={addressUrl(chain!, pr.address)}>{pr.address}</ExplorerLink>}
                <span className="ml-2 text-xs text-slate-400">HD index {pr.derivationIndex}</span>
              </dd>
              <Dt>Payer (original address)</Dt>
              <dd className="mono">{pr.payerAddress ?? "—"}</dd>
              <Dt>Confirmations</Dt>
              <dd>
                {pr.confirmations} · buyer success at {pr.successThreshold} blocks; funds available once{" "}
                {chain?.confirmations.finalityTag ? chain.finalityLabel : `${pr.finalityThreshold} blocks`}
              </dd>
              <Dt>Request window</Dt>
              <dd>
                <Time ms={pr.createdAt} /> → <Time ms={pr.expiresAt} />
              </dd>
              <Dt>Fee</Dt>
              <dd>
                {formatUsdc(pr.feeMicros)} USDC <span className="text-xs text-slate-400">({(PLATFORM_FEE_BPS / 100).toFixed(2)}%, illustrative pricing)</span>
              </dd>
              <Dt>Net to merchant</Dt>
              <dd className="font-semibold">{formatUsdc(BigInt(pr.amountMicros) - BigInt(pr.feeMicros))} USDC</dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No payment request.</p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Buyer & travel rule</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {items.map((it) => (
              <p key={it.name} className="text-slate-600">
                {it.quantity} × {it.name}
              </p>
            ))}
            <p className="text-slate-600">Ship to: {order.shippingAddress}</p>
          </dl>
          <div className="mt-4 break-all rounded-xl bg-slate-50 p-3 text-xs">
            <p className="mb-1 font-semibold">
              Originator record · <Badge tone={order.travelRuleTier === "enhanced" ? "violet" : "gray"}>{order.travelRuleTier} tier</Badge>
            </p>
            {Object.entries(travel).map(([k, v]) => (
              <p key={k} className="text-slate-600">
                <span className="text-slate-400">{k}:</span> {v}
              </p>
            ))}
            <p className="text-slate-600">
              <span className="text-slate-400">walletOwnership:</span>{" "}
              {pr?.walletVerifiedAddress ? `verified by signature (${shortHex(pr.walletVerifiedAddress)})` : "not required / not signed"}
            </p>
            <p className="mt-2 text-[11px] text-slate-400">Tier threshold: S$1,500 (MAS Notice PSN02, paragraphs 13.4 and 13.6). Identity verification is not modelled.</p>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 font-semibold">On-chain transfers</h2>
        {transfers.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Nothing received yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/60">
              <tr>
                <th className="th">Tx hash</th>
                <th className="th">From</th>
                <th className="th text-right">Amount</th>
                <th className="th">Block</th>
                <th className="th">Conf.</th>
                <th className="th">Status</th>
                <th className="th">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td className="td">
                    {t.simulated ? <span className="mono text-slate-500">{shortHex(t.txHash, 8, 6)}</span> : <ExplorerLink href={txUrl(chain!, t.txHash)}>{shortHex(t.txHash, 8, 6)}</ExplorerLink>}
                  </td>
                  <td className="td mono">{shortHex(t.fromAddress)}</td>
                  <td className="td text-right tabular-nums">
                    {t.kind === "usdc" ? `${usdc(t.amountOnchain)} USDC` : `${formatUsdc(t.amountOnchain)} ${t.tokenSymbol}`}
                  </td>
                  <td className="td text-slate-500">{t.blockNumber.toLocaleString()}</td>
                  <td className="td">{t.confirmations}</td>
                  <td className="td">
                    <Badge tone={t.status === "confirmed" ? "green" : t.status === "reorged" ? "red" : "blue"}>{t.status}</Badge>
                  </td>
                  <td className="td space-x-1">
                    {t.simulated ? <SimTag /> : null}
                    {t.kind === "non_usdc" && <Badge tone="amber">non-USDC</Badge>}
                    {t.late ? <Badge tone="amber">{t.acceptedLate ? "late · accepted" : "late"}</Badge> : null}
                    {t.screeningHit ? <Badge tone="violet">screening hit</Badge> : null}
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
            <h2 className="border-b border-line px-5 py-3 font-semibold">Refunds</h2>
            {refunds.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">None.</p>
            ) : (
              <ul className="divide-y divide-line">
                {refunds.map((r) => (
                  <li key={r.id} className="space-y-1 px-5 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span>
                        <b>{r.tokenSymbol === "USDC" ? `${usdc(r.amountOnchain)} USDC` : `${formatUsdc(r.amountOnchain)} ${r.tokenSymbol}`}</b>{" "}
                        <span className="text-slate-500">· {r.reason.replaceAll("_", " ")}</span>
                      </span>
                      <RefundBadge status={r.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      To <span className="mono">{shortHex(r.toAddress)}</span> · method {r.method} · screening {r.screeningResult}
                    </p>
                    {r.txHash && (
                      <p className="text-xs">
                        {r.method === "simulated" ? <span className="mono text-slate-500">{r.txHash}</span> : <ExplorerLink href={txUrl(chain!, r.txHash)}>{shortHex(r.txHash, 10, 8)}</ExplorerLink>}
                      </p>
                    )}
                    {r.buyerNotifiedAt && <p className="text-xs text-slate-500">Buyer notified by email (simulated) at <Time ms={r.buyerNotifiedAt} /></p>}
                    {r.error && <p className="text-xs text-rose-600">{r.error}</p>}
                    {r.status === "failed" && (
                      <ActionButton url={`/api/merchant/refunds/${r.id}/retry`}>Retry refund</ActionButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card overflow-hidden">
            <h2 className="flex items-center justify-between border-b border-line px-5 py-3 font-semibold">
              Exceptions{" "}
              <Link href="/ops/exceptions" className="text-xs font-medium text-brand hover:underline">
                Exception queue →
              </Link>
            </h2>
            {exceptions.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">None.</p>
            ) : (
              <ul className="divide-y divide-line">
                {exceptions.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>
                      {exceptionLabel(e.type)}
                      {e.resolution && <span className="block text-xs text-slate-500">{e.resolution}</span>}
                    </span>
                    <Badge tone={e.status === "open" ? "amber" : "gray"}>{e.status.replace("_", " ")}</Badge>
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
            Webhooks sent{" "}
            <Link href="/merchant/webhooks" className="text-xs font-medium text-brand hover:underline">
              Delivery log →
            </Link>
          </h2>
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="mono">{e.type}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {e.attempts} attempt{e.attempts === 1 ? "" : "s"}
                  <Badge tone={e.status === "delivered" ? "green" : e.status === "failed" ? "red" : "amber"}>{e.status}</Badge>
                </span>
              </li>
            ))}
            {events.length === 0 && <li className="p-5 text-sm text-slate-500">None yet.</li>}
          </ul>
        </section>
        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-5 py-3 font-semibold">Timeline</h2>
          <ol className="max-h-96 space-y-3 overflow-y-auto px-5 py-4">
            {activity.map((a) => (
              <li key={a.id} className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 break-words text-sm sm:grid-cols-[110px_minmax(0,1fr)]">
                <span className="text-xs text-slate-400">
                  <Time ms={a.createdAt} />
                </span>
                <span className="text-slate-700">{a.message}</span>
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
