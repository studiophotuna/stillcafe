import { describe, expect, it } from "vitest";
import { H, M } from "./clock";
import { DEMO_ORG, FIELDS0, PEOPLE } from "./constants";
import {
  addTasks,
  assignTask,
  checkRows,
  completeTask,
  distribute,
  holdTask,
  personMetrics,
  resumeTask,
  setTrade,
  sortTasks,
  startTask,
  startWork,
  endWork,
  undoEndWork,
  type WorkloadData,
} from "./engine";
import { seedTasks } from "./seed";
import type { Settings, Task } from "./types";
import { person } from "./constants";

const NOW = Date.parse("2026-09-24T10:30:00+08:00");
const ANA = 0; // LCL, available
const ELI = 4; // EU, on leave

const settings = (p: Partial<Settings> = {}): Settings => ({
  mode: "fifo",
  order: "priority",
  skipUnavail: true,
  autoFeed: true,
  sla: { high: 4, normal: 24, low: 72 },
  mailbox: "rm.requests@dsv.com",
  mailTrade: "",
  work: { shift: 9, b1: 60, b2: 30, prod: 6.8 },
  targets: { fewb: 8, inas: 6, eu: 7, us: 6, asla: 6, lcl: 8 },
  memberTargets: {},
  ...p,
});

let n = 0;
const task = (p: Partial<Task> = {}): Task => ({
  id: "X-" + n++,
  title: "t",
  trade: "lcl",
  pr: "normal",
  received: NOW - H,
  source: "upload",
  status: "new",
  assignee: null,
  startedAt: null,
  doneAt: null,
  ot: false,
  hold: "",
  fields: {},
  email: null,
  history: [],
  ...p,
});

/** SLA context: settings plus Calendar holidays. */
const sc = (p: Partial<Settings> = {}, holidays: string[] = []) => ({ settings: settings(p), holidays });
const data = (tasks: Task[], p: Partial<Settings> = {}): WorkloadData => ({
  holidays: [],
  tasks,
  fields: FIELDS0.map((f) => ({ ...f, required: false })),
  settings: settings(p),
  seq: 2000,
  mailCount: 0,
  people: PEOPLE,
  admins: [23],
  org: DEMO_ORG,
  activities: [],
  approvers: [23],
});

const get = (d: WorkloadData, id: string) => d.tasks.find((t) => t.id === id)!;

describe("ordering", () => {
  it("sorts by priority, then due, then oldest", () => {
    const a = task({ pr: "low", received: NOW - 10 * H });
    const b = task({ pr: "high", received: NOW - H });
    const c = task({ pr: "normal", received: NOW - 2 * H });
    const d = task({ pr: "normal", received: NOW - 3 * H });
    expect(sortTasks([a, b, c, d], sc()).map((t) => t.id)).toEqual([b.id, d.id, c.id, a.id]);
    expect(sortTasks([a, b, c, d], sc({ order: "received" })).map((t) => t.id)).toEqual([a.id, d.id, c.id, b.id]);
  });
});

describe("start work (FIFO)", () => {
  it("gives the next task in the member's own trade only", () => {
    const other = task({ trade: "eu", pr: "high" });
    const mine = task({ trade: "lcl" });
    const o = startWork(data([other, mine]), ANA, NOW);
    expect(get(o.data, mine.id)).toMatchObject({ status: "in_progress", assignee: ANA, startedAt: NOW });
    expect(get(o.data, other.id).status).toBe("new");
  });

  it("prefers a task already assigned to the member", () => {
    const queued = task({ pr: "high" });
    const assigned = task({ status: "assigned", assignee: ANA, pr: "low" });
    const o = startWork(data([queued, assigned]), ANA, NOW);
    expect(get(o.data, assigned.id).status).toBe("in_progress");
    expect(get(o.data, queued.id).status).toBe("new");
  });

  it("allows only one task in progress", () => {
    const cur = task({ status: "in_progress", assignee: ANA, startedAt: NOW - M });
    const next = task();
    const o = startWork(data([cur, next]), ANA, NOW);
    expect(get(o.data, next.id).status).toBe("new");
  });

  it("lets members pick several tasks in Members pick mode when allowed", async () => {
    const { pickTask } = await import("./engine");
    const cur = task({ status: "in_progress", assignee: ANA, startedAt: NOW - M });
    const a = task();
    const b = task();
    // Off: picking does nothing.
    expect(get(pickTask(data([cur, a], { mode: "self" }), a.id, ANA, NOW).data, a.id).status).toBe("new");
    let d = data([cur, a, b], { mode: "self", multiPick: true });
    d = pickTask(d, a.id, ANA, NOW).data;
    d = pickTask(d, b.id, ANA, NOW).data;
    expect(get(d, a.id)).toMatchObject({ status: "assigned", assignee: ANA });
    expect(get(d, b.id)).toMatchObject({ status: "assigned", assignee: ANA });
    // Still one in progress at a time.
    expect(get(startWork(d, ANA, NOW).data, a.id).status).toBe("assigned");
  });

  it("pauses a task in Members pick with several picks, so the member can work on another", async () => {
    const { pauseTask, startTask, isPaused, taskWorkMs, startAway } = await import("./engine");
    const multi = { mode: "self" as const, multiPick: true };
    const a = task({ status: "in_progress", assignee: ANA, startedAt: NOW - 60 * M, history: [{ at: NOW - 60 * M, text: "Started by Ana" }] });
    const b = task({ status: "assigned", assignee: ANA });
    // Only in Members pick with several picks allowed.
    expect(pauseTask(data([a, b]), a.id, ANA, NOW - 20 * M).message).toMatch(/Use Pending/);
    expect(pauseTask(data([a, b], { mode: "self" }), a.id, ANA, NOW - 20 * M).message).toMatch(/Use Pending/);
    let d = pauseTask(data([a, b], multi), a.id, ANA, NOW - 20 * M).data;
    expect(get(d, a.id)).toMatchObject({ status: "assigned", startedAt: NOW - 60 * M });
    expect(isPaused(get(d, a.id))).toBe(true);
    // Not blocked: the other task on the list starts.
    d = startTask(d, b.id, ANA, NOW - 15 * M).data;
    expect(get(d, b.id).status).toBe("in_progress");
    // Back to the paused one later: it carries on with its own start time; the pause isn't worked time.
    d = { ...d, tasks: d.tasks.map((t) => (t.id === b.id ? { ...t, status: "done" as const, doneAt: NOW - 10 * M } : t)) };
    d = startTask(d, a.id, ANA, NOW - 10 * M).data;
    expect(get(d, a.id)).toMatchObject({ status: "in_progress", startedAt: NOW - 60 * M });
    expect(isPaused(get(d, a.id))).toBe(false);
    expect(taskWorkMs(d, get(d, a.id), NOW)).toBe(50 * M);
    // Idle can't be logged by hand any more.
    expect(startAway(d, ANA, "idle", NOW).data).toBe(d);
  });

  it("counts idle as shift time with no task running and not away", async () => {
    const { idleMs, idleToday, startAway, backToWork } = await import("./engine");
    const at = (hm: string) => Date.parse(`2026-09-24T${hm}:00+08:00`);
    // Shift 08:00–17:00. Task 08:30–09:30, on hold 09:00–09:10; break 09:40–09:50; nothing since.
    const t = task({
      status: "done",
      assignee: ANA,
      startedAt: at("08:30"),
      doneAt: at("09:30"),
      history: [
        { at: at("09:00"), text: "On hold: waiting" },
        { at: at("09:10"), text: "Resumed" },
      ],
    });
    let d = startAway(data([t]), ANA, "break", at("09:40")).data;
    d = backToWork(d, ANA, at("09:50")).data;
    // 08:00–10:30 = 150 min; running 50 min; break 10 min → 90 min idle.
    expect(idleMs(d, ANA, at("08:00"), at("17:00"), at("10:30"))).toBe(90 * M);
    expect(idleToday(d, d.people.find((p) => p.id === ANA)!, at("10:30"))).toBe(90 * M);
    // A task in progress isn't idle: 150 min − 50 running − 40 on the current task (09:50–10:30).
    const run = task({ status: "in_progress", assignee: ANA, startedAt: at("09:50") });
    expect(idleMs(data([t, run]), ANA, at("08:00"), at("17:00"), at("10:30"))).toBe(60 * M);
    // A paused task isn't running: paused at 10:00, so 10:00–10:30 is idle too.
    const paused = task({ status: "assigned", assignee: ANA, startedAt: at("09:50"), history: [{ at: at("10:00"), text: "Paused" }] });
    expect(idleMs(data([t, paused]), ANA, at("08:00"), at("17:00"), at("10:30"))).toBe(90 * M);
    // On leave: no idle.
    const off = { ...data([t]), people: data([]).people.map((p) => (p.id === ANA ? { ...p, avail: "leave" as const } : p)) };
    expect(idleToday(off, off.people.find((p) => p.id === ANA)!, at("10:30"))).toBe(0);
  });

  it("lets a member ask for a teammate's task; the assignee lets them take it or keeps it", async () => {
    const { claimTask, answerClaim, cancelClaim } = await import("./engine");
    const { authorizeWl } = await import("./authz");
    const mate = data([]).people.find((p) => p.id !== ANA && p.trades.includes("lcl"))!;
    const t = task({ status: "in_progress", assignee: ANA, startedAt: NOW - M });
    let d = data([t]);
    // Members can't hand a task over (no transfer action); a teammate in the trade asks for it.
    d = claimTask(d, t.id, mate.id, NOW).data;
    expect(get(d, t.id).claim).toEqual({ by: mate.id, at: NOW });
    expect(claimTask(d, t.id, ANA, NOW).message).toMatch(/someone else has/);
    // Only the assignee answers.
    expect(answerClaim(d, t.id, true, mate.id, NOW).data).toBe(d);
    const kept = answerClaim(d, t.id, false, ANA, NOW).data;
    expect(get(kept, t.id)).toMatchObject({ assignee: ANA, status: "in_progress", claim: null });
    const moved = answerClaim(d, t.id, true, ANA, NOW).data;
    expect(get(moved, t.id)).toMatchObject({ assignee: mate.id, status: "assigned", startedAt: null, claim: null });
    expect(get(cancelClaim(d, t.id, mate.id, NOW).data, t.id).claim).toBeNull();
    // The claim acts are always as the signed-in member.
    expect(authorizeWl({ type: "answerClaim", id: t.id, ok: true, pid: mate.id }, d, ANA)).toEqual({ action: { type: "answerClaim", id: t.id, ok: true, pid: ANA } });
  });

  it("takes trade first, then the same system, then other systems", async () => {
    const { canTake, canClaim, personOf } = await import("./engine");
    const us = task({ trade: "us" }); // RCM, Ana's system (she works LCL)
    const eu = task({ trade: "eu" }); // GPM, another system
    const lcl = task({ trade: "lcl" });
    const ana = (d: ReturnType<typeof data>) => personOf(d, ANA)!;
    let d = data([us, eu, lcl], { mode: "self" });
    expect([lcl, us, eu].map((t) => canTake(d, ana(d), t))).toEqual([true, false, false]); // own trade waiting
    d = data([us, eu], { mode: "self" });
    expect([us, eu].map((t) => canTake(d, ana(d), t))).toEqual([true, false]); // own clear: same system first
    d = data([eu], { mode: "self" });
    expect(canTake(d, ana(d), eu)).toBe(true); // whole system clear: other systems
    // Asking to take: a teammate in the same system can ask for an LCL task, another system can't.
    const held = task({ trade: "us", status: "assigned", assignee: 25 });
    const heldGpm = task({ trade: "eu", status: "assigned", assignee: 3 });
    d = data([held, heldGpm], { mode: "self" });
    expect(canClaim(d, ana(d), held)).toBe(true);
    expect(canClaim(d, ana(d), heldGpm)).toBe(false);
  });

  it("does not give work to unavailable people unless the team allows it", () => {
    const t = task({ trade: "eu" });
    expect(get(startWork(data([t]), ELI, NOW).data, t.id).status).toBe("new");
    expect(get(startWork(data([t], { skipUnavail: false }), ELI, NOW).data, t.id).status).toBe("in_progress");
  });

  it("lets people scheduled today carry on after their shift (overtime) until they end work, also after Undo End work", () => {
    const after = (d: WorkloadData): WorkloadData => ({ ...d, people: d.people.map((p) => (p.id === ANA ? { ...p, avail: "offshift", onToday: true } : p)) });
    const t = task();
    // Off shift and not scheduled today: skipped.
    const off = { ...data([t]), people: PEOPLE.map((p) => (p.id === ANA ? { ...p, avail: "offshift" as const } : p)) };
    expect(get(startWork(off, ANA, NOW).data, t.id).status).toBe("new");
    // Scheduled today, after the shift: can start.
    expect(get(startWork(after(data([t])), ANA, NOW).data, t.id).status).toBe("in_progress");
    // Ended work: blocked; after Undo End work: can start again.
    const ended = endWork(after(data([t])), ANA, 0, NOW).data;
    expect(get(startWork(ended, ANA, NOW + M).data, t.id).status).toBe("new");
    const back = undoEndWork(ended, ANA, NOW + M).data;
    expect(get(startWork(back, ANA, NOW + 2 * M).data, t.id).status).toBe("in_progress");
  });

  it("round-robin gives new tasks after the shift only to people working overtime", () => {
    const off = (d: WorkloadData): WorkloadData => ({
      ...d,
      people: d.people.map((p) => (p.trades.includes("lcl") ? { ...p, avail: p.id === ANA ? "offshift" : "leave", onToday: p.id === ANA } : p)),
    });
    const t = task();
    // Not working now: stays in the queue.
    expect(get(addTasks(off(data([], { mode: "rr" })), [t], "", NOW).data, t.id).status).toBe("new");
    // Working a task after the shift: gets it.
    const cur = task({ status: "in_progress", assignee: ANA, startedAt: NOW - M });
    const o = addTasks(off(data([cur], { mode: "rr" })), [t], "", NOW).data;
    expect(get(o, t.id).assignee).toBe(ANA);
  });

  it("does not pull from the queue in admin-assigns mode", () => {
    const t = task();
    const o = startWork(data([t], { mode: "manual" }), ANA, NOW);
    expect(get(o.data, t.id).status).toBe("new");
    expect(o.message).toMatch(/No more tasks/);
  });
});

describe("members pick", () => {
  it("lets a member take a task in their trade, not others", () => {
    const mine = task();
    const other = task({ trade: "eu" });
    const d = data([mine, other], { mode: "self" });
    expect(get(startTask(d, mine.id, ANA, NOW).data, mine.id).status).toBe("in_progress");
    expect(get(startTask(d, other.id, ANA, NOW).data, other.id).status).toBe("new");
    expect(get(startTask(data([mine]), mine.id, ANA, NOW).data, mine.id).status).toBe("new"); // FIFO mode
  });
});

describe("hold, resume, done", () => {
  it("hold needs a reason and frees the member", () => {
    const t = task({ status: "in_progress", assignee: ANA, startedAt: NOW - M });
    const next = task();
    let d = data([t, next]);
    expect(holdTask(d, t.id, "  ", NOW).data).toBe(d);
    d = holdTask(d, t.id, "Waiting for carrier", NOW).data;
    expect(get(d, t.id)).toMatchObject({ status: "on_hold", hold: "Waiting for carrier" });
    d = startWork(d, ANA, NOW).data;
    expect(get(d, next.id).status).toBe("in_progress");
    // Can't resume while another task is in progress.
    expect(get(resumeTask(d, t.id, ANA, NOW).data, t.id).status).toBe("on_hold");
  });

  it("done requires required fields", () => {
    const t = task({ status: "in_progress", assignee: ANA, startedAt: NOW - M });
    const d = { ...data([t]), fields: FIELDS0 };
    const blocked = completeTask(d, t.id, {}, ANA, NOW);
    expect(get(blocked.data, t.id).status).toBe("in_progress");
    expect(blocked.message).toMatch(/^Fill in /);
    const ok = completeTask(d, t.id, { ticket: "RM-1", carrier: "MSCU", contracts: 2 }, ANA, NOW);
    expect(get(ok.data, t.id)).toMatchObject({ status: "done", doneAt: NOW });
  });

  it("auto-feeds the next task when enabled", () => {
    const t = task({ status: "in_progress", assignee: ANA, startedAt: NOW - M });
    const next = task();
    const fed = completeTask(data([t, next]), t.id, {}, ANA, NOW);
    expect(get(fed.data, next.id).status).toBe("in_progress");
    const manual = completeTask(data([t, next], { autoFeed: false }), t.id, {}, ANA, NOW);
    expect(get(manual.data, next.id).status).toBe("new");
    expect(manual.message).toMatch(/Click Start work/);
  });
});

describe("round-robin", () => {
  it("assigns new tasks to the least-loaded available member of the trade", () => {
    // LCL: Ana (0), Kim (14), Leo (15), Mia (16), Nico (19, on leave).
    const busy = [0, 14, 15].map((a) => task({ status: "assigned", assignee: a }));
    const t = task();
    const o = addTasks(data(busy, { mode: "rr" }), [t], "", NOW);
    expect(get(o.data, t.id)).toMatchObject({ status: "assigned", assignee: 16 });
  });

  it("spreads a batch evenly and skips tasks without a trade", () => {
    const batch = [task({ trade: "asla" }), task({ trade: "asla" }), task({ trade: "" })];
    const o = distribute(data(batch, { mode: "rr" }), NOW);
    const assignees = batch.slice(0, 2).map((t) => get(o.data, t.id).assignee);
    expect(new Set(assignees).size).toBe(2);
    expect(get(o.data, batch[2].id).status).toBe("new");
  });

  it("assigns a needs-trade task once an admin sets its trade", () => {
    const t = task({ trade: "" });
    const o = setTrade(data([t], { mode: "rr" }), t.id, "us", NOW);
    expect(get(o.data, t.id).status).toBe("assigned");
  });
});

describe("admin assign", () => {
  it("moving an in-progress task never gives someone two in progress", () => {
    const t = task({ status: "in_progress", assignee: ANA, startedAt: NOW - M });
    const o = assignTask(data([t]), t.id, 15, NOW);
    expect(get(o.data, t.id)).toMatchObject({ status: "assigned", assignee: 15 });
    expect(get(assignTask(o.data, t.id, null, NOW).data, t.id)).toMatchObject({ status: "new", assignee: null });
  });
});

describe("upload validation", () => {
  it("checks system/trade, priority, number and list fields; required ones may be blank", () => {
    const base = { Title: "A", System: "RCM", Trade: "LCL", "Ticket no.": "1", Carrier: "MSCU", "No. of contracts": "3" };
    const res = checkRows(
      [
        base,
        { ...base, Title: "" },
        { ...base, System: "GPM" },
        { ...base, Priority: "urgent" },
        { ...base, "Ticket no.": "" },
        { ...base, "No. of contracts": "x" },
        { ...base, Carrier: "ACME" },
        { ...base, trade: "lcl", system: "rcm", Priority: "HIGH" },
      ],
      FIELDS0,
      DEMO_ORG,
    );
    expect(res.map((r) => r.msg)).toEqual([
      "Ready",
      "Title is missing",
      "LCL isn’t under GPM",
      "Priority must be High, Normal or Low",
      "Ready", // required fields are asked for when the task is marked done
      "No. of contracts must be a number",
      "Carrier “ACME” isn’t in the list",
      "Ready",
    ]);
    expect(res[7].task).toMatchObject({ trade: "lcl", pr: "high" });
  });
});

describe("metrics", () => {
  it("pro-rates productivity and utilization by elapsed shift", () => {
    // 10:30 in an 08:00 shift of 9h → 2.5/9 elapsed.
    const done = [1, 2].map((i) => task({ status: "done", assignee: ANA, startedAt: NOW - i * H, doneAt: NOW - i * H + 30 * M }));
    const m = personMetrics(data(done), person(ANA)!, NOW);
    const fr = 2.5 / 9;
    expect(m.done).toBe(2);
    expect(m.tgt).toBeCloseTo(8 * fr);
    expect(m.prod).toBe(Math.round((2 / (8 * fr)) * 100));
    // Available: shift so far minus the planned breaks (none logged): 9h×fr − 90 min×fr.
    expect(m.util).toBe(Math.round(((60 * M) / (9 * H * fr - 90 * M * fr)) * 100));
    expect(m.time).toBe(100);
  });

  it("uses a member override target", () => {
    const m = personMetrics(data([], { memberTargets: { [ANA]: "4" } }), person(ANA)!, NOW);
    expect(m.target).toBe(4);
  });
});

describe("seed", () => {
  it("matches the design's sample queue", () => {
    const t = seedTasks(NOW);
    expect(t).toHaveLength(45);
    expect(t[0].id).toBe("T-1040");
    expect(t.filter((x) => x.status === "in_progress")).toHaveLength(6);
    expect(t.filter((x) => x.status === "new" && !x.trade)).toHaveLength(1);
  });
});

describe("upload rows follow the team's org", () => {
  const f: typeof FIELDS0 = [];
  it("needs no System or Trade when the team is its one unit", () => {
    const org = { team: { id: "cs", name: "Customer Service" }, systems: [], trades: [{ id: "cs", name: "Customer Service", sys: "" }], teams: [] };
    const [r] = checkRows([{ Title: "Call back" }], f, org);
    expect(r).toMatchObject({ ok: true, task: { trade: "cs" } });
  });
  it("asks for the System only when a trade name is in two systems", () => {
    const org = {
      team: { id: "t", name: "T" },
      systems: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      trades: [{ id: "a1", name: "EU", sys: "a" }, { id: "b1", name: "EU", sys: "b" }, { id: "b2", name: "US", sys: "b" }],
      teams: [],
    };
    const res = checkRows([{ Title: "x", Trade: "EU" }, { Title: "x", System: "B", Trade: "EU" }, { Title: "x", Trade: "US" }, { Title: "x", System: "A", Trade: "US" }], f, org);
    expect(res.map((r) => r.ok ? r.task!.trade : r.msg)).toEqual(["Add the System — that trade is in more than one", "b1", "b2", "US isn’t under A"]);
  });
});

describe("overtime, helping out, productivity basis and uploads", async () => {
  const { helpQueue, personMetrics, canTake } = await import("./engine");
  const { authorizeWl } = await import("./authz");
  const ana = PEOPLE.find((p) => p.id === ANA)!; // LCL (RCM), day shift 08:00, 9 h
  const EVE = Date.parse("2026-09-24T18:30:00+08:00"); // 1 h 30 past her 17:00 end

  it("only the assignee can mark a task done", () => {
    const t = task({ status: "in_progress", assignee: ANA, startedAt: EVE - 40 * M });
    expect(get(completeTask(data([t]), t.id, {}, 15, EVE).data, t.id).status).toBe("in_progress");
    expect(get(completeTask(data([t]), t.id, {}, ANA, EVE).data, t.id).status).toBe("done");
  });

  it("asks before giving work from other trades: same system first, then the team", () => {
    const us = task({ trade: "us", received: NOW - H }); // RCM, same system as LCL
    const eu = task({ trade: "eu", received: NOW - 5 * H }); // GPM, older
    const d = data([eu, us]);
    const r = startWork(d, ANA, NOW);
    expect(r.ask).toEqual({ system: 1, systemNames: ["RCM"], team: 1 });
    expect(r.data).toBe(d);
    expect(helpQueue(d, ana).map((x) => x.t.id)).toEqual([us.id, eu.id]);
    const yes = startWork(d, ANA, NOW, true);
    expect(get(yes.data, us.id)).toMatchObject({ status: "in_progress", assignee: ANA });
    expect(yes.message).toMatch(/helping US/);
    // Own trade has work: no offer, and other trades can't be taken.
    const own = task({ trade: "lcl" });
    expect(startWork(data([own, us]), ANA, NOW).ask).toBeUndefined();
    expect(canTake(data([own, us]), ana, us)).toBe(false);
    expect(canTake(data([us]), ana, us)).toBe(true);
  });

  it("measures productivity by tasks, a number field, or distinct values", () => {
    const done = (f: Record<string, string | number>) => task({ status: "done", assignee: ANA, startedAt: NOW - H, doneAt: NOW - M, fields: f });
    const tasks = [done({ ticket: "A", contracts: 3 }), done({ ticket: "A", contracts: 2 }), done({ ticket: "B", contracts: 1 })];
    const base = { ...data(tasks), fields: FIELDS0 };
    expect(personMetrics(base, ana, NOW).out).toBe(3);
    expect(personMetrics({ ...base, settings: { ...base.settings, prodBasis: "contracts" } }, ana, NOW).out).toBe(6);
    expect(personMetrics({ ...base, settings: { ...base.settings, prodBasis: "ticket" } }, ana, NOW).out).toBe(2);
  });

  it("lets admins and approved members upload, with required fields left blank", () => {
    const d = { ...data([]), fields: FIELDS0 };
    const rows = [{ Title: "Blank ticket", System: "RCM", Trade: "LCL" }];
    expect("error" in authorizeWl({ type: "importRows", rows }, d, ANA)).toBe(true);
    expect("action" in authorizeWl({ type: "importRows", rows }, { ...d, settings: { ...d.settings, uploaders: [ANA] } }, ANA)).toBe(true);
    expect("action" in authorizeWl({ type: "importRows", rows }, d, 23)).toBe(true);
    expect(checkRows(rows, FIELDS0, DEMO_ORG)[0]).toMatchObject({ ok: true });
  });
});

describe("status: time away, end of work and overtime approval", async () => {
  const { startAway, backToWork, endWork, undoEndWork, decideOt, pastShiftMin, personMetrics, currentAway } = await import("./engine");
  const { authorizeWl } = await import("./authz");
  const ana = PEOPLE.find((p) => p.id === ANA)!; // day shift 08:00–17:00
  const at = (hm: string) => Date.parse(`2026-09-24T${hm}:00+08:00`);

  it("logs time away, doesn't count it on the open task, and blocks new work until back", () => {
    const t = task({ status: "in_progress", assignee: ANA, startedAt: at("09:00") });
    let d = data([t, task()]);
    d = startAway(d, ANA, "meeting", at("09:30")).data;
    expect(currentAway(d, ANA)?.kind).toBe("meeting");
    d = startAway(d, ANA, "break", at("10:00")).data; // switching closes the meeting
    expect(d.activities.map((a) => [a.kind, a.end])).toEqual([["meeting", at("10:00")], ["break", null]]);
    d = backToWork(d, ANA, at("10:15")).data;
    const m = personMetrics(d, ana, at("10:30"));
    expect(m.away).toEqual({ meeting: 30, break: 15 });
    expect(m.handle).toBe(45 * M); // 90 min open minus 45 away
    // Available: 2.5 h of shift minus 45 min away.
    expect(m.avail).toBe(105 * M);
    const onBreak = startAway(data([task()]), ANA, "lunch", at("12:00")).data;
    expect(startWork(onBreak, ANA, at("12:10")).message).toMatch(/on lunch/);
  });

  it("asks overtime only when ending after the shift; it waits for approval", () => {
    expect(pastShiftMin(ana, settings(), at("16:00"))).toBe(0);
    expect(pastShiftMin(ana, settings(), at("18:10"))).toBe(70);
    // During the shift, reported overtime is ignored.
    expect(endWork(data([]), ANA, 60, at("16:00")).data.activities[0]).toMatchObject({ kind: "end", otMin: 0, otStatus: null });
    // After it: capped at the time past the shift, pending.
    const e = endWork(data([]), ANA, 500, at("18:10"));
    expect(e.data.activities[0]).toMatchObject({ otMin: 70, otStatus: "pending" });
    expect(personMetrics(e.data, ana, at("18:10"))).toMatchObject({ otMin: 0, otPending: 70 });
    // Can't end with a task in progress; can undo while pending.
    expect(endWork(data([task({ status: "in_progress", assignee: ANA, startedAt: at("17:30") })]), ANA, 0, at("18:10")).message).toMatch(/Resolve your ticket/);
    expect(undoEndWork(e.data, ANA, at("18:20")).data.activities).toHaveLength(0);
    expect(startWork({ ...e.data, tasks: [task()] }, ANA, at("18:20")).message).toMatch(/ended work/);
  });

  it("counts overtime once an approver (not the member) approves it", () => {
    const e = endWork({ ...data([]), approvers: [23, ANA] }, ANA, 45, at("18:00")).data;
    const id = e.activities[0].id;
    expect(decideOt(e, id, "approved", ANA, at("19:00")).data).toBe(e); // not your own
    expect(decideOt(e, id, "approved", 15, at("19:00")).data).toBe(e); // not an approver
    const ok = decideOt(e, id, "approved", 23, at("19:00")).data;
    expect(ok.activities[0]).toMatchObject({ otStatus: "approved", decidedBy: 23 });
    expect(personMetrics(ok, ana, at("19:00"))).toMatchObject({ otMin: 45, otPending: 0 });
    expect(undoEndWork(ok, ANA, at("19:10")).data).toBe(ok); // decided: can't undo
    expect("error" in authorizeWl({ type: "decideOt", id, st: "approved", by: ANA }, e, ANA)).toBe(true);
    expect(authorizeWl({ type: "decideOt", id, st: "approved", by: 0 }, e, 23)).toEqual({ action: { type: "decideOt", id, st: "approved", by: 23 } });
  });
});

describe("periods, ticket field and stale reminders", async () => {
  const { periodRange, shiftPeriod, periodLabel } = await import("./period");
  const { ticketField, ticketOf, staleTasks } = await import("./engine");
  it("builds day / week (Mon–Sun) / month ranges in team time", () => {
    const [d0, d1] = periodRange("day", NOW);
    expect(new Date(d0).toISOString()).toBe("2026-09-23T16:00:00.000Z"); // 24 Sep 00:00 Manila
    expect(d1 - d0).toBe(24 * H);
    const [w0] = periodRange("week", NOW); // Thu 24 Sep → Mon 21 Sep
    expect(new Date(w0).toISOString()).toBe("2026-09-20T16:00:00.000Z");
    const [m0, m1] = periodRange("month", NOW);
    expect([new Date(m0).toISOString(), new Date(m1).toISOString()]).toEqual(["2026-08-31T16:00:00.000Z", "2026-09-30T16:00:00.000Z"]);
    expect(periodLabel("month", shiftPeriod("month", NOW, -1), NOW)).toBe("Aug 2026");
    expect(periodLabel("week", NOW, NOW)).toBe("21 Sep – 27 Sep 2026");
  });
  it("finds the ticket field, or none when switched off", () => {
    const d = { ...data([task({ fields: { ticket: "RM-7" } })]), fields: FIELDS0 };
    expect(ticketField(d)?.key).toBe("ticket");
    expect(ticketOf(d, d.tasks[0])).toBe("RM-7");
    expect(ticketField({ ...d, settings: { ...d.settings, ticketField: "" } })).toBeUndefined();
  });
  it("lists tasks waiting N days: the team's for admins, own for members", () => {
    const old = task({ received: NOW - 3 * 24 * H, status: "assigned", assignee: 15 });
    const fresh = task({ received: NOW - 1 * 24 * H });
    const d = data([old, fresh]);
    expect(staleTasks(d, 23, true, NOW).map((t) => t.id)).toEqual([old.id]);
    expect(staleTasks(d, ANA, false, NOW)).toHaveLength(0);
    expect(staleTasks(d, 15, false, NOW)).toHaveLength(1);
    expect(staleTasks({ ...d, settings: { ...d.settings, staleDays: 0 } }, 23, true, NOW)).toHaveLength(0);
  });
});

describe("on-hold time and weekend SLA", async () => {
  const { holdPeriods, taskWorkMs, due, overdueMs, holdTask, resumeTask } = await import("./engine");
  const { addHours, spanMs } = await import("./clock");
  it("pauses the task timer while on hold and keeps each hold's date and reason", () => {
    const t0 = task({ status: "in_progress", assignee: ANA, startedAt: NOW - 2 * H });
    let d = data([t0]);
    d = holdTask(d, t0.id, "Waiting for carrier", NOW - H).data;
    d = resumeTask(d, t0.id, ANA, NOW - 30 * M).data;
    const t = d.tasks[0];
    expect(holdPeriods(t, NOW)).toEqual([{ from: NOW - H, to: NOW - 30 * M, reason: "Waiting for carrier" }]);
    expect(taskWorkMs(d, t, NOW)).toBe(90 * M); // 2 h open − 30 min on hold
    // Still on hold: the timer stays put.
    const held = holdTask(d, t0.id, "Customer reply", NOW - 10 * M).data;
    expect(taskWorkMs(held, held.tasks[0], NOW)).toBe(taskWorkMs(held, held.tasks[0], NOW + 5 * H));
    // A break during the hold isn't subtracted twice.
    const withBreak = { ...held, activities: [{ id: "b", pid: ANA, kind: "break" as const, start: NOW - 8 * M, end: NOW - 2 * M, otMin: 0, otStatus: null, decidedBy: null, decidedAt: null }] };
    expect(taskWorkMs(withBreak, withBreak.tasks[0], NOW)).toBe(taskWorkMs(held, held.tasks[0], NOW));
  });
  it("can skip weekends in the due time", () => {
    const fri = Date.parse("2026-09-25T15:00:00+08:00"); // Friday 15:00
    expect(new Date(addHours(fri, 24, false)).toISOString()).toBe("2026-09-26T07:00:00.000Z"); // Sat 15:00
    expect(new Date(addHours(fri, 24, true)).toISOString()).toBe("2026-09-28T07:00:00.000Z"); // Mon 15:00
    const mon = Date.parse("2026-09-28T09:00:00+08:00");
    expect(spanMs(fri, mon, true)).toBe(9 * H + 9 * H); // Fri 15→24, Mon 0→9
    const t = task({ received: fri, pr: "normal" });
    // Skipped by default; counted only when the team turns weekends on.
    expect(due(t, sc({}))).toBe(addHours(fri, 24, true));
    expect(due(t, sc({ slaWeekends: false }))).toBe(addHours(fri, 24, true));
    expect(overdueMs(t, sc({}), Date.parse("2026-09-28T17:00:00+08:00"))).toBe(2 * H);
    expect(due(t, sc({ slaWeekends: true }))).toBe(fri + 24 * H);
    // The ticket from the report: Fri 25 Sep 15:59, 48 h SLA, seen Sun 27 Sep 02:07 — not overdue.
    const t2 = task({ received: Date.parse("2026-09-25T15:59:00+08:00"), pr: "normal" });
    const s48 = sc({ sla: { high: 24, normal: 48, low: 72 } });
    expect(overdueMs(t2, s48, Date.parse("2026-09-27T02:07:00+08:00"))).toBe(0);
    expect(new Date(due(t2, s48)).toISOString()).toBe("2026-09-29T07:59:00.000Z"); // Tue 15:59
  });
});

describe("uploads keep the actual received time", async () => {
  const { parseReceived, importRows } = await import("./engine");
  it("reads Received as team time and counts the due time from it", () => {
    expect(parseReceived("2026-09-23 08:30")).toBe(Date.parse("2026-09-23T08:30:00+08:00"));
    expect(parseReceived(new Date(Date.UTC(2026, 8, 23, 8, 30)))).toBe(Date.parse("2026-09-23T08:30:00+08:00")); // Excel cell
    expect(parseReceived("")).toBeNull();
    expect(parseReceived("yesterday")).toBe("bad");
    const rows = [
      { Title: "Old request", System: "RCM", Trade: "LCL", Received: "2026-09-23 08:30" },
      { Title: "No date", System: "RCM", Trade: "LCL" },
      { Title: "Future", System: "RCM", Trade: "LCL", Received: "2026-09-30 08:00" },
      { Title: "Bad", System: "RCM", Trade: "LCL", Received: "soon" },
    ];
    const chk = checkRows(rows, [], DEMO_ORG, NOW);
    expect(chk.map((r) => r.msg)).toEqual(["Ready", "Ready", "Received is in the future", "Received must be a date and time like 2026-09-24 08:30"]);
    const d = importRows(data([]), chk, NOW).data;
    expect(d.tasks.map((t) => t.received)).toEqual([Date.parse("2026-09-23T08:30:00+08:00"), NOW]);
    expect(d.tasks[0].history[0].text).toMatch(/received/);
  });
});

describe("task types with their own SLA, and holidays", async () => {
  const E = await import("./engine");
  const { applyAction } = await import("./actions");
  const { authorizeWl } = await import("./authz");
  const TYPES = [
    { id: "doc", name: "Doc review", sla: 2, trades: [], keywords: ["doc review", "documents"] },
    { id: "bk", name: "Booking", sla: 4, trades: ["eu"], keywords: ["booking"] },
  ];
  const mon = Date.parse("2026-09-28T09:00:00+08:00"); // Monday 09:00

  it("a typed task uses its type's SLA; others the standard SLA for their priority", () => {
    const s = settings({ taskTypes: TYPES });
    expect(E.slaHoursFor({ ttype: "doc", pr: "normal" }, s)).toBe(2);
    expect(E.slaHoursFor({ ttype: "", pr: "normal" }, s)).toBe(24);
    expect(E.slaHoursFor({ ttype: "", pr: "high" }, s)).toBe(4);
    expect(E.slaHoursFor({ ttype: "gone", pr: "low" }, s)).toBe(72); // deleted type: standard
    const t = task({ received: mon, ttype: "doc" });
    expect(E.due(t, sc({ taskTypes: TYPES }))).toBe(mon + 2 * H);
  });

  it("keeps the SLA a task came in with when the settings change", () => {
    const t = E.withSla(task({ received: mon, ttype: "doc" }), settings({ taskTypes: TYPES }));
    expect(t.slaH).toBe(2);
    const later = sc({ taskTypes: TYPES.map((x) => (x.id === "doc" ? { ...x, sla: 8 } : x)) });
    expect(E.due(t, later)).toBe(mon + 2 * H);
    // Older tasks without a fixed SLA follow the current settings.
    expect(E.due(task({ received: mon, ttype: "doc" }), later)).toBe(mon + 8 * H);
  });

  it("finds the type from keywords, respecting trades", () => {
    const s = settings({ taskTypes: TYPES });
    expect(E.detectType(s, "Please DOC REVIEW for shipment", "lcl")).toBe("doc");
    expect(E.detectType(s, "New booking request", "eu")).toBe("bk");
    expect(E.detectType(s, "New booking request", "lcl")).toBe(""); // Booking only covers EU
    expect(E.detectType(s, "Rate question", "eu")).toBe("");
  });

  it("uploads take the Task type column, or keywords, and fix the SLA", () => {
    const d = data([], { taskTypes: TYPES });
    const rows = [
      { Title: "Check invoice", Trade: "EU", "Task type": "Booking" },
      { Title: "documents for vessel", Trade: "LCL" },
      { Title: "Plain", Trade: "LCL" },
      { Title: "Bad", Trade: "LCL", "Task type": "Nope" },
    ];
    const chk = checkRows(rows, d.fields, d.org, NOW, TYPES);
    expect(chk.map((c) => c.ok)).toEqual([true, true, true, false]);
    expect(chk[3].msg).toContain("isn’t set up");
    const out = E.importRows(d, chk, NOW).data.tasks;
    expect(out.map((t) => [t.ttype, t.slaH])).toEqual([["bk", 4], ["doc", 2], ["", 24]]);
  });

  it("admins set the type from the task details; priority re-fixes a standard request's SLA", () => {
    const d = data([task({ id: "A", received: mon, slaH: 24 })], { taskTypes: TYPES });
    const r = applyAction(d, { type: "setTaskType", id: "A", ttype: "doc" }, mon + H);
    expect(r.data.tasks[0]).toMatchObject({ ttype: "doc", slaH: 2 });
    expect(r.data.tasks[0].history.at(-1)!.text).toContain("Doc review · SLA 2 h");
    const back = applyAction(r.data, { type: "setTaskType", id: "A", ttype: "" }, mon + H);
    expect(back.data.tasks[0]).toMatchObject({ ttype: "", slaH: 24 });
    const hi = applyAction(back.data, { type: "setPriority", id: "A", pr: "high" }, mon + H);
    expect(hi.data.tasks[0].slaH).toBe(4);
    const typed = applyAction(r.data, { type: "setPriority", id: "A", pr: "high" }, mon + H);
    expect(typed.data.tasks[0].slaH).toBe(2); // the type's SLA stays
    expect(applyAction(d, { type: "setTaskType", id: "A", ttype: "nope" }, mon).data).toBe(d);
    // Members can't change a task's type (it would change their SLA).
    expect("error" in authorizeWl({ type: "setTaskType", id: "A", ttype: "" }, { ...d, admins: [23] }, ANA)).toBe(true);
  });

  it("skips Calendar holidays in SLA time unless the team counts them", () => {
    const tue = Date.parse("2026-09-29T15:00:00+08:00"); // Tuesday 15:00, Wednesday is a holiday
    const t = task({ received: tue, pr: "normal" }); // 24 h
    expect(new Date(E.due(t, sc({}, ["2026-09-30"]))).toISOString()).toBe("2026-10-01T07:00:00.000Z"); // Thu 15:00
    expect(E.due(t, sc({ slaHolidays: true }, ["2026-09-30"]))).toBe(tue + 24 * H);
    // Holiday on a Friday plus the weekend: Thu 15:00 + 24 h → Mon 15:00.
    const thu = Date.parse("2026-10-01T15:00:00+08:00");
    expect(new Date(E.due(task({ received: thu }), sc({}, ["2026-10-02"]))).toISOString()).toBe("2026-10-05T07:00:00.000Z");
    // Waiting time doesn't grow on the holiday either.
    expect(E.waitingMs(t, sc({}, ["2026-09-30"]), Date.parse("2026-10-01T09:00:00+08:00"))).toBe(9 * H + 9 * H);
  });
});

describe("task type targets weight productivity", async () => {
  const E = await import("./engine");
  const TYPES = [
    { id: "doc", name: "Doc review", sla: 2, target: 4, trades: [], keywords: [] },
    { id: "bk", name: "Booking", sla: 4, target: 2, trades: [], keywords: [] },
    { id: "misc", name: "Misc", sla: 8, trades: [], keywords: [] },
  ];
  it("3 Doc reviews (of 4) and 1 Booking (of 2) make 125% of the day", () => {
    const d = data([], { taskTypes: TYPES });
    const done = [...Array(3)].map(() => task({ ttype: "doc", status: "done" })).concat(task({ ttype: "bk", status: "done" }));
    const r = E.dayShare(d, done, 8);
    expect(r.share).toBeCloseTo(1.25);
    expect(r.mix).toBe("3 Doc review of 4 · 1 Booking of 2");
    expect(E.typeTargets(d)).toBe(true);
  });
  it("tasks without a type target count against the member's target", () => {
    const d = data([], { taskTypes: TYPES });
    const r = E.dayShare(d, [task({ ttype: "misc" }), task({}), task({ ttype: "doc" })], 8);
    expect(r.share).toBeCloseTo(2 / 8 + 1 / 4);
    expect(r.mix).toBe("2 standard of 8 · 1 Doc review of 4");
  });
  it("personMetrics: full shift, weighted productivity", () => {
    const at = Date.parse("2026-09-24T18:00:00+08:00"); // after a 09:00 shift
    const ana = person(ANA)!;
    const mk = (ttype: string, i: number) =>
      task({ ttype, status: "done", assignee: ANA, startedAt: at - (i + 2) * H, doneAt: at - (i + 1) * H, received: at - 10 * H });
    const d = data([mk("doc", 0), mk("doc", 1), mk("doc", 2), mk("bk", 3)], { taskTypes: TYPES });
    const m = E.personMetrics(d, { ...ana, shiftStart: 8 }, at);
    expect(m.prod).toBe(125);
    // Without task types, the same tasks count 1 each against the member's target (8 for LCL).
    const plain = E.personMetrics(data(d.tasks), { ...ana, shiftStart: 8 }, at);
    expect(plain.prod).toBe(50);
  });
});

describe("upload keeps the Received date and time from the file", async () => {
  const E = await import("./engine");
  const { rowsToObjects } = await import("./excel");
  const at = (s: string) => Date.parse(s + "+08:00");
  it("an Excel date-and-time cell survives the trip to the server", () => {
    // ExcelJS reads a cell showing 25/09/2026 12:26 as a Date with those numbers in UTC.
    const rows = rowsToObjects([["Title *", "Trade *", "Received"], ["Rate check", "LCL", new Date(Date.UTC(2026, 8, 25, 12, 26))]]);
    const sent = JSON.parse(JSON.stringify(rows));
    expect(sent[0].Received).toBe("2026-09-25 12:26:00");
    const d = data([]);
    const [c] = checkRows(sent, d.fields, d.org, at("2026-09-28T14:00:00"));
    expect(c.ok).toBe(true);
    expect(c.task!.received).toBe(at("2026-09-25T12:26:00"));
    expect(E.importRows(d, [c], at("2026-09-28T14:00:00")).data.tasks[0].received).toBe(at("2026-09-25T12:26:00"));
  });
  it("reads the common ways people write it", () => {
    const P = E.parseReceived;
    expect(P("2026-09-25 12:26")).toBe(at("2026-09-25T12:26:00"));
    expect(P("2026-09-25T12:26:30")).toBe(at("2026-09-25T12:26:30"));
    expect(P("2026-09-25 12:26 PM")).toBe(at("2026-09-25T12:26:00"));
    expect(P("2026-09-25 1:05 pm")).toBe(at("2026-09-25T13:05:00"));
    expect(P("25/09/2026 12:26")).toBe(at("2026-09-25T12:26:00")); // day first
    expect(P("09/25/2026 12:26 AM")).toBe(at("2026-09-25T00:26:00")); // month first
    expect(P("05/09/2026 08:00")).toBe("ambiguous"); // 5 Sep or 9 May?
    expect(P(46290.5180556)).toBe(at("2026-09-25T12:26:00")); // Excel serial
    expect(P("2026-02-30")).toBe("bad");
    expect(P("yesterday")).toBe("bad");
    expect(P("")).toBe(null);
  });
  it("admins can correct a task's received time", async () => {
    const { applyAction } = await import("./actions");
    const d = data([task({ id: "A", received: at("2026-09-28T00:00:00") })]);
    const r = applyAction(d, { type: "setReceived", id: "A", received: at("2026-09-25T12:26:00") }, at("2026-09-28T14:00:00"));
    expect(r.data.tasks[0].received).toBe(at("2026-09-25T12:26:00"));
    expect(r.data.tasks[0].history.at(-1)!.text).toContain("Received changed");
    expect(applyAction(d, { type: "setReceived", id: "A", received: at("2026-10-05T00:00:00") }, at("2026-09-28T14:00:00")).data).toBe(d);
  });
});

describe("dashboard metrics for any period", async () => {
  const E = await import("./engine");
  const { personPeriod, teamPeriod } = await import("./metrics");
  const { periodRange, periodBuckets, periodLabel } = await import("./period");
  const at = (s: string) => Date.parse(s + "+08:00");
  const ana = { ...person(ANA)!, shiftStart: 8 };
  const done = (day: string, i: number, p: Partial<Task> = {}) =>
    task({ assignee: ANA, status: "done", received: at(`${day}T08:00:00`), startedAt: at(`${day}T09:00:00`) + i * H, doneAt: at(`${day}T09:30:00`) + i * H, ...p });

  it("weeks, months and years, with day or month breakdowns", () => {
    const now = at("2026-09-24T10:30:00");
    const [f, t] = periodRange("year", now);
    expect([new Date(f).toISOString(), new Date(t).toISOString()]).toEqual(["2025-12-31T16:00:00.000Z", "2026-12-31T16:00:00.000Z"]);
    expect(periodLabel("year", now, now)).toBe("2026");
    expect(periodBuckets("year", now).map((b) => b[0])).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
    expect(periodBuckets("week", now).map((b) => b[0])).toEqual(["Mon 21 Sep", "Tue 22 Sep", "Wed 23 Sep", "Thu 24 Sep", "Fri 25 Sep", "Sat 26 Sep", "Sun 27 Sep"]);
    expect(periodBuckets("month", now)).toHaveLength(30);
  });

  it("a week: productivity over the days worked, utilization, timeliness, overtime", () => {
    const now = at("2026-09-26T12:00:00"); // Saturday, the week so far
    const tasks = [done("2026-09-21", 0), done("2026-09-21", 1), done("2026-09-22", 0), done("2026-09-23", 0, { received: at("2026-09-18T08:00:00") })];
    const d = data(tasks);
    const [from, to] = periodRange("week", now);
    const activities = [
      { id: "b", pid: ANA, kind: "break" as const, start: at("2026-09-21T12:00:00"), end: at("2026-09-21T13:00:00"), otMin: 0, otStatus: null, decidedBy: null, decidedAt: null },
      { id: "e", pid: ANA, kind: "end" as const, start: at("2026-09-22T18:00:00"), end: at("2026-09-22T18:00:00"), otMin: 45, otStatus: "approved" as const, decidedBy: 1, decidedAt: 0 },
    ];
    const x = { from, to, now, workDays: { [ANA]: ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"] }, activities };
    const r = personPeriod(d, ana, x);
    expect(r.days).toBe(5);
    expect(r.done).toHaveLength(4);
    expect(r.prod).toBe(Math.round((4 / 8 / 5) * 100)); // 4 tasks, target 8 a day, 5 days
    expect(r.onTime).toBe(3); // the one received the week before was late (24 h SLA)
    expect(r.otMin).toBe(45);
    expect(r.awayMin).toBe(60);
    expect(r.handle).toBe(4 * 30 * 60000);
    const team = teamPeriod(d, [r], tasks, x);
    expect(team).toMatchObject({ done: 4, onTime: 3, received: 3, time: 75 });
  });

  it("today matches the live daily figures", () => {
    const now = at("2026-09-24T14:00:00");
    const tasks = [done("2026-09-24", 0), done("2026-09-24", 1)];
    const d = data(tasks);
    const [from, to] = periodRange("day", now);
    const r = personPeriod(d, ana, { from, to, now, workDays: { [ANA]: ["2026-09-24"] }, activities: [] });
    expect(r.prod).toBe(E.personMetrics(d, ana, now).prod);
  });
});

describe("overtime broken down by process", async () => {
  const E = await import("./engine");
  const at = (hm: string) => Date.parse(`2026-09-24T${hm}:00+08:00`);
  // A member on two processes (GPM › FEWB and RCM › LCL), day shift 08:00–17:00.
  const two = { ...PEOPLE.find((p) => p.id === ANA)!, trades: ["fewb", "lcl"], shiftStart: 8 };
  const withTwo = (tasks: Task[] = [], p: Partial<Settings> = {}) => ({ ...data(tasks, p), people: data([]).people.map((x) => (x.id === ANA ? two : x)) });

  it("suggests the split from the tasks worked after the shift", () => {
    const d = withTwo([
      task({ assignee: ANA, trade: "fewb", status: "done", startedAt: at("16:30"), doneAt: at("17:40") }), // 40 min after 17:00
      task({ assignee: ANA, trade: "lcl", status: "done", startedAt: at("17:40"), doneAt: at("19:00") }), // 80 min
    ]);
    expect(E.suggestOtSplit(d, two, 120, at("19:00"))).toEqual([{ trade: "lcl", min: 80 }, { trade: "fewb", min: 40 }]);
    expect(E.suggestOtSplit(withTwo(), two, 90, at("18:30"))).toEqual([{ trade: "fewb", min: 90 }]); // no tasks: first process
    expect(E.otProcesses(d, two).map((o) => o.id)).toEqual(["fewb", "lcl"]);
  });

  it("saves the breakdown when it adds up; refuses it otherwise", () => {
    const d = withTwo();
    const ok = E.endWork(d, ANA, 300, at("22:00"), [{ trade: "fewb", min: 120 }, { trade: "lcl", min: 180 }]).data.activities[0];
    expect(ok).toMatchObject({ otMin: 300, otStatus: "pending", otSplit: [{ trade: "fewb", min: 120 }, { trade: "lcl", min: 180 }] });
    expect(E.endWork(d, ANA, 300, at("22:00"), [{ trade: "fewb", min: 100 }]).message).toMatch(/add up to 5 h/);
    expect(E.endWork(d, ANA, 60, at("18:00"), [{ trade: "nope", min: 60 }]).message).toMatch(/Choose a process/);
    // Two lines for the same process become one; task types are kept per line.
    const types = [{ id: "doc", name: "Doc review", sla: 2, trades: [], keywords: [] }];
    const m = E.endWork(withTwo([], { taskTypes: types }), ANA, 90, at("18:30"), [
      { trade: "lcl", min: 30 },
      { trade: "lcl", min: 30 },
      { trade: "lcl", ttype: "doc", min: 30 },
    ]).data.activities[0];
    expect(m.otSplit).toEqual([{ trade: "lcl", min: 60 }, { trade: "lcl", ttype: "doc", min: 30 }]);
    // Without a breakdown, nothing is stored for it.
    expect(E.endWork(d, ANA, 60, at("18:00")).data.activities[0].otSplit).toBeNull();
  });
});

describe("overtime: processes worked, task types per process, and the target", async () => {
  const E = await import("./engine");
  const at = (hm: string) => Date.parse(`2026-09-24T${hm}:00+08:00`);
  // One process (RCM › LCL), day shift 08:00–17:00, target 4 a day in 6.8 productive hours.
  const one = { ...PEOPLE.find((p) => p.id === ANA)!, trades: ["lcl"], shiftStart: 8 };
  const mk = (tasks: Task[] = [], p: Partial<Settings> = {}) => ({
    ...data(tasks, { memberTargets: { [ANA]: "4" }, ...p }),
    people: data([]).people.map((x) => (x.id === ANA ? one : x)),
  });

  it("offers other trades only when the member worked tasks in them after the shift", () => {
    expect(E.otProcesses(mk(), one, 120, at("19:00")).map((o) => o.id)).toEqual(["lcl"]);
    expect(E.asksOtSplit(mk().settings, E.otProcesses(mk(), one, 120, at("19:00")))).toBe(false);
    const helped = mk([task({ assignee: ANA, trade: "eu", status: "done", startedAt: at("17:30"), doneAt: at("18:10") })]);
    const procs = E.otProcesses(helped, one, 120, at("19:00")).map((o) => o.id);
    expect(procs.sort()).toEqual(["eu", "lcl"]);
    // A task in another trade before the shift ended doesn't count.
    const earlier = mk([task({ assignee: ANA, trade: "eu", status: "done", startedAt: at("15:00"), doneAt: at("16:00") })]);
    expect(E.otProcesses(earlier, one, 120, at("19:00")).map((o) => o.id)).toEqual(["lcl"]);
    // End work accepts the other trade, and with one process records it without asking.
    const ok = E.endWork(helped, ANA, 120, at("19:00"), [{ trade: "eu", min: 40 }, { trade: "lcl", min: 80 }]).data.activities[0];
    expect(ok.otSplit).toEqual([{ trade: "eu", min: 40 }, { trade: "lcl", min: 80 }]);
    expect(E.endWork(mk(), ANA, 120, at("19:00")).data.activities[0].otSplit).toEqual([{ trade: "lcl", min: 120 }]);
  });

  it("shows only the task types a process has", () => {
    const types = [
      { id: "doc", name: "Doc review", sla: 2, trades: ["eu"], keywords: [] },
      { id: "all", name: "Any trade", sla: 4, trades: [], keywords: [] },
    ];
    const s = mk([], { taskTypes: types }).settings;
    expect(E.typesFor(s, "lcl").map((t) => t.id)).toEqual(["all"]);
    expect(E.typesFor(s, "eu").map((t) => t.id)).toEqual(["doc", "all"]);
    expect(E.asksOtSplit(s, [{ id: "lcl" }])).toBe(true); // one process, but it has a type
    expect(E.asksOtSplit(mk([], { taskTypes: [types[0]] }).settings, [{ id: "lcl" }])).toBe(false);
    // A type that isn't for the process is refused.
    const d = mk([], { taskTypes: types });
    expect(E.endWork(d, ANA, 60, at("18:00"), [{ trade: "lcl", ttype: "doc", min: 60 }]).message).toMatch(/Choose a process/);
  });

  it("adds the whole tasks that fit in the overtime to the target", () => {
    const s = mk().settings;
    expect(E.otDays(s, 4, 180)).toBe(0.25); // 4 in 6.8 h: 3 h adds 1 task
    expect(E.otDays(s, 4, 60)).toBe(0); // not a whole task
    expect(E.otDays(s, 4, 6.8 * 60)).toBe(1);
    // Ended with 3 h overtime: 4 + 1 target; 5 done = 100%.
    const done = [0, 1, 2, 3, 4].map((i) => task({ assignee: ANA, status: "done", startedAt: at("09:00") + i * H, doneAt: at("09:30") + i * H }));
    const ended = E.endWork(mk(done), ANA, 180, at("20:00")).data;
    const m = E.personMetrics(ended, one, at("20:05"));
    expect(m.otTarget).toBe(1);
    expect(m.prod).toBe(100);
    // Declined overtime doesn't raise it.
    const id = ended.activities[0].id;
    const no = { ...ended, activities: ended.activities.map((a) => (a.id === id ? { ...a, otStatus: "declined" as const } : a)) };
    expect(E.personMetrics(no, one, at("20:05")).prod).toBe(125);
  });
});

describe("complexity", async () => {
  const E = await import("./engine");
  const { authorizeWl } = await import("./authz");
  const at = (hm: string) => Date.parse(`2026-09-24T${hm}:00+08:00`);
  const levels = [
    { id: "simple", name: "Simple", target: 12, aht: 30 },
    { id: "medium", name: "Medium", target: 8, aht: 60 },
    { id: "complex", name: "Complex", target: 4, aht: 120 },
  ];
  const cxs = (p: Partial<Settings> = {}) => ({ complexity: { on: true, levels, tol: 50 }, prodBasis: "contracts", ...p });
  const working = (started: string) => task({ status: "in_progress", assignee: ANA, startedAt: at(started) });

  it("asks for the contracts by complexity at Mark done and sets the contracts field to their total", () => {
    const t = working("09:00");
    const d = data([t], cxs());
    expect(E.completeTask(d, t.id, { ticket: "1", carrier: "MSK" }, ANA, at("10:00")).message).toMatch(/contracts of each complexity/);
    const o = E.completeTask(d, t.id, { ticket: "1", carrier: "MSK" }, ANA, at("10:00"), { simple: 1, complex: 2, bogus: 5 });
    const done = get(o.data, t.id);
    expect(done.status).toBe("done");
    expect(done.cx).toEqual({ simple: 1, complex: 2 });
    expect(done.fields.contracts).toBe(3);
    expect(done.history.at(-1)!.text).toBe("Done · 1 Simple · 2 Complex");
  });

  it("counts each contract against its level's target first", () => {
    const d = data([], cxs());
    const t = task({ status: "done", cx: { simple: 1, medium: 1, complex: 1 }, fields: { contracts: 3 } });
    expect(E.dayShare(d, [t], 20).share).toBeCloseTo(1 / 12 + 1 / 8 + 1 / 4);
    expect(E.dayShare(d, [t], 20).mix).toBe("1 Simple of 12 · 1 Medium of 8 · 1 Complex of 4");
    // A level without its own target uses the usual one; without complexity, the contracts field ÷ target.
    const noT = data([], cxs({ complexity: { on: true, levels: [{ id: "simple", name: "Simple" }], tol: 50 } }));
    expect(E.dayShare(noT, [task({ status: "done", cx: { simple: 2 }, fields: { contracts: 2 } })], 20).share).toBeCloseTo(0.1);
    expect(E.dayShare(data([], { prodBasis: "contracts" }), [t], 20).share).toBeCloseTo(0.15);
  });

  it("questions tagging that doesn't match the time worked, until an admin checks it", () => {
    // 3 Simple at 30 min = 1 h 30 expected; worked 4 h.
    const slow = task({ status: "done", assignee: ANA, startedAt: at("09:00"), doneAt: at("13:00"), cx: { simple: 3 }, fields: { contracts: 3 } });
    const ok = task({ status: "done", assignee: ANA, startedAt: at("13:00"), doneAt: at("14:40"), cx: { simple: 3 }, fields: { contracts: 3 } });
    const fast = task({ status: "done", assignee: ANA, startedAt: at("15:00"), doneAt: at("15:10"), cx: { complex: 1 }, fields: { contracts: 1 } });
    const d = data([slow, ok, fast], cxs());
    expect(E.cxCheck(d, slow)).toMatchObject({ expMs: 90 * M, actMs: 4 * H, flag: "slow" });
    expect(E.cxCheck(d, ok)!.flag).toBeNull();
    // Done quickly isn't a question by itself: 1 Complex (target 4 a day) is 25% of a day.
    expect(E.cxCheck(d, fast)!.flag).toBeNull();
    expect(E.cxOver(d, fast)).toMatchObject({ pct: 25, flag: false });
    expect(E.cxQuestions(d).map((t) => t.id)).toEqual([slow.id]);
  });

  it("flags over-productive tickets: more contracts in one ticket than a day's target", () => {
    const cx3 = (fast?: number) => cxs({ complexity: { on: true, levels: levels.map((l) => (l.id === "complex" ? { ...l, target: 3 } : l)), tol: 50, ...(fast === undefined ? {} : { fast }) } });
    // 16 Complex when the target is 3 Complex a day: 533% of a day in one ticket.
    const big = task({ status: "done", assignee: ANA, startedAt: at("09:00"), doneAt: at("17:00"), cx: { complex: 16 }, fields: { contracts: 16 } });
    const d = data([big], cx3());
    expect(E.cxOver(d, big)).toEqual({ pct: 533, text: "16 Complex of 3 a day", flag: true });
    expect(E.cxQuestions(d).map((t) => t.id)).toEqual([big.id]);
    // Mixed levels add up: 6 Simple of 12 + 2 Complex of 3 = 50% + 67% = 117%.
    expect(E.cxOver(d, { ...big, cx: { simple: 6, complex: 2 } })).toMatchObject({ pct: 117, flag: true });
    expect(E.cxOver(d, { ...big, cx: { simple: 6, complex: 1 } })).toMatchObject({ pct: 83, flag: false });
    // The limit is the admin's (default 100%); 0 turns it off.
    expect(E.cxOver(data([big], cx3(600)), big)!.flag).toBe(false);
    expect(E.cxOver(data([big], cx3(0)), big)!.flag).toBe(false);
    // Levels without a target aren't counted; none with a target: no check.
    const noT = cxs({ complexity: { on: true, levels: levels.map(({ target: _t, ...l }) => l), tol: 50 } });
    expect(E.cxOver(data([big], noT), big)).toBeNull();
    // Corrected to the right complexity (2 Complex, 14 Simple = 183%): productivity follows, and
    // once an admin has checked it, it leaves the list.
    const fixed = E.reviewCx(d, big.id, 23, at("17:30"), { complex: 2, simple: 14 }).data;
    expect(get(fixed, big.id)).toMatchObject({ cx: { simple: 14, complex: 2 }, fields: { contracts: 16 }, cxReview: { verdict: "corrected", was: { complex: 16 } } });
    expect(E.cxOver(fixed, get(fixed, big.id))).toMatchObject({ pct: 183 });
    expect(E.cxQuestions(fixed)).toEqual([]);
  });

  it("lets an admin confirm or correct a questioned ticket", () => {
    const slow = task({ status: "done", assignee: ANA, startedAt: at("09:00"), doneAt: at("13:00"), cx: { simple: 3 }, fields: { contracts: 3 } });
    const fast = task({ status: "done", assignee: ANA, startedAt: at("15:00"), doneAt: at("15:10"), cx: { complex: 1 }, fields: { contracts: 1 } });
    const d = data([slow, fast], cxs());
    // Confirm one, correct the other: both leave the list; the correction updates the contracts.
    const c1 = E.reviewCx(d, fast.id, 23, at("16:00")).data;
    expect(get(c1, fast.id).cxReview).toMatchObject({ by: 23, verdict: "ok" });
    const c2 = E.reviewCx(c1, slow.id, 23, at("16:00"), { complex: 2 }, "two complex contracts").data;
    expect(get(c2, slow.id)).toMatchObject({ cx: { complex: 2 }, fields: { contracts: 2 }, cxReview: { verdict: "corrected", was: { simple: 3 }, note: "two complex contracts" } });
    expect(E.cxQuestions(c2)).toEqual([]);
    // Only admins may check it.
    expect(authorizeWl({ type: "reviewCx", id: slow.id, by: 0 }, d, ANA)).toEqual({ error: "Only Workload admins can do that." });
  });

  it("Edit ticket changes everything on a resolved ticket, with checks and history", () => {
    const types = [{ id: "doc", name: "Doc review", sla: 2, trades: ["lcl"], keywords: [] }];
    const t = task({ status: "done", assignee: ANA, received: at("08:00"), startedAt: at("09:00"), doneAt: at("10:00"), cx: { complex: 4 }, fields: { ticket: "1", contracts: 4 } });
    const d = data([t], cxs({ taskTypes: types }));
    const mate = d.people.find((p) => p.id !== ANA && p.trades.includes("lcl"))!;
    const o = E.editDone(d, t.id, { ticket: "1-A" }, 23, at("16:00"), {
      title: "Fixed title",
      pr: "high",
      ttype: "doc",
      received: at("08:30"),
      startedAt: at("09:15"),
      doneAt: at("10:15"),
      assignee: mate.id,
      otMin: 15,
      delay: "Waited for the carrier",
      cx: { complex: 1, simple: 3 },
    });
    const x = get(o.data, t.id);
    expect(x).toMatchObject({
      title: "Fixed title", pr: "high", ttype: "doc", slaH: 2, received: at("08:30"), startedAt: at("09:15"), doneAt: at("10:15"),
      assignee: mate.id, otMin: 15, ot: true, delay: "Waited for the carrier", cx: { simple: 3, complex: 1 },
      fields: { ticket: "1-A", contracts: 4 }, cxReview: { verdict: "corrected", was: { complex: 4 } },
    });
    const h = x.history.at(-1)!.text;
    for (const part of ["Title: t → Fixed title", "Priority: Normal → High", "Task type: Standard request → Doc review", `Resolved by: ${d.people.find((p) => p.id === ANA)!.name} → ${mate.name}`, "Complexity: 4 Complex → 3 Simple · 1 Complex", "Ticket no.: 1 → 1-A"])
      expect(h).toContain(part);
    // Checks: times in order, a known person and trade, a type used in the trade.
    expect(E.editDone(d, t.id, {}, 23, at("16:00"), { startedAt: at("07:00") }).message).toMatch(/Started must be between/);
    expect(E.editDone(d, t.id, {}, 23, at("16:00"), { doneAt: at("17:00") }).message).toMatch(/future/);
    expect(E.editDone(d, t.id, {}, 23, at("16:00"), { assignee: 999 }).message).toMatch(/Choose who/);
    expect(E.editDone(d, t.id, {}, 23, at("16:00"), { trade: "nope" }).message).toMatch(/Choose a trade/);
    expect(E.editDone(d, t.id, {}, 23, at("16:00"), { ttype: "doc", trade: "eu" }).message).toMatch(/isn’t used/);
    expect(E.editDone(d, t.id, {}, 23, at("16:00"), { title: "  " }).message).toMatch(/empty/);
    // Unchanged values aren't changes; open tickets aren't edited here.
    expect(E.editDone(d, t.id, {}, 23, at("16:00"), { title: "t", pr: "normal", received: at("08:00") }).message).toBe("Nothing changed.");
    const open = task({ status: "in_progress", assignee: ANA, startedAt: at("09:00") });
    expect(E.editDone(data([open], cxs()), open.id, {}, 23, at("16:00"), { title: "x" }).data.tasks[0]).toBe(open);
  });

  it("lets an admin correct a resolved ticket's details, kept in its history", () => {
    const t = task({ status: "done", assignee: ANA, startedAt: at("09:00"), doneAt: at("10:00"), cx: { simple: 2 }, fields: { ticket: "1", carrier: "MSK", contracts: 2 } });
    const d = data([t], cxs());
    const o = E.editDone(d, t.id, { ticket: "1", carrier: "CMA", contracts: 9 }, 23, at("16:00"));
    const x = get(o.data, t.id);
    expect(x.fields).toMatchObject({ carrier: "CMA", contracts: 2 }); // contracts follow the complexity counts
    expect(x.history.at(-1)!.text).toMatch(/^Details corrected by .+ · Carrier: MSK → CMA$/);
    expect(E.editDone(d, t.id, { carrier: "MSK" }, 23, at("16:00")).message).toBe("Nothing changed.");
    expect(E.editDone(data([working("09:00")], cxs()), "nope", {}, 23, at("16:00")).data.tasks).toHaveLength(1);
    expect(authorizeWl({ type: "editDone", id: t.id, vals: {}, by: 0 }, d, ANA)).toEqual({ error: "Only Workload admins can do that." });
  });
});

describe("average handling time", async () => {
  const { ahtStats, perContract, perTicket, vsExpected } = await import("./aht");
  const at = (hm: string) => Date.parse(`2026-09-24T${hm}:00+08:00`);
  const levels = [
    { id: "simple", name: "Simple", aht: 30 },
    { id: "complex", name: "Complex", aht: 120 },
  ];
  it("computes FTE needed from tickets received and AHT", async () => {
    const { fteStats } = await import("./aht");
    // 2 h per ticket on LCL; 6 more LCL tickets received today → 6 × 2 h = 12 h of work.
    const a = task({ status: "done", assignee: ANA, trade: "lcl", startedAt: at("08:00"), doneAt: at("10:00"), received: at("07:00") });
    const more = Array.from({ length: 5 }, () => task({ trade: "lcl", received: at("09:00") }));
    const d = data([a, ...more]);
    const f = fteStats(d, at("00:00"), at("23:59"), NOW);
    const lcl = f.rows.find((r) => r.key === "lcl")!;
    expect(f.days).toBe(1);
    expect(lcl).toMatchObject({ received: 6, ahtOwn: true });
    expect(lcl.workH).toBeCloseTo(12);
    expect(lcl.need).toBeCloseTo(12 / f.prodH);
    expect(lcl.have).toBeGreaterThan(0);
  });

  it("per ticket, per contract, per level (time shared by set AHT) and vs expected", () => {
    const a = task({ status: "done", assignee: ANA, trade: "lcl", startedAt: at("09:00"), doneAt: at("10:00"), cx: { simple: 2 }, fields: { contracts: 2 } }); // 60 of 60 expected
    const b = task({ status: "done", assignee: ANA, trade: "lcl", startedAt: at("10:00"), doneAt: at("13:00"), cx: { simple: 1, complex: 1 }, fields: { contracts: 2 } }); // 180 of 150
    const d = data([a, b], { complexity: { on: true, levels, tol: 50 }, prodBasis: "contracts" });
    const st = ahtStats(d, at("00:00"), at("23:59"));
    expect(st.total).toMatchObject({ tickets: 2, contracts: 4 });
    expect(perTicket(st.total)).toBe(2 * H);
    expect(perContract(st.total)).toBe(H);
    // Ticket b: 180 min shared 30:120 → Simple 36 min, Complex 144 min.
    const simple = st.levels.find((x) => x.level.id === "simple")!.row;
    expect(perContract(simple)).toBe(((60 + 36) / 3) * M);
    expect(perContract(st.levels.find((x) => x.level.id === "complex")!.row)).toBe(144 * M);
    expect(vsExpected(st.members[0])).toBe(Math.round((240 / 210) * 100));
  });
});

describe("holiday duty and rest day overtime", async () => {
  const E = await import("./engine");
  const at = (hm: string) => Date.parse(`2026-09-26T${hm}:00+08:00`);
  const rest = { ...PEOPLE.find((p) => p.id === ANA)!, trades: ["lcl"], shiftStart: 8, otDay: "restday" as const };
  const mk = (tasks: Task[] = []) => ({ ...data(tasks, { memberTargets: { [ANA]: "4" } }), people: data([]).people.map((x) => (x.id === ANA ? rest : x)) });
  it("counts all time worked that day as overtime of its type", () => {
    const d = mk([task({ assignee: ANA, trade: "lcl", status: "done", startedAt: at("09:00"), doneAt: at("11:00") })]);
    expect(E.otAvailMin(d, rest, at("12:30"))).toBe(210);
    const a = E.endWork(d, ANA, 210, at("12:30")).data.activities[0];
    expect(a).toMatchObject({ otMin: 210, otStatus: "pending", otKind: "restday" });
    // Only the overtime is expected: 3.5 h at 4 a day in 6.8 h fits 2 tasks; 1 done = 50%.
    expect(E.personMetrics(E.endWork(d, ANA, 210, at("12:30")).data, rest, at("12:31")).prod).toBe(50);
    // A normal day's end-of-work entry has no type.
    const norm = { ...rest, otDay: undefined };
    const n = { ...d, people: d.people.map((x) => (x.id === ANA ? norm : x)) };
    expect(E.endWork(n, ANA, 0, Date.parse("2026-09-24T18:00:00+08:00")).data.activities[0].otKind).toBeNull();
  });
});

describe("delay remarks and the due / overdue board", async () => {
  const E = await import("./engine");
  const { dueBoard } = await import("./dueBoard");
  it("needs delay remarks to resolve an overdue ticket", () => {
    const t = task({ status: "in_progress", assignee: ANA, startedAt: NOW - H, received: NOW - 100 * H, fields: { ticket: "1", carrier: "MSK", contracts: 1 } });
    const d = data([t]);
    expect(E.completeTask(d, t.id, t.fields, ANA, NOW).message).toMatch(/overdue\. Enter delay remarks/);
    const ok = E.completeTask(d, t.id, t.fields, ANA, NOW, null, "  Waited for the carrier  ");
    expect(get(ok.data, t.id)).toMatchObject({ status: "done", delay: "Waited for the carrier" });
    // On time: no remarks needed.
    const fresh = task({ status: "in_progress", assignee: ANA, startedAt: NOW - H, received: NOW - H, fields: { ticket: "1", carrier: "MSK", contracts: 1 } });
    expect(get(E.completeTask(data([fresh]), fresh.id, fresh.fields, ANA, NOW).data, fresh.id).status).toBe("done");
  });
  it("takes delay remarks on open overdue tickets, kept at resolve", async () => {
    const { authorizeWl } = await import("./authz");
    const t = task({ status: "assigned", assignee: ANA, received: NOW - 100 * H });
    const d = data([t]);
    const r = E.setDelay(d, t.id, " Carrier slow ", NOW);
    expect(get(r.data, t.id).delay).toBe("Carrier slow");
    expect(E.setDelay(r.data, t.id, "", NOW).data.tasks[0].delay).toBeNull();
    const ok = task({ status: "assigned", assignee: ANA, received: NOW - H });
    expect(E.setDelay(data([ok]), ok.id, "x", NOW).message).toMatch(/isn't overdue/);
    expect("action" in authorizeWl({ type: "setDelay", id: t.id, delay: "x" }, d, ANA)).toBe(true);
    const other = d.people.find((p) => p.id !== ANA && !d.admins.includes(p.id) && !d.approvers.includes(p.id))!;
    expect("error" in authorizeWl({ type: "setDelay", id: t.id, delay: "x" }, d, other.id)).toBe(true);
  });
  it("counts open tickets by due day and system", () => {
    const over = task({ trade: "lcl", received: NOW - 100 * H }); // RCM, overdue
    const soon = task({ trade: "fewb", received: NOW - H }); // GPM, still due
    const b = dueBoard(data([over, soon]), [over, soon], NOW);
    const rcm = b.groups.find((g) => g.name === "RCM")!;
    const gpm = b.groups.find((g) => g.name === "GPM")!;
    expect(rcm.overNow).toEqual([over.id]);
    expect(rcm.due.flat()).toEqual([]);
    expect(gpm.due.flat()).toEqual([soon.id]);
    expect(gpm.overNow).toEqual([]);
    expect(b.cols.some((c) => c.today)).toBe(true);
    // Future days project overdue: still open and due by the end of that day.
    const later = task({ trade: "fewb", received: NOW + 30 * H }); // due a few days out
    const b2 = dueBoard(data([over, later]), [over, later], NOW);
    const g2 = b2.groups.find((g) => g.name === "GPM")!;
    const dueCol = g2.due.findIndex((x) => x.includes(later.id));
    expect(b2.cols[dueCol].future).toBe(true);
    expect(g2.over[dueCol]).toEqual([later.id]); // overdue by the end of its due day if not resolved
    expect(g2.over[dueCol - 1]).toEqual([]);
    const r2 = b2.groups.find((g) => g.name === "RCM")!;
    expect(r2.over.slice(b2.cols.findIndex((c) => c.future)).every((x) => x.includes(over.id))).toBe(true); // stays overdue on every future day
  });
});

describe("break and lunch over the allowance", async () => {
  const { breakFlags } = await import("./breaks");
  const act = (pid: number, kind: "break" | "lunch" | "meeting", start: number, min: number | null) =>
    ({ id: `A${pid}${kind}${start}`, pid, kind, start, end: min === null ? null : start + min * M, otMin: 0, otStatus: null, decidedBy: null, decidedAt: null });
  it("flags days where break and lunch together exceed the planned breaks", () => {
    // Planned breaks: 60 + 30 = 90 min.
    const d = { ...data([]), activities: [act(ANA, "lunch", NOW - 5 * H, 65), act(ANA, "break", NOW - 2 * H, 20), act(ANA, "meeting", NOW - 4 * H, 60), act(8, "break", NOW - 3 * H, 30)] };
    expect(breakFlags(d, NOW - 10 * H, NOW + H, NOW)).toEqual([]); // 85 min: within
    d.activities.push(act(ANA, "break", NOW - 20 * M, null)); // ongoing 20 min → 105
    const f = breakFlags(d, NOW - 10 * H, NOW + H, NOW);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ pid: ANA, min: 105, allowed: 90, over: 15 });
  });
});

describe("business case: fixed against unit pricing", async () => {
  const B = await import("./business");
  const { applyAction } = await import("./actions");
  const { authorizeWl } = await import("./authz");
  const at = (d: string) => Date.parse(`2026-${d}T10:00:00+08:00`);
  const types = [{ id: "doc", name: "Doc review", sla: 4, trades: [], keywords: [] }];
  const hc = {
    year: 2026,
    rows: [
      { pid: 0, name: "Ana", level: "member" as const, billed: Array(12).fill(1) },
      { pid: 1, name: "Ben", level: "senior" as const, billed: [...Array(8).fill(1), 0.5, 1, 1, 1] },
      { pid: 23, name: "Sam", level: "manager" as const, billed: Array(12).fill(0) },
    ],
  };
  const bill = (p = {}) => ({ mode: "fixed" as const, currency: "USD", roleRates: { member: 2000, senior: 3000 }, unitRates: { "": 10, doc: 25 }, unit: "tasks", when: "resolved" as const, ...p });
  const tasks = [
    task({ status: "done", doneAt: at("09-02"), received: at("08-30"), fields: { contracts: 3 } }),
    task({ status: "done", doneAt: at("09-03"), received: at("09-01"), ttype: "doc", fields: { contracts: 2 } }),
    task({ status: "new", received: at("09-04"), ttype: "doc", fields: { contracts: 5 } }),
    task({ status: "done", doneAt: at("08-20"), received: at("08-20"), ttype: "gone" }),
  ];
  const mk = (p = {}) => ({ ...data(tasks, { taskTypes: types, billing: bill(p) }), hc, pricers: [23] });

  it("prices billed FTE per role per month and transactions per task type", () => {
    const bc = B.businessCase(mk(), 2026, 9);
    const sep = bc.months[8];
    expect(bc.months).toHaveLength(9);
    expect(sep).toMatchObject({ fte: 1.5, fixed: 2000 + 1500, units: 2, unit: 10 + 25 });
    expect(sep.roles.map((r) => r.id)).toEqual(["member", "senior"]); // the manager isn't billed
    expect(bc.months[7]).toMatchObject({ units: 1, unit: 0 }); // a removed type has no price
    expect(bc.unpricedTypes).toEqual(["Removed task type"]);
    expect(bc.total.fixed).toBe(8 * 5000 + 3500);
  });

  it("counts what the admin chooses: per ticket or a number field, when resolved or received", () => {
    const rec = B.businessCase(mk({ when: "received" }), 2026, 9).months[8];
    expect(rec).toMatchObject({ units: 2, unit: 25 + 25 }); // the open doc review counts; the August one doesn't
    const field = B.businessCase(mk({ unit: "contracts" }), 2026, 9).months[8];
    expect(field).toMatchObject({ units: 5, unit: 3 * 10 + 2 * 25 });
  });

  it("flags roles with billed FTE but no rate, and shows pricing to managers and above only", () => {
    const bc = B.businessCase(mk({ roleRates: { member: 2000 } }), 2026, 9);
    expect(bc.unpricedRoles).toEqual(["senior"]);
    const d = mk();
    expect(B.forViewer(d, 23)).toBe(d);
    const emp = B.forViewer(d, ANA);
    expect(emp.settings.billing).toBeUndefined();
    expect(emp.hc).toBeUndefined();
    expect(authorizeWl({ type: "setSettings", patch: { billing: bill() } }, d, ANA)).toHaveProperty("error");
    // A team lead who is a Workload admin runs the team, but pricing is for managers and above.
    const lead = { ...d, admins: [23, 9] };
    expect(B.forViewer(lead, 9).settings.billing).toBeUndefined();
    expect(authorizeWl({ type: "setSettings", patch: { billing: bill() } }, lead, 9)).toEqual({ error: "Only managers and directors can set pricing." });
    expect(authorizeWl({ type: "setSettings", patch: { staleDays: 3 } }, lead, 9)).toHaveProperty("action");
    expect(authorizeWl({ type: "setSettings", patch: { billing: bill() } }, lead, 23)).toHaveProperty("action");
  });

  it("cleans rates saved from the page", () => {
    const r = applyAction(mk(), { type: "setSettings", patch: { billing: { ...bill(), mode: "x" as never, currency: " eur ", roleRates: { member: -5, senior: 2500 }, unitRates: { doc: Number.NaN, "": 12 } } } }, NOW);
    expect(r.data.settings.billing).toEqual({ mode: "fixed", currency: "EUR", roleRates: { senior: 2500 }, unitRates: { "": 12 }, unit: "tasks", when: "resolved" });
    // Other settings and every task stay as they were.
    expect(r.data.tasks).toBe(mk().tasks);
  });
});
