import { NextResponse } from "next/server";
import { authError, getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Change my password (required after a temporary one). */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { current?: string; next?: string } | null;
  if (!b?.current || !b?.next) return NextResponse.json({ error: "Fill in both passwords." }, { status: 400 });
  const { data, error } = await db().rpc("workforce_change_password", { p_token: s.token, p_old: b.current, p_new: b.next });
  if (error) return authError(error);
  if (!data) return NextResponse.json({ error: "Your current password is wrong." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
