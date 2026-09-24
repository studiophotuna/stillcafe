import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { getCalendar } from "@/lib/calendar/server";

export const dynamic = "force-dynamic";

/** Saved calendar, or { mode: "demo" } when the database is switched off. */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ mode: "demo" });
  try {
    return NextResponse.json({ mode: "db", data: await getCalendar() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ mode: "error", error: "The database couldn’t be reached." }, { status: 503 });
  }
}
