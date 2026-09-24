import { NextResponse } from "next/server";
import type { CalAction } from "@/lib/calendar/actions";
import { runCalAction } from "@/lib/calendar/server";
import { dbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

const TYPES = new Set<CalAction["type"]>([
  "submitRequest", "decide", "cancelRequest", "setOverride", "setShiftDay", "teamSettings", "addAdmin", "removeAdmin",
  "addNode", "renameNode", "deleteNode", "saveMember", "removeFromTeam", "setResign", "saveShift", "deleteShift",
  "saveHoliday", "deleteHoliday", "toggleReady", "checkin", "startEvent", "closeEvent", "importUpload",
]);

/** Apply one Calendar action on the server and return the saved calendar. */
export async function POST(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ error: "No database configured." }, { status: 503 });
  const action = (await req.json().catch(() => null)) as CalAction | null;
  if (!action || !TYPES.has(action.type)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  try {
    return NextResponse.json(await runCalAction(action));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn’t save." }, { status: 409 });
  }
}
