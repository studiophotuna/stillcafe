import { NextResponse } from "next/server";
import { authError, requireSession, sessionToken } from "@/lib/auth";
import { calVersion, loadCalendar } from "@/lib/calendar/server";
import { emptyCalendar } from "@/lib/calendar/seed";
import { dbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Saved calendar for a signed-in person, or { mode: "demo" } when the database is switched off.
 * ?v= is the version the page already has: if it's still current the answer is just
 * { same: true } (one small database read instead of the whole calendar).
 */
export async function GET(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ mode: "demo" });
  const seen = new URL(req.url).searchParams.get("v");
  const token = seen ? await sessionToken() : null;
  if (token && String(await calVersion(token)) === seen) return NextResponse.json({ mode: "db", same: true });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  try {
    const snap = await loadCalendar(s.token);
    return NextResponse.json({ mode: "db", data: snap?.data ?? emptyCalendar(), version: snap?.version ?? 0 });
  } catch (e) {
    return authError(e);
  }
}
