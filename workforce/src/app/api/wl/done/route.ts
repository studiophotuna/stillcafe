import { NextResponse } from "next/server";
import { authError, requireSession } from "@/lib/auth";
import { ForbiddenError, dbConfigured } from "@/lib/db";
import { getDone } from "@/lib/workload/server";

export const dynamic = "force-dynamic";

/** Finished tasks of ?team= done between ?from= and ?to= (ms since epoch), up to a year and a bit. */
export async function GET(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ demo: true });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const u = new URL(req.url).searchParams;
  const from = Number(u.get("from"));
  const to = Number(u.get("to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 400 * 86_400_000)
    return NextResponse.json({ error: "Choose a period of up to a year." }, { status: 400 });
  try {
    return NextResponse.json({ tasks: await getDone(s.token, s.personId, u.get("team"), from, to) });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return authError(e);
  }
}
