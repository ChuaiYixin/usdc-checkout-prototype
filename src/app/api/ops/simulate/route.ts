import { NextResponse } from "next/server";
import { expireNow, simulateTransfer, type Scenario } from "@/lib/simulator";

export async function POST(req: Request) {
  const { paymentRequestId, scenario } = (await req.json()) as { paymentRequestId: string; scenario: Scenario | "expire_now" };
  try {
    if (scenario === "expire_now") {
      await expireNow(paymentRequestId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await simulateTransfer(paymentRequestId, scenario));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
