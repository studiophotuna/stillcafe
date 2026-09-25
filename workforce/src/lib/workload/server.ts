import "server-only";
import { Cal } from "../calendar/engine";
import { getCalendar } from "../calendar/server";
import { ConflictError, ForbiddenError, db } from "../db";
import { authorizeWl } from "./authz";
import { dayKey } from "./clock";
import { visibleTeams } from "../calendar/authz";
import { orgFor, peopleFromCalendar, workloadAdmins } from "./people";
import { applyAction, type Action } from "./actions";
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

type FromCal = Pick<WorkloadData, "people" | "admins" | "org">;

/**
 * Which team this request is for, and that team's org, people and admins from the
 * Calendar. `want` must be a team the person can open; without it, their first team.
 */
async function teamContext(token: string, me: number, want?: string | null): Promise<{ team: string; ctx: FromCal }> {
  const c = new Cal(await getCalendar(token), dayKey(Date.now()));
  const teams = visibleTeams(c, me);
  if (want && !teams.some((t) => t.id === want)) throw new ForbiddenError("You can’t open that team.");
  const mine = c.people.get(me) ? c.O.branchesOf(c.person(me)) : [];
  const team = want || teams.find((t) => mine.includes(t))?.id || teams[0]?.id;
  if (!team) throw new ForbiddenError("You aren’t in a team yet. Ask your admin to allocate you in Calendar › Members.");
  return {
    team,
    ctx: { people: peopleFromCalendar(c, Date.now(), team), admins: workloadAdmins(c, team), org: orgFor(c, team, teams) },
  };
}

async function load(token: string, team: string, ctx: FromCal): Promise<Snapshot | null> {
  const { data, error } = await db().rpc("workforce_snapshot", { p_token: token, p_team: team });
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
      ...ctx,
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

async function loadOrCreate(token: string, team: string, ctx: FromCal): Promise<Snapshot> {
  const s = await load(token, team, ctx);
  if (s) return s;
  try {
    await save(token, team, null, { ...initialData(Date.now(), true), ...ctx });
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e; // someone else created it first
  }
  return (await load(token, team, ctx))!;
}

/** Current data for a team person `me` can open; creates the team's Workload (no tasks) the first time. */
export async function getData(token: string, me: number, want?: string | null): Promise<WorkloadData> {
  const { team, ctx } = await teamContext(token, me, want);
  return (await loadOrCreate(token, team, ctx)).data;
}

/**
 * Apply an action as person `me` with the Workload rules. If someone else
 * changed the same rows in between, reload and re-apply (up to 3 tries), so
 * e.g. two members pressing Start work never get the same task.
 */
export async function runAction(token: string, me: number, action: Action, want?: string | null): Promise<{ data: WorkloadData; message?: string }> {
  if (action.type === "checkMail") throw new ForbiddenError("The Outlook mailbox isn’t connected yet.");
  const { team, ctx } = await teamContext(token, me, want);
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await loadOrCreate(token, team, ctx);
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
