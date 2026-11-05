import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { listRestrictedRegions, travelRuleThresholdUsdCents } from "@/lib/compliance";
import { LinkCheckout } from "./LinkCheckout";

export const dynamic = "force-dynamic";

export default async function PaymentLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const link = await db.query.paymentLinks.findFirst({ where: eq(schema.paymentLinks.id, id) });
  if (!link) notFound();
  return (
    <LinkCheckout
      link={{ id: link.id, title: link.title, amountCents: link.amountCents, active: !!link.active }}
      restricted={await listRestrictedRegions()}
      enhanced={link.amountCents > travelRuleThresholdUsdCents()}
    />
  );
}
