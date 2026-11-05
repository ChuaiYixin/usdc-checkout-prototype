import { reconciliationCsv } from "@/lib/reconciliation";

export async function GET() {
  const csv = await reconciliationCsv();
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="reconciliation-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
