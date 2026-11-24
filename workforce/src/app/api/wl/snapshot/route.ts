import { NextResponse } from "next/server";
import { authError, requireSession, sessionToken } from "@/lib/auth";
import { ForbiddenError, dbConfigured } from "@/lib/db";
import { getData, wlStamp } from "@/lib/workload/server";

export const dynamic = "force-dynamic";

/**
 * Workload data for one team (?team=, default: the person's first team), or { mode: "demo" } when the database is switched off.
 * ?v= is the change stamp the page already has: if it's still current the answer is just
 * { same: true } (one small database read instead of the calendar, every task and activity).
 */
export async function GET(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ mode: "demo" });
  const url = new URL(req.url);
  const team = url.searchParams.get("team");
  const seen = url.searchParams.get("v");
  const token = team ? await sessionToken() : null;
  // Read the stamp before the data, so a change in between shows up on the next refresh.
  const stamp = token ? await wlStamp(token, team!) : null;
  if (stamp && stamp === seen) return NextResponse.json({ mode: "db", same: true });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ mode: "db", data: await getData(s.token, s.personId, team), stamp });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message, code: "team" }, { status: 403 });
    return authError(e);
  }
}
