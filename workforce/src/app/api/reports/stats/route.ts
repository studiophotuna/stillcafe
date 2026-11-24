import { NextResponse } from "next/server";
import { authError, requireSession } from "@/lib/auth";
import { ForbiddenError, dbConfigured } from "@/lib/db";
import { trackerStatsAll } from "@/lib/workload/server";

export const dynamic = "force-dynamic";

/** OT / KPI trackers: Workload figures per team for ?from=&to= (ms since epoch, up to ~a month). */
export async function GET(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ demo: true });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const u = new URL(req.url).searchParams;
  const from = Number(u.get("from"));
  const to = Number(u.get("to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 32 * 86_400_000)
    return NextResponse.json({ error: "Choose a week or a month." }, { status: 400 });
  try {
    return NextResponse.json({ teams: await trackerStatsAll(s.token, s.personId, from, to) });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return authError(e);
  }
}
