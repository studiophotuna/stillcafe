import "server-only";
import { ConflictError, ForbiddenError, db } from "../db";
import { dayKey } from "../workload/clock";
import { applyCalAction, type CalAction, type CalOutcome } from "./actions";
import { authorizeCal } from "./authz";
import { Cal } from "./engine";
import { emptyCalendar } from "./seed";
import type { CalendarData } from "./types";

/** Supabase persistence for the Calendar (workforce.cal_state; session-gated since migration 0004). */

const DOC = "main";

export async function loadCalendar(token: string): Promise<{ data: CalendarData; version: number } | null> {
  const { data, error } = await db().rpc("workforce_cal_snapshot", { p_token: token, p_id: DOC });
  if (error) throw new Error(error.message);
  return (data as { data: CalendarData; version: number } | null) ?? null;
}

async function save(token: string, data: CalendarData, version: number) {
  const { error } = await db().rpc("workforce_cal_save", { p_token: token, p_id: DOC, p_data: data, p_version: version });
  if (error) {
    if (error.message.includes("workforce_conflict")) throw new ConflictError("calendar");
    throw new Error(error.message);
  }
}

const today = () => dayKey(Date.now());

/** Saved calendar, or an empty one (org + shifts, no people) if none exists yet. */
export async function getCalendar(token: string): Promise<CalendarData> {
  return (await loadCalendar(token))?.data ?? emptyCalendar();
}

/** Apply an action as person `me` with the Calendar rules; reload and retry on conflict. */
export async function runCalAction(token: string, me: number, action: CalAction): Promise<CalOutcome & { before: CalendarData }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = (await loadCalendar(token)) ?? { data: emptyCalendar(), version: 0 };
    const auth = authorizeCal(action, new Cal(s.data, today()), me);
    if ("error" in auth) throw new ForbiddenError(auth.error);
    const out = applyCalAction(s.data, auth.action, today(), Date.now());
    if (out.data === s.data) return { ...out, before: s.data };
    try {
      await save(token, out.data, s.version);
      return { ...out, before: s.data };
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new ConflictError("Too many people changed the calendar at once. Try again.");
}
