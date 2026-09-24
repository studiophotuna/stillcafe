import { NextResponse } from "next/server";
import { dbConfigured, getData } from "@/lib/workload/server";

export const dynamic = "force-dynamic";

/** Current Workload data, or { mode: "demo" } when no database is configured. */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ mode: "demo" });
  try {
    return NextResponse.json({ mode: "db", data: await getData() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ mode: "error", error: "The database couldn’t be reached." }, { status: 503 });
  }
}
