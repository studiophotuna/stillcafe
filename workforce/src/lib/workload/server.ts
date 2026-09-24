import "server-only";
import { Cal } from "../calendar/engine";
import { loadCalendar } from "../calendar/server";
import { ConflictError, ForbiddenError, db } from "../db";
import { authorizeWl } from "./authz";
import { dayKey } from "./clock";
import { peopleFromCalendar, workloadAdmins } from "./people";
import { applyAction, type Action } from "./actions";
import { TEAM } from "./constants";
import type { WorkloadData } from "./engine";
import { initialData } from "./seed";
import type { Task } from "./types";

/** Supabase persistence for the Workload module (schema `workforce`, see supabase/migrations). */

interface Versions {
  team: number;
  tasks: Map<string, number>;
}
interface Snapshot {
  data: WorkloadData;
  versions: Versions;
}

export { dbConfigured } from "../db";

type RawTask = Task & { version: number };
interface RawSnapshot {
  team: Pick<WorkloadData, "settings" | "fields" | "seq" | "mailCount"> & { version: number };
  tasks: RawTask[];
}

/** Team people and admins, from the Calendar. */
async function peopleAndAdmins(token: string): Promise<Pick<WorkloadData, "people" | "admins">> {
  const cal = await loadCalendar(token);
  if (!cal) return { people: [], admins: [] };
  const c = new Cal(cal.data, dayKey(Date.now()));
  return { people: peopleFromCalendar(c, Date.now()), admins: workloadAdmins(c) };
}

async function load(token: string, team: string): Promise<Snapshot | null> {
  const [{ data, error }, pa] = await Promise.all([db().rpc("workforce_snapshot", { p_token: token, p_team: team }), peopleAndAdmins(token)]);
  if (error) throw new Error(error.message);
  if (!data) return null;
  const raw = data as RawSnapshot;
  const tasks = new Map<string, number>();
  return {
    data: {
      settings: raw.team.settings,
      fields: raw.team.fields,
      seq: raw.team.seq,
      mailCount: raw.team.mailCount,
      tasks: raw.tasks.map(({ version, ...t }) => {
        tasks.set(t.id, version);
        return t;
      }),
      ...pa,
    },
    versions: { team: raw.team.version, tasks },
  };
}

/** Write what changed between `before` and `after`, guarded by the versions read. */
async function save(token: string, team: string, before: Snapshot | null, after: WorkloadData) {
  // The engine returns untouched tasks and settings as the same objects, so identity = unchanged.
  const b = before?.data;
  const teamChanged =
    !b || b.settings !== after.settings || b.fields !== after.fields || b.seq !== after.seq || b.mailCount !== after.mailCount;
  const prev = new Map(b?.tasks.map((t) => [t.id, t]));
  const tasks = after.tasks
    .filter((t) => prev.get(t.id) !== t)
    .map((t) => ({ ...t, version: before?.versions.tasks.get(t.id) ?? 0 }));
  if (!teamChanged && !tasks.length) return;
  const changes = {
    team: teamChanged
      ? { settings: after.settings, fields: after.fields, seq: after.seq, mailCount: after.mailCount, version: before?.versions.team ?? 0 }
      : undefined,
    tasks,
  };
  const { error } = await db().rpc("workforce_apply", { p_token: token, p_team: team, p_changes: changes });
  if (error) {
    if (error.message.includes("workforce_conflict")) throw new ConflictError(error.details ?? "conflict");
    throw new Error(error.message);
  }
}

/** Current data for the team; creates the team (no tasks) the first time. */
export async function getData(token: string, team = TEAM.id): Promise<WorkloadData> {
  const s = await load(token, team);
  if (s) return s.data;
  try {
    await save(token, team, null, initialData(Date.now(), true));
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e; // someone else created it first
  }
  return (await load(token, team))!.data;
}

/**
 * Apply an action as person `me` with the Workload rules. If someone else
 * changed the same rows in between, reload and re-apply (up to 3 tries), so
 * e.g. two members pressing Start work never get the same task.
 */
export async function runAction(token: string, me: number, action: Action, team = TEAM.id): Promise<{ data: WorkloadData; message?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let s = await load(token, team);
    if (!s) {
      await getData(token, team);
      s = (await load(token, team))!;
    }
    const auth = authorizeWl(action, s.data, me);
    if ("error" in auth) throw new ForbiddenError(auth.error);
    const out = applyAction(s.data, auth.action, Date.now());
    try {
      await save(token, team, s, out.data);
      return { data: out.data, message: out.message };
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new ConflictError("Too many people changed this at once. Try again.");
}
