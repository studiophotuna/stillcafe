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

const data = (tasks: Task[], p: Partial<Settings> = {}): WorkloadData => ({
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
    expect(sortTasks([a, b, c, d], settings()).map((t) => t.id)).toEqual([b.id, d.id, c.id, a.id]);
    expect(sortTasks([a, b, c, d], settings({ order: "received" })).map((t) => t.id)).toEqual([a.id, d.id, c.id, b.id]);
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

  it("does not give work to unavailable people unless the team allows it", () => {
    const t = task({ trade: "eu" });
    expect(get(startWork(data([t]), ELI, NOW).data, t.id).status).toBe("new");
    expect(get(startWork(data([t], { skipUnavail: false }), ELI, NOW).data, t.id).status).toBe("in_progress");
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
    expect(endWork(data([task({ status: "in_progress", assignee: ANA, startedAt: at("17:30") })]), ANA, 0, at("18:10")).message).toMatch(/Finish your task/);
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
