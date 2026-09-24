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

// The sample calendar supplies the team's people (Ana = 0, Leo = 15) and admin (23).
// Its schedule is built for the demo day, so pin the clock there.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(Date.parse("2026-09-24T10:30:00+08:00"));
const { initialCalendar } = await import("../calendar/seed");
const calendar = initialCalendar("2026-09-24");

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (fn: string, args: { p_changes?: unknown; p_token?: string }) => {
      if (args.p_token !== TOKEN) return { data: null, error: { message: "workforce_unauthorized" } };
      if (fn === "workforce_cal_snapshot") return { data: { data: structuredClone(calendar), version: 1 }, error: null };
      if (fn === "workforce_snapshot") return { data: structuredClone(snapshot()), error: null };
      return apply(structuredClone(args.p_changes) as never);
    },
  }),
}));

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test";
const { getData: getData0, runAction: runAction0 } = await import("./server");
const { seedTasks } = await import("./seed");

const TOKEN = "t";
const ANA = 0;
const LEO = 15;
const ADMIN = 23;

/** The team with the sample tasks already saved (a new team starts empty). */
const getData = async () => {
  await getData0(TOKEN, ADMIN);
  if (!db.tasks.size) seedTasks(Date.now()).forEach((t) => db.tasks.set(t.id, { t, v: 1 }));
  return getData0(TOKEN, ADMIN);
};
const runAction = (a: Parameters<typeof runAction0>[2], me = ADMIN) => runAction0(TOKEN, me, a);

beforeEach(() => {
  db.team = null;
  db.tasks = new Map();
  db.beforeApply = null;
  db.applies = 0;
});

describe("server persistence", () => {
  it("creates the team once, empty, with people from the calendar", async () => {
    const d = await getData0(TOKEN, ADMIN);
    expect(d.tasks).toHaveLength(0);
    expect(d.org.team).toEqual({ id: "rm", name: "Rate Management" });
    expect(d.org.trades.map((t) => t.id)).toEqual(["fewb", "inas", "eu", "us", "asla", "lcl"]);
    expect(d.people.find((p) => p.id === ANA)?.trades).toEqual(["lcl"]);
    expect(d.people.map((p) => p.id)).toEqual(expect.arrayContaining([ANA, LEO]));
    expect(d.admins).toContain(ADMIN);
    expect(db.team?.version).toBe(1);
    await getData0(TOKEN, ADMIN);
    expect(db.applies).toBe(1);
  });

  it("refuses a bad session", async () => {
    await expect(getData0("nope", ADMIN)).rejects.toThrow(/workforce_unauthorized/);
  });

  it("opens any team a person is in, with that team's org and people from the calendar", async () => {
    // Customer Service has no systems or trades: the team itself is where tasks go.
    const d = await getData0(TOKEN, ANA, "cs");
    expect(d.org.team.name).toBe("Customer Service");
    expect(d.org.trades).toEqual([{ id: "cs", name: "Customer Service", sys: "" }]);
    expect(d.people.find((p) => p.id === ANA)?.trades).toEqual(["cs"]);
    expect(d.org.teams.map((t) => t.id).sort()).toEqual(["cs", "rm"]);
    // Leo is only in Rate Management.
    await expect(getData0(TOKEN, LEO, "cs")).rejects.toThrow(/can’t open that team/);
    expect((await getData0(TOKEN, LEO)).org.team.id).toBe("rm");
  });

  it("refuses sample mailbox emails in live data", async () => {
    await expect(runAction({ type: "checkMail" })).rejects.toThrow(/isn’t connected/);
  });

  it("keeps members to their own work", async () => {
    const before = await getData();
    const leo = (d: typeof before) => d.tasks.filter((t) => t.assignee === LEO && t.status === "in_progress").map((t) => t.id);
    await expect(runAction({ type: "setSettings", patch: { mode: "rr" } }, ANA)).rejects.toThrow();
    // Ana can't start work as Leo: the action is re-targeted to her.
    const r = await runAction({ type: "startWork", pid: LEO }, ANA);
    expect(r.data.tasks.some((t) => t.assignee === ANA && t.status === "in_progress")).toBe(true);
    expect(leo(r.data)).toEqual(leo(before));
  });

  it("saves only what an action changed", async () => {
    await getData();
    const r = await runAction({ type: "startWork", pid: ANA }, ANA);
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
    const r = await runAction({ type: "startWork", pid: ANA }, ANA);
    const mine = r.data.tasks.find((t) => t.assignee === ANA && t.status === "in_progress")!;
    expect(mine.id).not.toBe(target);
    expect(db.tasks.get(target)!.t.assignee).toBe(LEO);
    expect(db.tasks.get(mine.id)!.t).toMatchObject({ status: "in_progress", assignee: ANA });
    expect(db.applies).toBe(3); // team created, conflicted attempt, successful retry
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
