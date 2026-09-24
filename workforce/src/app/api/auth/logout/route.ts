import { NextResponse } from "next/server";
import { COOKIE, clearSessionCookie } from "@/lib/auth";
import { db, dbConfigured } from "@/lib/db";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token && dbConfigured()) await db().rpc("workforce_logout", { p_token: token });
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
