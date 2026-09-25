import { NextResponse } from "next/server";
import { authError, requireSession } from "@/lib/auth";
import { ANNUAL, CODES } from "@/lib/calendar/constants";
import { Cal, allApproved } from "@/lib/calendar/engine";
import { getCalendar } from "@/lib/calendar/server";
import { db, dbConfigured } from "@/lib/db";
import { dayKey } from "@/lib/workload/clock";
import type { Activity } from "@/lib/workload/types";

export const dynamic = "force-dynamic";
const DAYS = 30;

/**
 * Things the signed-in person should file in BIPO: their leave approved in the last 30
 * days (by request date) and overtime approved in the last 30 days, with the BIPO links.
 */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ demo: true });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  try {
    const data = await getCalendar(s.token);
    const now = Date.now();
    const c = new Cal(data, dayKey(now));
    const since = dayKey(now - DAYS * 86_400_000);
    const leave = data.requests
      .filter((q) => q.pid === s.personId && ANNUAL.includes(q.type) && allApproved(q) && q.created >= since)
      .map((q) => ({ id: q.id, label: CODES[q.type].label, start: q.start, end: q.end }));
    const me = c.people.get(s.personId);
    const teams = me ? c.O.branchesOf(me).map((b) => b.id) : [];
    const ot: { id: string; otMin: number; day: string }[] = [];
    for (const team of teams) {
      const r = await db().rpc("workforce_activities", { p_token: s.token, p_team: team, p_since: now - DAYS * 86_400_000 });
      if (r.error) continue; // team without Workload yet
      for (const a of (r.data ?? []) as Activity[])
        if (a.pid === s.personId && a.kind === "end" && a.otStatus === "approved" && a.otMin > 0) ot.push({ id: a.id, otMin: a.otMin, day: dayKey(a.start) });
    }
    return NextResponse.json({ leave, ot, links: { leave: data.links?.bipoLeave ?? "", ot: data.links?.bipoOt ?? "" } });
  } catch (e) {
    return authError(e);
  }
}
