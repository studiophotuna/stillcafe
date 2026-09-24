import { NextResponse } from "next/server";
import { authError, setSessionCookie } from "@/lib/auth";
import { db, dbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ error: "Sign-in needs the database." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
  if (!b?.email || !b?.password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  const { data, error } = await db().rpc("workforce_login", { p_email: b.email, p_password: b.password });
  if (error) return authError(error);
  if (!data) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  const d = data as { token: string; mustChange: boolean };
  const res = NextResponse.json({ mustChange: d.mustChange });
  setSessionCookie(res, d.token);
  return res;
}
