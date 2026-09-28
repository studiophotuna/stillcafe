import { NextResponse } from "next/server";
import { authError, requireSession } from "@/lib/auth";
import { ForbiddenError, dbConfigured } from "@/lib/db";
import { getPeriod } from "@/lib/workload/server";

export const dynamic = "force-dynamic";

/** Dashboard data for ?team=&from=&to= (ms since epoch): working days and activity per person. */
export async function GET(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ demo: true });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const u = new URL(req.url).searchParams;
  const from = Number(u.get("from"));
  const to = Number(u.get("to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 370 * 86_400_000)
    return NextResponse.json({ error: "Choose a period of up to a year." }, { status: 400 });
  try {
    return NextResponse.json(await getPeriod(s.token, s.personId, u.get("team"), from, to));
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return authError(e);
  }
}
