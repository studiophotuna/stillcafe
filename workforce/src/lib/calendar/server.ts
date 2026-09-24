import "server-only";
import { ConflictError, db } from "../db";
import { dayKey } from "../workload/clock";
import { applyCalAction, type CalAction } from "./actions";
import { initialCalendar } from "./seed";
import type { CalendarData } from "./types";

/** Supabase persistence for the Calendar (workforce.cal_state, migration 0003). */

const DOC = "main";

async function load(): Promise<{ data: CalendarData; version: number } | null> {
  const { data, error } = await db().rpc("workforce_cal_snapshot", { p_id: DOC });
  if (error) throw new Error("workforce_cal_snapshot: " + error.message);
  return (data as { data: CalendarData; version: number } | null) ?? null;
}

async function save(data: CalendarData, version: number) {
  const { error } = await db().rpc("workforce_cal_save", { p_id: DOC, p_data: data, p_version: version });
  if (error) {
    if (error.message.includes("workforce_conflict")) throw new ConflictError("calendar");
    throw new Error("workforce_cal_save: " + error.message);
  }
}

const today = () => dayKey(Date.now());

/** Saved calendar; seeds the sample calendar the first time. */
export async function getCalendar(): Promise<CalendarData> {
  const s = await load();
  if (s) return s.data;
  try {
    await save(initialCalendar(today()), 0);
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e;
  }
  return (await load())!.data;
}

/** Apply an action to the saved calendar with the Calendar rules; reload and retry on conflict. */
export async function runCalAction(action: CalAction): Promise<{ data: CalendarData; message?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let s = await load();
    if (!s) {
      await getCalendar();
      s = (await load())!;
    }
    const out = applyCalAction(s.data, action, today(), Date.now());
    if (out.data === s.data) return { data: s.data, message: out.message };
    try {
      await save(out.data, s.version);
      return { data: out.data, message: out.message };
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new ConflictError("Too many people changed the calendar at once. Try again.");
}
