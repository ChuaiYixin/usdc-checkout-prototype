import { NextResponse } from "next/server";
import { applyExceptionAction, type ExceptionAction } from "@/lib/exceptions";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = (await req.json()) as { action: ExceptionAction };
  try {
    await applyExceptionAction(Number(id), action);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
