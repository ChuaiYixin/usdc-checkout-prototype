import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { logActivity } from "@/lib/activity";
import { getSetting, setSetting } from "@/lib/settings";
import { submitAuthorization } from "@/lib/eip3009";
import { checkGaslessAuthorization } from "@/lib/gasless";
import type { Authorization } from "@/lib/eip3009-types";
import { trackFunnel } from "@/lib/funnel";

// Gasless checkout (R18, docs/PRD-additions.md): the buyer signs an EIP-3009 authorisation for exactly the amount
// due to this request's deposit address; the platform submits it and pays the gas.
// Removes the "no ETH for gas" failure (PRD 卡支付 vs 稳定币: 主要失败原因).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { authorization: a, signature } = (await req.json()) as { authorization?: Authorization; signature?: `0x${string}` };
  const pr = await db.query.paymentRequests.findFirst({ where: eq(schema.paymentRequests.id, id) });
  if (!pr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const problem = await checkGaslessAuthorization(pr, a, signature);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // Abuse guard: one sponsored submission per request per 30 s.
  const key = `gasless:${pr.id}`;
  const last = Number((await getSetting(key)) ?? 0);
  if (Date.now() - last < 30_000) return NextResponse.json({ error: "A gasless payment was just submitted — please wait" }, { status: 429 });
  await setSetting(key, String(Date.now()));

  try {
    const hash = await submitAuthorization(a!, signature!);
    await logActivity(pr.orderId, pr.id, "payment.gasless_submitted", `Gasless payment: buyer ${a!.from} signed an EIP-3009 authorisation; platform submitted ${hash} and paid the gas`);
    await trackFunnel(pr.id, "tx_submitted", { mode: "gasless" });
    await db.update(schema.paymentRequests).set({ fundedVia: "gasless", updatedAt: Date.now() }).where(eq(schema.paymentRequests.id, pr.id));
    return NextResponse.json({ hash });
  } catch (e) {
    const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message;
    const friendly = /insufficient funds/i.test(msg) ? "The platform's gas wallet is empty — please pay with a normal transfer" : /balance/i.test(msg) ? "Your wallet doesn't hold enough USDC" : msg;
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
