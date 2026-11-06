import Link from "next/link";
import { CHAINS, txUrl, type ChainKey } from "@/config/chains";
import { formatUsdc, shortHex } from "@/lib/money";
import type { listOrders } from "@/lib/queries";
import { ExplorerLink } from "@/components/ui";
import { FundsBadge, PrStatusBadge } from "@/components/status";
import { Time } from "@/components/time";
import { getT } from "@/i18n/server";

export async function OrdersTable({ rows }: { rows: Awaited<ReturnType<typeof listOrders>> }) {
  const t = await getT();
  if (!rows.length) return <p className="p-8 text-center text-sm text-slate-500">{t("No orders yet — place one from the store checkout.")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-line bg-slate-50/60">
          <tr>
            <th className="th">{t("Order")}</th>
            <th className="th">{t("Created (SGT)")}</th>
            <th className="th">{t("Customer")}</th>
            <th className="th text-right">{t("Amount")}</th>
            <th className="th">{t("Chain")}</th>
            <th className="th">{t("Tx hash")}</th>
            <th className="th">{t("Status")}</th>
            <th className="th">{t("Funds")}</th>
            <th className="th text-right">{t("Fee")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(({ order, pr }) => {
            const chain = pr ? CHAINS[pr.chainKey as ChainKey] : null;
            return (
              <tr key={order.id} className="hover:bg-slate-50/60">
                <td className="td">
                  <Link href={`/merchant/orders/${order.id}`} className="mono font-semibold text-brand hover:underline">
                    {order.id}
                  </Link>
                  
                </td>
                <td className="td text-slate-500"><Time ms={order.createdAt} /></td>
                <td className="td">
                  {order.customerName} <span className="text-xs text-slate-400">{order.country}</span>
                </td>
                <td className="td text-right tabular-nums">
                  {pr ? formatUsdc(pr.amountMicros) : (order.totalCents / 100).toFixed(2)} <span className="text-xs text-slate-400">USDC</span>
                </td>
                <td className="td text-slate-600">{chain?.shortName ?? "—"}</td>
                <td className="td">
                  {pr?.firstTxHash ? (
                    pr.simulated || order.simulated ? (
                      <span className="mono text-slate-500">{shortHex(pr.firstTxHash)}</span>
                    ) : (
                      <ExplorerLink href={txUrl(chain!, pr.firstTxHash)}>{shortHex(pr.firstTxHash)}</ExplorerLink>
                    )
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="td">{pr && <PrStatusBadge status={pr.status} />}</td>
                <td className="td">{pr && <FundsBadge status={pr.fundsStatus} />}</td>
                <td className="td text-right text-slate-500 tabular-nums">
                  {pr && ["succeeded", "refunded"].includes(pr.status) ? formatUsdc(pr.feeMicros) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
