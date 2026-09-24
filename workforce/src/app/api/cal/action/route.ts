import { NextResponse } from "next/server";
import { authError, issueLogin, requireSession } from "@/lib/auth";
import type { CalAction } from "@/lib/calendar/actions";
import { runCalAction } from "@/lib/calendar/server";
import { ForbiddenError, dbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

const TYPES = new Set<CalAction["type"]>([
  "submitRequest", "decide", "cancelRequest", "setOverride", "setShiftDay", "teamSettings", "addAdmin", "removeAdmin",
  "addNode", "renameNode", "deleteNode", "saveMember", "addPerson", "removeFromTeam", "setResign", "saveShift", "deleteShift",
  "saveHoliday", "deleteHoliday", "toggleReady", "checkin", "startEvent", "closeEvent", "importUpload",
]);

/**
 * Apply one Calendar action as the signed-in person and return the saved
 * calendar. Adding people also creates their sign-in and returns the
 * temporary passwords (shown once to the admin).
 */
export async function POST(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ error: "No database configured." }, { status: 503 });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const action = (await req.json().catch(() => null)) as CalAction | null;
  if (!action || !TYPES.has(action.type)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  try {
    const out = await runCalAction(s.token, s.personId, action);
    if (out.error) return NextResponse.json({ error: out.error, data: out.data }, { status: 400 });
    // Sign-ins for new people, or a new temporary password when an email changed.
    const before = new Map(out.before.people.map((p) => [p.id, p]));
    const needLogin = out.data.people.filter((p) => !before.has(p.id) || before.get(p.id)!.email !== p.email);
    const issued: { name: string; email: string; password: string }[] = [];
    const warnings: string[] = [];
    for (const p of needLogin) {
      try {
        issued.push({ name: p.name, email: p.email, password: await issueLogin(s.token, p.id, p.email) });
      } catch (e) {
        warnings.push(`${p.name}: ${e instanceof Error && e.message.includes("email_taken") ? "that email already has a sign-in" : "sign-in not created"}`);
      }
    }
    return NextResponse.json({ data: out.data, message: out.message, issued, warnings });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return authError(e);
  }
}
