import { NextResponse } from "next/server";
import { authError, requireSession } from "@/lib/auth";
import { ForbiddenError, dbConfigured } from "@/lib/db";
import { getData } from "@/lib/workload/server";

export const dynamic = "force-dynamic";

/** Workload data for one team (?team=, default: the person's first team), or { mode: "demo" } when the database is switched off. */
export async function GET(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ mode: "demo" });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  try {
    const team = new URL(req.url).searchParams.get("team");
    return NextResponse.json({ mode: "db", data: await getData(s.token, s.personId, team) });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message, code: "team" }, { status: 403 });
    return authError(e);
  }
}
