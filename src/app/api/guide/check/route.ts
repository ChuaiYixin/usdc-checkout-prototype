import { NextResponse } from "next/server";
import { runChecks } from "@/guide/checks";

// GET /api/guide/check?since=<ms> → which steps the app has seen happen since the person started this part.
export async function GET(req: Request) {
  const since = Number(new URL(req.url).searchParams.get("since"));
  if (!Number.isFinite(since) || since <= 0) return NextResponse.json({ error: "since is required" }, { status: 400 });
  return NextResponse.json(await runChecks(since), { headers: { "cache-control": "no-store" } });
}
