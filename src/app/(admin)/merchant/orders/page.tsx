import { listOrders } from "@/lib/queries";
import { OrdersTable } from "../OrdersTable";

export default async function OrdersPage() {
  const rows = await listOrders();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-slate-500">
          Every payment request has its own deposit address, so each on-chain transfer maps to exactly one order (R7).
        </p>
      </div>
      <section className="card overflow-hidden">
        <OrdersTable rows={rows} />
      </section>
    </div>
  );
}
