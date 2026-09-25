import { NextResponse } from "next/server";
import { authError, requireSession } from "@/lib/auth";
import { getCalendar } from "@/lib/calendar/server";
import { db, dbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Quick links: the signed-in person's own, plus the app-wide ones set by a system admin. */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ demo: true });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  try {
    const [mine, cal] = await Promise.all([db().rpc("workforce_my_links", { p_token: s.token }), getCalendar(s.token)]);
    if (mine.error) throw new Error(mine.error.message);
    return NextResponse.json({ mine: mine.data ?? [], shared: cal.links?.quick ?? [] });
  } catch (e) {
    return authError(e);
  }
}

/** Replace my quick links: [{ label, url }] (https only, up to 20). */
export async function POST(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ error: "No database configured." }, { status: 503 });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const b = (await req.json().catch(() => null)) as { links?: unknown } | null;
  const { error } = await db().rpc("workforce_set_my_links", { p_token: s.token, p_links: b?.links ?? [] });
  if (error?.message.includes("workforce_bad_links"))
    return NextResponse.json({ error: "Each link needs a name (up to 40 characters) and an address starting with https://. Up to 20 links." }, { status: 400 });
  if (error) return authError(error);
  return NextResponse.json({ ok: true });
}
