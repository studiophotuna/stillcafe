import { NextResponse } from "next/server";
import { authError, issueLogin, requireSession } from "@/lib/auth";
import { rightsOf } from "@/lib/calendar/authz";
import { Cal } from "@/lib/calendar/engine";
import { getCalendar } from "@/lib/calendar/server";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/workload/clock";

export const dynamic = "force-dynamic";

/**
 * Admin: give a person a new temporary password (creates their sign-in if
 * missing), or with { remove: true } delete their sign-in (e.g. after they leave).
 */
export async function POST(req: Request) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const b = (await req.json().catch(() => null)) as { personId?: number; remove?: boolean } | null;
  try {
    const c = new Cal(await getCalendar(s.token), dayKey(Date.now()));
    const p = typeof b?.personId === "number" ? c.people.get(b.personId) : undefined;
    if (!p) return NextResponse.json({ error: "Person not found." }, { status: 404 });
    const r = rightsOf(c, s.personId);
    if (!r.adminOf(p.id) || (p.sysAdmin && !r.sys)) return NextResponse.json({ error: "You don’t have permission to do that." }, { status: 403 });
    if (p.id === s.personId) return NextResponse.json({ error: "Use Change password for your own sign-in." }, { status: 400 });
    if (b?.remove) {
      const { error } = await db().rpc("workforce_remove_login", { p_token: s.token, p_person_id: p.id });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    const pw = await issueLogin(s.token, p.id, p.email);
    return NextResponse.json({ issued: [{ name: p.name, email: p.email, password: pw }] });
  } catch (e) {
    return authError(e);
  }
}
