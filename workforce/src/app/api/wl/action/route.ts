import { NextResponse } from "next/server";
import type { Action } from "@/lib/workload/actions";
import { dbConfigured, runAction } from "@/lib/workload/server";

export const dynamic = "force-dynamic";

const TYPES = new Set<Action["type"]>([
  "startWork", "startTask", "hold", "resume", "complete", "distribute", "setTrade",
  "setPriority", "assign", "checkMail", "importRows", "setSettings", "setFields",
]);

/** Apply one Workload action on the server and return the saved data. */
export async function POST(req: Request) {
  if (!dbConfigured()) return NextResponse.json({ error: "No database configured." }, { status: 503 });
  const action = (await req.json().catch(() => null)) as Action | null;
  if (!action || !TYPES.has(action.type)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  try {
    return NextResponse.json(await runAction(action));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn’t save." }, { status: 409 });
  }
}
