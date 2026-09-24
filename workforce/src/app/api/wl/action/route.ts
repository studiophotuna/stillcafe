import { NextResponse } from "next/server";
import { authError, requireSession } from "@/lib/auth";
import { ForbiddenError, dbConfigured } from "@/lib/db";
import type { Action } from "@/lib/workload/actions";
import { runAction } from "@/lib/workload/server";

export const dynamic = "force-dynamic";

const TYPES = new Set<Action["type"]>([
  "startWork", "startTask", "hold", "resume", "complete", "distribute", "setTrade",
  "setPriority", "assign", "checkMail", "importRows", "setSettings", "setFields",
]);

/** Apply one Workload action as the signed-in person and return the saved data. */
export async function POST(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ error: "No database configured." }, { status: 503 });
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const action = (await req.json().catch(() => null)) as Action | null;
  if (!action || !TYPES.has(action.type)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  try {
    return NextResponse.json(await runAction(s.token, s.personId, action, new URL(req.url).searchParams.get("team")));
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof Error && e.message.startsWith("Too many")) return NextResponse.json({ error: e.message }, { status: 409 });
    return authError(e);
  }
}
