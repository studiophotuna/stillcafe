import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "./types";

/**
 * In-memory stand-in for the two Postgres functions (workforce_snapshot /
 * workforce_apply) with the same guarantees: version checks and one task in
 * progress per person, all-or-nothing.
 */
type Row = { t: Task; v: number };
const db = {
  team: null as null | { settings: unknown; fields: unknown; seq: number; mailCount: number; version: number },
  tasks: new Map<string, Row>(),
  /** Runs once just before the next apply — simulates someone else writing in between. */
  beforeApply: null as null | (() => void),
  applies: 0,
};

function snapshot() {
  if (!db.team) return null;
  return { team: db.team, tasks: [...db.tasks.values()].map(({ t, v }) => ({ ...t, version: v })) };
}

function apply(ch: { team?: typeof db.team; tasks: (Task & { version: number })[] }) {
  db.applies++;
  const hook = db.beforeApply;
  db.beforeApply = null;
  hook?.();
  const conflict = { data: null, error: { message: "workforce_conflict", details: "x" } };
  const team = structuredClone(db.team);
  const tasks = new Map([...db.tasks].map(([k, r]) => [k, { t: structuredClone(r.t), v: r.v }]));
  if (ch.team) {
    if (ch.team.version === 0 ? team : !team || team.version !== ch.team.version) return conflict;
  }
  for (const t of ch.tasks) {
    const cur = tasks.get(t.id);
    if (t.version === 0 ? cur : !cur || cur.v !== t.version) return conflict;
    const { version, ...task } = t;
    tasks.set(t.id, { t: task, v: version + 1 });
  }
  const inProg = [...tasks.values()].filter((r) => r.t.status === "in_progress").map((r) => r.t.assignee);
  if (new Set(inProg).size !== inProg.length) return conflict;
  if (ch.team) db.team = { ...ch.team, version: ch.team.version + 1 };
  db.tasks = tasks;
  return { data: null, error: null };
}

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (fn: string, args: { p_changes?: unknown }) =>
      fn === "workforce_snapshot" ? { data: structuredClone(snapshot()), error: null } : apply(structuredClone(args.p_changes) as never),
  }),
}));

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test";
const { getData, runAction } = await import("./server");

const ANA = 0;
const LEO = 15;

beforeEach(() => {
  db.team = null;
  db.tasks = new Map();
  db.beforeApply = null;
  db.applies = 0;
});

describe("server persistence", () => {
  it("seeds the team once, then reads it back", async () => {
    const d = await getData();
    expect(d.tasks).toHaveLength(45);
    expect(db.team?.version).toBe(1);
    await getData();
    expect(db.applies).toBe(1);
  });

  it("saves only what an action changed", async () => {
    await getData();
    const r = await runAction({ type: "startWork", pid: ANA });
    const mine = r.data.tasks.find((t) => t.assignee === ANA && t.status === "in_progress")!;
    expect(r.message).toBe(`Started ${mine.id}.`);
    expect(db.tasks.get(mine.id)).toMatchObject({ t: { status: "in_progress", assignee: ANA }, v: 2 });
    expect(db.team?.version).toBe(1); // settings untouched
    const untouched = [...db.tasks.values()].filter((x) => x.t.id !== mine.id);
    expect(untouched.every((x) => x.v === 1)).toBe(true);
  });

  it("retries when someone else takes the same task first", async () => {
    const d = await getData();
    // The task Ana would get next is taken by Leo (also LCL) just before her save lands.
    const { applyAction } = await import("./actions");
    const target = applyAction(d, { type: "startWork", pid: ANA }, Date.now()).data.tasks.find(
      (t) => t.assignee === ANA && t.status === "in_progress",
    )!.id;
    db.beforeApply = () => {
      const row = db.tasks.get(target)!;
      db.tasks.set(target, { t: { ...row.t, status: "assigned", assignee: LEO }, v: row.v + 1 });
    };
    const r = await runAction({ type: "startWork", pid: ANA });
    const mine = r.data.tasks.find((t) => t.assignee === ANA && t.status === "in_progress")!;
    expect(mine.id).not.toBe(target);
    expect(db.tasks.get(target)!.t.assignee).toBe(LEO);
    expect(db.tasks.get(mine.id)!.t).toMatchObject({ status: "in_progress", assignee: ANA });
    expect(db.applies).toBe(3); // seed, conflicted attempt, successful retry
  });

  it("re-validates uploaded rows on the server", async () => {
    await getData();
    const r = await runAction({
      type: "importRows",
      rows: [
        { Title: "Good", System: "RCM", Trade: "LCL", "Ticket no.": "1", Carrier: "MSCU", "No. of contracts": "2" },
        { Title: "Bad", System: "RCM", Trade: "LCL" },
      ],
    });
    expect(r.message).toBe("1 task added from upload.");
    expect([...db.tasks.values()].filter((x) => x.t.source === "upload" && x.t.title === "Good")).toHaveLength(1);
    expect([...db.tasks.values()].some((x) => x.t.title === "Bad")).toBe(false);
  });

  it("ignores unknown settings keys", async () => {
    await getData();
    await runAction({ type: "setSettings", patch: { mode: "rr", evil: 1 } as never });
    expect(db.team?.settings).toMatchObject({ mode: "rr" });
    expect(db.team?.settings).not.toHaveProperty("evil");
  });
});
