import { NextResponse } from "next/server";
import { authError, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Admin: who has a sign-in and who still has a temporary password. */
export async function GET() {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { data, error } = await db().rpc("workforce_logins", { p_token: s.token });
  if (error) return authError(error);
  return NextResponse.json({ logins: data });
}
