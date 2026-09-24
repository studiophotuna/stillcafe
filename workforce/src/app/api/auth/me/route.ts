import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Who is signed in: { personId, email, mustChange }, { demo: true } without a database, or 401. */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ demo: true });
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  return NextResponse.json({ personId: s.personId, email: s.email, mustChange: s.mustChange });
}
