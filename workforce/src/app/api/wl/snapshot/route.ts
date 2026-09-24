import { NextResponse } from "next/server";
import { authError, requireSession } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { getData } from "@/lib/workload/server";

export const dynamic = "force-dynamic";

/** Workload data for a signed-in person, or { mode: "demo" } when the database is switched off. */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ mode: "demo" });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  try {
    return NextResponse.json({ mode: "db", data: await getData(s.token) });
  } catch (e) {
    return authError(e);
  }
}
