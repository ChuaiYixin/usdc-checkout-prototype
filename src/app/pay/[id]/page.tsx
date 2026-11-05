import { notFound } from "next/navigation";
import { getPaymentView } from "@/lib/payments";
import { PayClient } from "./PayClient";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getPaymentView(id);
  if (!view) notFound();
  return <PayClient initial={view} />;
}
