import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { addWhitelist, runSettlement, withdraw } from "@/lib/settlement";

export async function POST(req: Request) {
  const body = await req.json();
  try {
    if (body.action === "run") return NextResponse.json({ id: await runSettlement() });
    if (body.action === "whitelist") {
      await addWhitelist(body.address, body.label, body.code);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "withdraw") {
      await withdraw(body.address, parseUnits(String(body.amount), 6));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
