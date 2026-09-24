import "server-only";
import { ConflictError, db } from "../db";
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

async function load(team: string): Promise<Snapshot | null> {
  const { data, error } = await db().rpc("workforce_snapshot", { p_team: team });
  if (error) throw new Error("workforce_snapshot: " + error.message);
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
    },
    versions: { team: raw.team.version, tasks },
  };
}

/** Write what changed between `before` and `after`, guarded by the versions read. */
async function save(team: string, before: Snapshot | null, after: WorkloadData) {
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
  const { error } = await db().rpc("workforce_apply", { p_team: team, p_changes: changes });
  if (error) {
    if (error.message.includes("workforce_conflict")) throw new ConflictError(error.details ?? "conflict");
    throw new Error("workforce_apply: " + error.message);
  }
}

/** Current data for the team; seeds sample data the first time. */
export async function getData(team = TEAM.id): Promise<WorkloadData> {
  const s = await load(team);
  if (s) return s.data;
  try {
    await save(team, null, initialData(Date.now()));
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e; // someone else seeded it first
  }
  return (await load(team))!.data;
}

/**
 * Apply an action to the stored data with the Workload rules. If someone else
 * changed the same rows in between, reload and re-apply (up to 3 tries), so
 * e.g. two members pressing Start work never get the same task.
 */
export async function runAction(action: Action, team = TEAM.id): Promise<{ data: WorkloadData; message?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let s = await load(team);
    if (!s) {
      await getData(team);
      s = (await load(team))!;
    }
    const out = applyAction(s.data, action, Date.now());
    try {
      await save(team, s, out.data);
      return { data: out.data, message: out.message };
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new ConflictError("Too many people changed this at once. Try again.");
}
