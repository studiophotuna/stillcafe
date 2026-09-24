import { NextResponse } from "next/server";
import { authError, requireSession } from "@/lib/auth";
import { getCalendar } from "@/lib/calendar/server";
import { dbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Saved calendar for a signed-in person, or { mode: "demo" } when the database is switched off. */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ mode: "demo" });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ mode: "db", data: await getCalendar(s.token) });
  } catch (e) {
    return authError(e);
  }
}
