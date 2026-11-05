import { listRestrictedRegions, travelRuleThresholdUsdCents } from "@/lib/compliance";
import { TRAVEL_RULE } from "@/config/app";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

export default async function StorePage() {
  const restricted = await listRestrictedRegions();
  return (
    <CheckoutForm
      restricted={restricted}
      travelRuleThresholdCents={travelRuleThresholdUsdCents()}
      travelRuleSource={TRAVEL_RULE.source}
      travelRuleThresholdSgd={TRAVEL_RULE.enhancedThresholdSgd}
    />
  );
}
