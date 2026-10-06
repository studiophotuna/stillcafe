import { describe, expect, it } from "vitest";
import { applyCalAction } from "./actions";
import { Cal, evState } from "./engine";
import { REPORT_TYPES, buildReport, toCsv } from "./reports";
import { initialCalendar } from "./seed";
import { checkUpload } from "./uploads";
import type { CalendarData, LeaveRequest } from "./types";

const TODAY = "2026-09-24";
const NOW = Date.parse("2026-09-24T10:30:00+08:00");
const fresh = () => initialCalendar(TODAY);
const run = (d: CalendarData, a: Parameters<typeof applyCalAction>[1]) => applyCalAction(d, a, TODAY, NOW);
const ANA = 0; // LCL (Rate Management) + Customer Service; pattern B; employee view
const SAM = 23; // Rate Management admin

describe("seed", () => {
  it("builds the sample department", () => {
    const d = fresh();
    expect(d.people).toHaveLength(34);
    expect(d.nodes.filter((n) => n.type === "tower")).toHaveLength(5);
    expect(d.requests.slice(0, 8).map((q) => q.id)).toEqual(["LR000001", "LR000002", "LR000003", "LR000004", "LR000005", "LR000006", "LR000007", "LR000008"]);
    expect(d.bcpEvents.find((e) => evState(e, TODAY) === "active")?.id).toBe("E2");
    expect(d.logs.length).toBeGreaterThan(0);
  });
});

describe("cell resolution", () => {
  const d = fresh();
  const c = new Cal(d, TODAY);
  const ana = c.person(ANA);
  it("weekends are blank, weekdays follow the weekly pattern", () => {
    expect(c.raw(ana, "2026-09-26", "rm").code).toBe(""); // Saturday
    expect(c.raw(ana, "2026-09-24", "rm").code).toBe("WFH"); // pattern B: Thu/Fri WFH
    expect(c.raw(ana, "2026-09-22", "rm").code).toBe("RTO");
  });
  it("shows leave status per team", () => {
    // LR000001: rm pending, cs approved
    const rm = c.raw(ana, "2026-09-28", "rm");
    const cs = c.raw(ana, "2026-09-28", "cs");
    expect(rm).toMatchObject({ code: "VL", pending: true });
    expect(cs).toMatchObject({ code: "VL", pending: false });
    // Declined for rm (LR000005) → normal schedule there, leave in cs
    expect(c.raw(ana, "2026-09-11", "rm").code).toBe("WFH");
    expect(c.raw(ana, "2026-09-11", "cs").code).toBe("VL");
  });
  it("holidays and holiday duty", () => {
    const sam = c.person(SAM);
    expect(c.raw(ana, "2026-11-30", "rm")).toMatchObject({ code: "HOL", note: "Bonifacio Day" });
    expect(c.raw(sam, "2026-11-30", "rm").code).toBe("HDY");
    // Team-scoped company day only for Rate Management
    const csOnly = c.person(31);
    expect(c.raw(csOnly, "2026-10-16", "cs").code).toBe("RTO");
    expect(c.raw(ana, "2026-10-16", "rm").code).toBe("HOL");
  });
  it("hides people after their last day", () => {
    const felix = c.person(28); // resigned 2026-09-18
    expect(c.raw(felix, "2026-09-21", "rm").gone).toBe(true);
    expect(c.raw(felix, "2026-09-17", "rm").gone).toBeUndefined();
  });
  it("counts working days without weekends and holidays", () => {
    expect(c.workdays("2026-12-21", "2026-12-31")).toBe(5); // 24, 25, 30, 31 are holidays
  });
});

describe("requests and approvals", () => {
  it("routes to the first team in the member's profile only, with notifications", () => {
    const d = fresh();
    const o = run(d, { type: "submitRequest", pid: ANA, form: { type: "VL", start: "2026-10-12", end: "2026-10-13", half: "AM", reason: "" }, adminBid: null, actor: ANA });
    const q = o.data.requests[0];
    expect(q.approvals).toEqual({ rm: "pending" }); // Ana: Rate Management first, then Customer Service
    expect(o.message).toBe("Request sent. The Rate Management admin will get an email to approve it.");
    const newLogs = o.data.logs.slice(0, o.data.logs.length - d.logs.length);
    expect(newLogs.map((l) => l.subject)).toEqual(expect.arrayContaining([expect.stringMatching(/^Approval needed: Ana Reyes/)]));
    // Her other team shows the request on its calendar with the overall (pending) status.
    const c = new Cal(o.data, TODAY);
    expect(c.raw(c.person(ANA), "2026-10-12", "cs")).toMatchObject({ code: "VL", pending: true });
    // Approving at Rate Management decides it everywhere.
    const ok = run(o.data, { type: "decide", rid: q.id, bid: "rm", st: "approved", actor: SAM });
    expect(new Cal(ok.data, TODAY).raw(c.person(ANA), "2026-10-12", "cs")).toMatchObject({ code: "VL", pending: false });
  });

  it("decides several requests at once and lists each request at one team only", async () => {
    const { waitsOn } = await import("./approvals");
    const d = fresh();
    // An older request still listing both teams waits only at the first one.
    d.requests = ([{ ...d.requests[0], id: "LRX", pid: ANA, approvals: { rm: "pending" as const, cs: "pending" as const } }] as LeaveRequest[]).concat(d.requests);
    const c = new Cal(d, TODAY);
    const q = d.requests[0];
    expect(waitsOn(c, q, "rm")).toBe(true);
    expect(waitsOn(c, q, "cs")).toBe(false);
    const pend = d.requests.filter((x) => x.approvals.rm === "pending").map((x) => x.id);
    const o = run(d, { type: "decideMany", rids: pend, bid: "rm", st: "approved", actor: SAM });
    expect(o.message).toMatch(new RegExp(`^Approved ${pend.length} request`));
    for (const id of pend) expect(Object.values(o.data.requests.find((x) => x.id === id)!.approvals).every((v) => v === "approved")).toBe(true);
  });

  it("rejects requests with no working days", () => {
    const d = fresh();
    const o = run(d, { type: "submitRequest", pid: ANA, form: { type: "VL", start: "2026-09-26", end: "2026-09-27", half: "AM", reason: "" }, adminBid: null, actor: ANA });
    expect(o.data).toBe(d);
  });

  it("approval sends an Outlook reminder to the team", () => {
    const d = fresh();
    const o = run(d, { type: "decide", rid: "LR000002", bid: "rm", st: "approved", actor: SAM });
    expect(o.data.requests.find((q) => q.id === "LR000002")!.approvals.rm).toBe("approved");
    expect(o.message).toMatch(/^Approved\. Kim has been emailed and an Outlook reminder was sent to \d+ Rate Management members\.$/);
    expect(o.data.logs[0].kind === "invite" || o.data.logs[1].kind === "invite").toBe(true);
    // Deciding again does nothing
    expect(run(o.data, { type: "decide", rid: "LR000002", bid: "rm", st: "declined", actor: SAM }).data).toBe(o.data);
  });

  it("admin cell entry is approved for their team only", () => {
    const d = fresh();
    const o = run(d, { type: "submitRequest", pid: ANA, form: { type: "SL", start: "2026-10-07", end: "2026-10-07", half: "AM", reason: "Entered by Sam" }, adminBid: "rm", actor: SAM });
    expect(o.data.requests[0].approvals).toEqual({ rm: "approved" }); // one approval, by the admin's team
    expect(o.message).toBe("Sick leave recorded for Ana. Notifications sent.");
  });
});

describe("balances", () => {
  it("VL+SL share one pool; only fully approved requests count; EL separate", () => {
    const d = fresh();
    const c = new Cal(d, TODAY);
    const ana = c.person(ANA);
    // Ana: ytd 3, carry 0, entitle 25. Her VL requests are not fully approved (rm pending/declined).
    expect(c.usedOf(ana)).toBe(3);
    expect(c.poolOf(ana)).toBe(25);
    const o = run(d, { type: "decide", rid: "LR000001", bid: "rm", st: "approved", actor: SAM });
    const c2 = new Cal(o.data, TODAY);
    expect(c2.usedOf(c2.person(ANA))).toBe(3 + 3); // 28–30 Sep
    expect(c2.elUsedOf(c2.person(ANA))).toBe(0);
  });
});

describe("leave entitlements (pro-rating, carry-over, Philippine law leave)", async () => {
  const { prorate } = await import("./engine");
  const { leaveRule } = await import("./actions");
  it("pro-rates VL + SL in the hire year (hire month counts when starting by the 15th)", () => {
    expect(prorate(25, "2026-09-10")).toBe(8.5); // Sep–Dec: 25 × 4 ÷ 12 = 8.33
    expect(prorate(25, "2026-09-20")).toBe(6.5); // Oct–Dec: 6.25
    expect(prorate(25, "2026-01-05")).toBe(25);
    const d = fresh();
    const ana = d.people.find((p) => p.id === ANA)!;
    ana.hire = "2026-09-10";
    ana.ytd = 0;
    const c = new Cal(d, TODAY);
    expect(c.entOf(c.person(ANA))).toBe(8.5);
    ana.entitleFirst = 10; // set by an admin
    expect(new Cal(d, TODAY).entOf(ana)).toBe(10);
    // New members: EL 5, VL + SL pro-rated, carry-over automatic.
    const o = run(fresh(), { type: "addPerson", details: { name: "New Hire", email: "new.hire@example.com", hire: "2026-09-01" }, level: "member", shift: "D", adminHere: false, bid: "rm", assign: ["lcl"] });
    const nc = new Cal(o.data, TODAY);
    const np = nc.person(o.newPersonId!);
    expect([np.elEnt, nc.entOf(np), nc.carryOf(np)]).toEqual([5, 8.5, 0]);
  });
  it("carries last year's VL + SL left into the new year, up to 5, unless an admin set it", () => {
    const d = fresh();
    const ana = d.people.find((p) => p.id === ANA)!;
    ana.hire = "2020-01-01";
    ana.ytd = 18; // 2026: 25 − 18 = 7 left (no approved requests yet)
    ana.carry = 0;
    const next = new Cal(d, "2027-01-04");
    expect(next.carryOf(ana)).toBe(5);
    expect(next.carrySet(ana)).toBe(false);
    ana.ytd = 23; // 2 left
    expect(new Cal(d, "2027-01-04").carryOf(ana)).toBe(2);
    Object.assign(ana, { carry: 4, carryYear: 2027 }); // admin override for 2027
    expect(new Cal(d, "2027-01-04").carryOf(ana)).toBe(4);
    // "Used before the app" counts only in its year.
    expect(new Cal(d, "2027-01-04").usedOf(ana)).toBe(0);
  });
  it("maternity in calendar days, paternity and solo parent rules", () => {
    const d = fresh();
    const c = new Cal(d, TODAY);
    const p = { ...c.person(ANA) };
    expect(c.reqDays({ type: "ML", start: "2026-10-01", end: "2026-10-31" })).toBe(31);
    expect(leaveRule(c, { ...p, sex: "F" }, "ML", 105)).toBe("");
    expect(leaveRule(c, { ...p, sex: "F" }, "ML", 110)).toMatch(/up to 105/);
    expect(leaveRule(c, { ...p, sex: "F", soloParent: true }, "ML", 120)).toBe("");
    expect(leaveRule(c, { ...p, sex: "M" }, "ML", 10)).toMatch(/for women/);
    expect(leaveRule(c, { ...p, sex: "M" }, "PL", 8)).toMatch(/up to 7/);
    expect(leaveRule(c, p, "SPL", 1)).toMatch(/for solo parents/);
    expect(leaveRule(c, { ...p, soloParent: true }, "SPL", 7)).toBe("");
    const sp = run(d, { type: "submitRequest", pid: ANA, form: { type: "SPL", start: "2026-10-12", end: "2026-10-13", half: "AM", reason: "" }, adminBid: null, actor: ANA });
    expect(sp.error).toMatch(/solo parents/);
  });
});

describe("admin by role", async () => {
  const { rightsOf } = await import("./authz");
  it("directors administer their department, managers their tower, team leads their team", () => {
    const d = fresh();
    d.nodes = d.nodes.map((n) => ({ ...n, admins: [] })); // no admins added by hand
    const c = new Cal(d, TODAY);
    // Lead 24 (GPM, Rate Management): their team only.
    expect(rightsOf(c, 24).teamAdmin("rm")).toBe(true);
    expect(rightsOf(c, 24).teamAdmin("cs")).toBe(false);
    // Manager 23 (allocated to Rate Management): its tower, not another tower's team.
    expect(rightsOf(c, 23).teamAdmin("rm")).toBe(true);
    expect(rightsOf(c, 23).teamAdmin("cs")).toBe(false);
    // Manager 27 (Customer Service, another tower).
    expect(rightsOf(c, 27).teamAdmin("cs")).toBe(true);
    expect(rightsOf(c, 27).teamAdmin("rm")).toBe(false);
    // Director 26: every team in the department.
    expect(["rm", "cs"].every((b) => rightsOf(c, 26).teamAdmin(b))).toBe(true);
    // Associates stay members.
    expect(rightsOf(c, ANA).anyAdmin).toBe(false);
  });
});

describe("role functions across Calendar and Workload", async () => {
  const { rightsOf, visibleTeams } = await import("./authz");
  const { workloadAdmins, workloadApprovers } = await import("../workload/people");
  const { canDecide } = await import("./approvals");
  const { inViewOf } = await import("./org");
  it("each role sees, administers and approves the right part of the org", () => {
    const d = fresh();
    d.nodes = d.nodes.map((n) => ({ ...n, admins: [] }));
    // A director allocated to the whole department.
    d.people.push({ ...d.people[0], id: 90, name: "Dee Director", email: "dee@example.com", level: "director", assign: ["bss"], approver: undefined, sysAdmin: false });
    const c = new Cal(d, TODAY);
    const teams = (id: number) => visibleTeams(c, id).map((b) => b.id).sort();
    expect(teams(90)).toEqual(["cs", "rm"]); // director: every team in the department
    expect(teams(23)).toEqual(["rm"]); // manager of Rate Management's tower
    expect(teams(27)).toEqual(["cs"]); // manager of Customer Service's tower
    expect(teams(24)).toEqual(["rm"]); // team lead
    expect(teams(ANA)).toEqual(["cs", "rm"]); // associate in two teams: just their own
    expect(["rm", "cs"].map((b) => rightsOf(c, 90).teamAdmin(b))).toEqual([true, true]);
    expect(rightsOf(c, ANA).anyAdmin).toBe(false);
    // Workload admins / approvers of Rate Management.
    const wa = workloadAdmins(c, "rm");
    expect([90, 23, 24].every((x) => wa.includes(x))).toBe(true);
    expect(wa.includes(27) || wa.includes(ANA)).toBe(false);
    expect(workloadApprovers(c, "rm")).toEqual(expect.arrayContaining([90, 23, 24]));
    // Deciding a Rate Management request: its lead, manager and director; not another tower's manager.
    const q = { pid: 5 };
    expect([90, 23, 24].map((x) => canDecide(c, x, q, "rm"))).toEqual([true, true, true]);
    expect(canDecide(c, 27, q, "rm")).toBe(false);
    // Views: the director shows in the department view and each team view, not when a system is picked.
    const p90 = c.person(90);
    expect(inViewOf(c.O, ["rm", "cs"], ["rm", "cs"], false)(p90)).toBe(true);
    expect(inViewOf(c.O, ["rm"], ["rm"], false)(p90)).toBe(true);
    expect(inViewOf(c.O, ["rm"], ["gpm"], true)(p90)).toBe(false);
    // The tower manager allocated to the whole tower shows in its team, not in another tower's.
    const mgr = { ...c.person(23), assign: ["t_rm"] };
    expect(inViewOf(c.O, ["rm"], ["rm"], false)(mgr)).toBe(true);
    expect(inViewOf(c.O, ["cs"], ["cs"], false)(mgr)).toBe(false);
  });
});

describe("people and org", () => {
  it("resignation cancels later requests", () => {
    const d = fresh();
    const o = run(d, { type: "setResign", pid: ANA, date: "2026-09-25" });
    expect(o.data.people[ANA].resign).toBe("2026-09-25");
    expect(o.data.requests.some((q) => q.pid === ANA && q.start > "2026-09-25")).toBe(false);
    expect(o.message).toBe("Ana Reyes will not appear from October 2026 onwards.");
  });

  it("deleting a system keeps its people in the team", () => {
    const d = fresh();
    const o = run(d, { type: "deleteNode", id: "gpm" });
    expect(o.data.nodes.some((n) => ["gpm", "fewb", "inas", "eu"].includes(n.id))).toBe(false);
    expect(o.data.people[5].assign).toEqual(["rm"]); // was fewb
  });

  it("remove from team keeps other allocations, refuses the last one", () => {
    const d = fresh();
    expect(run(d, { type: "removeFromTeam", pid: ANA, bid: "cs" }).data.people[ANA].assign).toEqual(["lcl"]);
    const o = run(d, { type: "removeFromTeam", pid: 15, bid: "rm" });
    expect(o.data).toBe(d);
    expect(o.message).toMatch(/has no other allocation/);
  });

  it("save member updates admins of the team", () => {
    const d = fresh();
    const o = run(d, { type: "saveMember", pid: 15, level: "lead", shift: "M", adminHere: true, bid: "rm", assign: ["lcl"], isNew: false });
    expect(o.data.nodes.find((n) => n.id === "rm")!.admins).toEqual([23, 15]);
    expect(o.data.people[15]).toMatchObject({ level: "lead", shift: "M" });
  });
});

describe("uploads", () => {
  it("schedule: skips unchanged cells, validates, records leave as approved", () => {
    const d = fresh();
    const c = new Cal(d, TODAY);
    const rows = [
      { Email: "ana.reyes@dsv.com", Date: "2026-09-24", Code: "WFH" }, // unchanged
      { Email: "ana.reyes@dsv.com", Date: "2026-10-05", Code: "VL" },
      { Email: "ana.reyes@dsv.com", Date: "2026-10-06", Code: "XX" },
      { Email: "nobody@dsv.com", Date: "2026-10-06", Code: "WFH" },
      { Email: "ana.reyes@dsv.com", Date: "2026-10-07", Code: "", Shift: "MID" },
    ];
    const chk = checkUpload(c, "schedule", rows, "rm");
    expect(chk[0].skip).toBe(true);
    expect(chk.slice(1).map((x) => x.msg)).toEqual([
      "Recorded as approved leave",
      "Give a Code (RTO, WFH, RD, RDOT, VL, SL, EL, HD, BT, HDY) or a Shift",
      "Person not found",
      "Shift Midshift 12:00–21:00",
    ]);
    const o = run(d, { type: "importUpload", mode: "schedule", rows, bid: "rm" });
    expect(o.data.requests[0]).toMatchObject({ pid: ANA, type: "VL", start: "2026-10-05", approvals: { rm: "approved", cs: "approved" } });
    expect(o.data.roster["0|2026-10-07"]).toBe("MID");
    expect(o.message).toBe("2 schedule rows imported. No emails were sent for imported rows.");
  });

  it("members: new people and extra allocations", () => {
    const d = fresh();
    const rows = [
      { Name: "Juan Dela Cruz", Email: "juan.delacruz@dsv.com", Role: "Member", Department: "BSS", Tower: "A&S Support - Rate Management", Team: "Rate Management", System: "RCM", Trade: "LCL" },
      { Name: "Ana Reyes", Email: "ana.reyes@dsv.com", Role: "Member", Department: "BSS", Tower: "A&S Support - Rate Management", Team: "Rate Management", System: "GPM", Trade: "EU" },
      { Name: "X", Email: "bad", Department: "BSS" },
    ];
    const chk = checkUpload(new Cal(d, TODAY), "members", rows, "rm");
    expect(chk.map((x) => x.stText)).toEqual(["New", "Update", "Error"]);
    const o = run(d, { type: "importUpload", mode: "members", rows, bid: "rm" });
    expect(o.data.people).toHaveLength(35);
    expect(o.data.people[34]).toMatchObject({ name: "Juan Dela Cruz", assign: ["lcl"] });
    expect(o.data.people[ANA].assign).toEqual(["lcl", "cs", "eu"]);
  });
});

describe("reports", () => {
  it("builds each report with a header matching the design", () => {
    const c = new Cal(fresh(), TODAY);
    const att = buildReport(c, "attendance", "rm", "2026-09-01", "2026-09-30");
    expect(att.rows[0]).toHaveLength(15);
    expect(att.rows.length).toBeGreaterThan(20);
    expect(buildReport(c, "manning", "rm", "2026-09-01", "2026-09-30").rows).toHaveLength(31);
    expect(buildReport(c, "bcp", "bss", "2026-09-01", "2026-09-30", "E2", "bss").rows[1][0]).toMatch(/Typhoon/);
    expect(buildReport(c, "headcount", "bss", "2026-09-01", "2026-09-30").rows.map((r) => r[1])).toEqual(["Team", "Customer Service", "Rate Management"]);
    expect(toCsv([["a,b", 'q"'], [1, 2]])).toBe('﻿"a,b","q"""\r\n1,2');
  });
});

describe("adding members and rights", async () => {
  const { authorizeCal } = await import("./authz");
  const details = { name: " New  Person ", email: "New.Person@Example.com" };
  const add = (extra = {}) => ({ type: "addPerson" as const, details, level: "member" as const, shift: "D", adminHere: false, bid: "rm", assign: ["rm"], ...extra });

  it("adds a new person with details and defaults", () => {
    const d = fresh();
    const r = run(d, add({ details: { ...details, entitle: 20, wfhDays: [5, 1, 1] } }));
    expect(r.error).toBeUndefined();
    const p = r.data.people.find((x) => x.id === r.newPersonId)!;
    expect(p).toMatchObject({ name: "New Person", email: "new.person@example.com", entitle: 20, elEnt: 5, hire: TODAY, wfhDays: [1, 5], resign: null });
    expect(r.newPersonId).toBe(Math.max(...d.people.map((x) => x.id)) + 1);
  });

  it("rejects duplicate emails, missing names and bad numbers", () => {
    const d = fresh();
    const taken = d.people[0].email.toUpperCase();
    expect(run(d, add({ details: { ...details, email: taken } })).error).toMatch(/already/);
    expect(run(d, add({ details: { ...details, name: "  " } })).error).toMatch(/name/);
    expect(run(d, add({ details: { ...details, carry: 9 } })).error).toMatch(/Carry-over/);
    expect(run(d, add({ assign: [] })).error).toMatch(/allocation/);
  });

  it("uses WFH weekdays over the A/B pattern", () => {
    const d = fresh();
    const r = run(d, add({ details: { ...details, wfhDays: [3] } }));
    const c = new Cal(r.data, TODAY);
    const p = c.person(r.newPersonId!);
    expect(c.raw(p, "2026-09-23", "rm").code).toBe("WFH"); // Wednesday
    expect(c.raw(p, "2026-09-24", "rm").code).toBe("RTO"); // Thursday
  });

  it("lets team admins add people, not members", () => {
    const c = new Cal(fresh(), TODAY);
    expect("error" in authorizeCal(add(), c, ANA)).toBe(true);
    expect("action" in authorizeCal(add(), c, SAM)).toBe(true);
  });

  it("only lets a system admin change a system admin's details", () => {
    const d = fresh();
    d.people = d.people.map((p) => (p.id === ANA ? { ...p, sysAdmin: true } : p));
    const c = new Cal(d, TODAY);
    const edit = { type: "saveMember" as const, pid: ANA, level: "member" as const, shift: "D", adminHere: false, bid: "rm", assign: ["rm"], isNew: false, details: { email: "x@y.z" } };
    const bySam = authorizeCal(edit, c, SAM);
    expect("action" in bySam && bySam.action.type === "saveMember" && bySam.action.details).toBeFalsy();
    const byAna = authorizeCal({ ...edit, pid: SAM, details: { email: "x@y.z" } }, c, ANA);
    expect("action" in byAna && byAna.action.type === "saveMember" && byAna.action.details).toEqual({ email: "x@y.z" });
  });

  it("lets the last admin be removed from a team", () => {
    const d = fresh();
    const only = d.nodes.find((n) => n.id === "rm")!.admins!;
    const r = run(d, { type: "saveMember", pid: only[0], level: "manager", shift: "D", adminHere: false, bid: "rm", assign: ["rm"], isNew: false });
    const left = r.data.nodes.find((n) => n.id === "rm")!.admins!;
    expect(left).not.toContain(only[0]);
  });
});

describe("org import", async () => {
  const { parseOrgText, planOrgImport } = await import("./orgImport");
  const { emptyCalendar } = await import("./seed");
  const text = "Tower\tTeam\nNorth Tower\tAlpha\nNorth Tower\tBeta \n  north tower \talpha\nA&S Support - Rate Management\tGPM\nA&S Support - Rate Management\tNew RM Team\n\nSouth\tGamma\tSys1\tTradeX";

  it("parses pasted Excel rows and drops the header", () => {
    const rows = parseOrgText(text);
    expect(rows[0]).toEqual(["North Tower", "Alpha"]);
    expect(rows).toHaveLength(6);
    expect(parseOrgText("A,B\nC,D")).toEqual([["A", "B"], ["C", "D"]]);
  });

  it("adds missing towers and teams once, and treats a team that is already a system as there", () => {
    const d = emptyCalendar();
    const r = run(d, { type: "importOrg", dept: "bss", rows: parseOrgText(text) });
    const c = new Cal(r.data, TODAY);
    const byName = (n: string) => r.data.nodes.filter((x) => x.name === n);
    expect(byName("North Tower")).toHaveLength(1);
    expect(c.O.kids(byName("North Tower")[0].id, "branch").map((x) => x.name)).toEqual(["Alpha", "Beta"]);
    expect(byName("GPM")).toHaveLength(1); // still the system inside Rate Management
    expect(byName("New RM Team")[0].parent).toBe("t_rm");
    expect(byName("New RM Team")[0]).toMatchObject({ mode: "approval", admins: [] });
    expect(byName("TradeX")[0].parent).toBe(byName("Sys1")[0].id);
    expect(r.message).toBe("Added 2 towers, 4 teams, 1 system, 1 trade.");
    // Running it again adds nothing.
    const again = run(r.data, { type: "importOrg", dept: "bss", rows: parseOrgText(text) });
    expect(again.data).toBe(r.data);
    expect(again.message).toMatch(/Nothing new/);
  });

  it("rejects rows without a team, and needs an admin", async () => {
    const { authorizeCal } = await import("./authz");
    expect(run(emptyCalendar(), { type: "importOrg", dept: "bss", rows: [["Only tower"]] }).error).toMatch(/Row 1/);
    const c = new Cal(fresh(), TODAY);
    expect("error" in authorizeCal({ type: "importOrg", dept: "bss", rows: [] }, c, ANA)).toBe(true);
  });
});

describe("allocation depth by role", async () => {
  const { authorizeCal } = await import("./authz");
  const details = { name: "Lead Person", email: "lead.person@example.com" };
  const add = (level: "director" | "manager" | "lead" | "member", assign: string[]) =>
    run(fresh(), { type: "addPerson", details, level, shift: "D", adminHere: false, bid: "rm", assign });

  it("directors need only a department, managers a tower, others a team", () => {
    expect(add("director", ["bss"]).error).toBeUndefined();
    expect(add("manager", ["bss"]).error).toMatch(/department and tower/);
    expect(add("manager", ["t_rm"]).error).toBeUndefined();
    expect(add("member", ["t_rm"]).error).toMatch(/department, tower and team/);
    expect(add("lead", ["rm"]).error).toBeUndefined();
    expect(add("director", ["rm"]).error).toBeUndefined(); // deeper is fine
  });

  it("gives a department-level director no team, and their leave is approved automatically", () => {
    const r = add("director", ["bss"]);
    const c = new Cal(r.data, TODAY);
    const id = r.newPersonId!;
    expect(c.O.branchesOf(c.person(id))).toHaveLength(0);
    const q = run(r.data, { type: "submitRequest", pid: id, form: { type: "VL", start: "2026-10-12", end: "2026-10-12", half: "AM", reason: "" }, adminBid: null, actor: id });
    expect(q.message).toMatch(/Approved automatically/);
  });

  it("stops a team admin from editing someone allocated above their team", () => {
    const r = add("director", ["bss"]);
    const c = new Cal(r.data, TODAY);
    const edit = { type: "saveMember" as const, pid: r.newPersonId!, level: "member" as const, shift: "D", adminHere: false, bid: "rm", assign: ["rm"], isNew: false };
    expect("error" in authorizeCal(edit, c, SAM)).toBe(true);
  });

  it("accepts upload rows by role", () => {
    const c = new Cal(fresh(), TODAY);
    const dept = c.O.by.bss.name;
    const tower = c.O.by.t_rm.name;
    const rows = checkUpload(c, "members", [
      { Name: "Dee Rector", Email: "dee@example.com", Role: "Director", Department: dept },
      { Name: "Manny Ger", Email: "manny@example.com", Role: "Manager", Department: dept, Tower: tower },
      { Name: "Manny Two", Email: "manny2@example.com", Role: "Manager", Department: dept },
      { Name: "Mem Ber", Email: "mem@example.com", Role: "Member", Department: dept, Tower: tower },
    ], "rm");
    expect(rows.map((x) => x.ok)).toEqual([true, true, false, false]);
    expect(rows[0].member?.leaf).toBe("bss");
    expect(rows[1].member?.leaf).toBe("t_rm");
  });
});

describe("department and tower admins", async () => {
  const { authorizeCal, rightsOf, visibleTeams } = await import("./authz");
  it("gives a department or tower admin rights in every team under it", () => {
    const d = fresh();
    d.nodes = d.nodes.map((n) => (n.id === "t_rm" ? { ...n, admins: [ANA] } : n));
    const c = new Cal(d, TODAY);
    const r = rightsOf(c, ANA);
    expect(r.teamAdmin("rm")).toBe(true);
    expect(r.teamAdmin("cs")).toBe(false); // other tower
    expect(r.adminOf(15)).toBe(true); // Leo, in Rate Management
    expect(visibleTeams(c, ANA).map((b) => b.id).sort()).toEqual(["cs", "rm"]);
    const other = d.requests.find((q) => q.pid !== ANA && q.approvals.rm === "pending")!;
    expect("action" in authorizeCal({ type: "decide", rid: other.id, bid: "rm", st: "approved", actor: ANA }, c, ANA)).toBe(true);
  });
  it("only makes leaders admins, and editing a member keeps their admin status", () => {
    expect(run(fresh(), { type: "addAdmin", id: "rm", pid: ANA }).error).toMatch(/team lead, manager or director/);
    const d = run(fresh(), { type: "addAdmin", id: "bss", pid: SAM }).data;
    const rm = d.nodes.find((n) => n.id === "rm")!.admins ?? [];
    const keep = rm.find((id) => id !== SAM) ?? rm[0];
    const kp = d.people.find((p) => p.id === keep)!;
    const after = run(d, { type: "saveMember", pid: keep, level: kp.level, shift: kp.shift, bid: "rm", assign: kp.assign, isNew: false }).data;
    expect(after.nodes.find((n) => n.id === "rm")!.admins).toEqual(rm);
  });
  it("lets a department or tower lose its last admin, not a team", () => {
    let d = run(fresh(), { type: "addAdmin", id: "bss", pid: SAM }).data;
    d = run(d, { type: "removeAdmin", id: "bss", pid: SAM }).data;
    expect(d.nodes.find((n) => n.id === "bss")!.admins).toEqual([]);
    const only = fresh().nodes.find((n) => n.id === "rm")!.admins!;
    if (only.length === 1) expect(run(fresh(), { type: "removeAdmin", id: "rm", pid: only[0] }).data.nodes.find((n) => n.id === "rm")!.admins).toEqual(only);
  });
});

describe("headcount report", async () => {
  const { teamHeadcount, headcount } = await import("./headcount");
  const { authorizeCal } = await import("./authz");
  const base = () => {
    const d = fresh();
    d.people = d.people.map((p) =>
      p.id === 15 ? { ...p, hire: "2025-03-10", resign: "2026-01-20" } // Leo: last day in January
      : p.id === 16 ? { ...p, hire: "2026-03-02" } // Mia: joined March
      : p,
    );
    return d;
  };
  it("counts from the hire month through the last day's month, then 0; leads billed 0; once per person", () => {
    const d = base();
    const c = new Cal(d, TODAY);
    const rm = teamHeadcount(c, c.O.by.rm, 2026);
    const row = (id: number) => rm.rows.find((r) => r.pid === id)!;
    expect(row(15).months.slice(0, 3).map((m) => [m.actual, m.billed])).toEqual([[1, 1], [0, 0], [0, 0]]);
    expect(row(16).months.slice(0, 4).map((m) => m.actual)).toEqual([null, null, 1, 1]);
    const sam = row(SAM); // manager, team lead of RM
    expect(sam.lead).toBe(true);
    expect(sam.months[0]).toMatchObject({ actual: 1, billed: 0 });
    // Ana is in Rate Management (first allocation) and Customer Service: counted once, in RM.
    expect(row(ANA).fte).toBe(1);
    expect(teamHeadcount(c, c.O.by.cs, 2026).rows.some((r) => r.pid === ANA)).toBe(false);
    expect(rm.rows[0].lead).toBe(true); // leads first
    const jan = rm.withTl[0].actual - rm.without[0].actual;
    expect(jan).toBe(rm.rows.filter((r) => r.lead).reduce((a, r) => a + (r.months[0].actual ?? 0), 0));
  });
  it("applies billed overrides for chosen months, only by team admins", () => {
    const d = base();
    const r = run(d, { type: "setBilled", pid: SAM, bid: "rm", months: ["2026-04", "2026-05"], value: 0.5 });
    const c = new Cal(r.data, TODAY);
    const sam = teamHeadcount(c, c.O.by.rm, 2026).rows.find((x) => x.pid === SAM)!;
    expect(sam.months.slice(2, 6).map((m) => [m.billed, m.override])).toEqual([[0, false], [0.5, true], [0.5, true], [0, false]]);
    const back = run(r.data, { type: "setBilled", pid: SAM, bid: "rm", months: ["2026-04"], value: null }).data;
    expect(back.billing).toEqual({ [`${SAM}|rm|2026-05`]: 0.5 });
    expect("error" in authorizeCal({ type: "setBilled", pid: SAM, bid: "rm", months: [], value: 1 }, new Cal(d, TODAY), ANA)).toBe(true);
    expect(headcount(new Cal(d, TODAY), 2026, (id) => id === "rm").map((t) => t.teams.map((x) => x.id))).toEqual([["rm"]]);
  });
  it("keeps team settings to real settings, and checks links", () => {
    const r = run(fresh(), { type: "teamSettings", id: "rm", patch: { costCentre: " E705SSCGPM ", admins: [ANA], parent: "bss" } as never });
    const rm = r.data.nodes.find((n) => n.id === "rm")!;
    expect(rm.costCentre).toBe("E705SSCGPM");
    expect(rm.admins).not.toContain(ANA);
    expect(rm.parent).toBe("t_rm");
    const l = run(fresh(), { type: "setLinks", links: { bipoLeave: "https://example.com/leave", bipoOt: "javascript:alert(1)", quick: [{ label: "HR", url: "https://hr.example.com" }, { label: "Bad", url: "http://x.y" }] } }).data.links;
    expect(l).toEqual({ bipoLeave: "https://example.com/leave", bipoOt: undefined, quick: [{ label: "HR", url: "https://hr.example.com" }] });
  });
});

describe("primary team for headcount", async () => {
  const { teamHeadcount } = await import("./headcount");
  it("counts people in several teams only in the primary team an admin chose", () => {
    const d = fresh();
    const ana = d.people.find((p) => p.id === ANA)!;
    const r = run(d, { type: "saveMember", pid: ANA, level: ana.level, shift: ana.shift, adminHere: false, bid: "cs", assign: ana.assign, isNew: false, details: { primaryTeam: "cs" } });
    const c = new Cal(r.data, TODAY);
    expect(c.person(ANA).primaryTeam).toBe("cs");
    expect(teamHeadcount(c, c.O.by.cs, 2026).rows.map((x) => x.pid)).toContain(ANA);
    // From this month on she counts in Customer Service only; earlier months stay in Rate Management.
    const m = Number(TODAY.slice(5, 7)) - 1;
    const rmRow = teamHeadcount(c, c.O.by.rm, 2026).rows.find((x) => x.pid === ANA)!;
    const csRow = teamHeadcount(c, c.O.by.cs, 2026).rows.find((x) => x.pid === ANA)!;
    expect(rmRow.months.slice(m).every((x) => x.actual === null)).toBe(true);
    expect(csRow.months.slice(0, m).every((x) => x.actual === null)).toBe(true);
    expect(csRow.months[m].actual).toBe(1);
    // Removed from the primary team: falls back to the remaining team.
    const out = run(r.data, { type: "removeFromTeam", pid: ANA, bid: "cs" }).data;
    expect(out.people.find((p) => p.id === ANA)!.primaryTeam).toBeUndefined();
    // A team that isn't theirs isn't kept.
    const bad = run(d, { type: "saveMember", pid: ANA, level: ana.level, shift: ana.shift, adminHere: false, bid: "rm", assign: ana.assign, isNew: false, details: { primaryTeam: "nope" } });
    expect(bad.data.people.find((p) => p.id === ANA)!.primaryTeam).toBe("rm");
  });
});

describe("working on a holiday", async () => {
  const { authorizeCal } = await import("./authz");
  const HOL = "2026-10-21"; // a Wednesday holiday for everyone
  const withHol = () => {
    const d = fresh();
    d.holidays = d.holidays.concat({ id: "HT", date: HOL, name: "Test Day", type: "regular", scope: "all" });
    return d;
  };
  const act = (code: "RTO" | "WFH" | null, pid = ANA) => ({ type: "holidayWork" as const, pid, date: HOL, code, actor: ANA });

  it("lets members mark themselves on holiday duty and back", () => {
    const d = withHol();
    const c = new Cal(d, TODAY);
    expect(c.raw(c.person(ANA), HOL, "rm").code).toBe("HOL");
    const auth = authorizeCal(act("WFH"), c, ANA);
    expect("action" in auth).toBe(true);
    const r = run(d, act("WFH"));
    const c2 = new Cal(r.data, TODAY);
    expect(c2.raw(c2.person(ANA), HOL, "rm")).toMatchObject({ code: "HDY", note: "Test Day" });
    expect(r.data.overrides[ANA + "|" + HOL]).toBe("WFH");
    expect(r.data.logs[0].subject).toContain("working on Test Day (from home)");
    const back = run(r.data, act(null));
    expect(back.data.overrides[ANA + "|" + HOL]).toBeUndefined();
  });

  it("only for the person themselves (or their admin), and only on holidays", () => {
    const c = new Cal(withHol(), TODAY);
    expect("error" in authorizeCal(act("RTO", SAM), c, ANA)).toBe(true);
    expect("action" in authorizeCal(act("RTO", ANA), c, SAM)).toBe(true);
    const d = withHol();
    expect(run(d, { ...act("RTO"), date: "2026-10-22" }).data).toBe(d); // not a holiday
    expect(run(d, { ...act("RTO"), code: "VL" as never }).data).toBe(d);
  });
});

describe("holiday replies and holiday manning", async () => {
  const HOL = "2026-10-21";
  const withHol = () => {
    const d = fresh();
    d.holidays = d.holidays.concat({ id: "HT", date: HOL, name: "Test Day", type: "regular", scope: "all" });
    return d;
  };
  it("a 'Holiday' reply keeps the day a holiday, tells no one, and means nothing on other days", () => {
    const r = run(withHol(), { type: "holidayWork", pid: ANA, date: HOL, code: "HOL", actor: ANA });
    expect(r.data.overrides[ANA + "|" + HOL]).toBe("HOL");
    expect(r.data.logs.length).toBe(fresh().logs.length);
    const c = new Cal(r.data, TODAY);
    expect(c.raw(c.person(ANA), HOL, "rm").code).toBe("HOL");
    const d2 = { ...r.data, holidays: r.data.holidays.filter((h) => h.id !== "HT") };
    const c2 = new Cal(d2, TODAY);
    expect(c2.raw(c2.person(ANA), HOL, "rm").code).toBe("RTO"); // Wednesday, pattern B
  });
  it("lists Department / Tower / Team / Name with a status per holiday", () => {
    let d = run(withHol(), { type: "holidayWork", pid: ANA, date: HOL, code: "WFH", actor: ANA }).data;
    d = run(d, { type: "holidayWork", pid: SAM, date: HOL, code: "HOL", actor: SAM }).data;
    const rep = buildReport(new Cal(d, TODAY), "holiday", "rm", "2026-10-01", "2026-10-31");
    const head = rep.rows[0];
    expect(head.slice(0, 4)).toEqual(["Department", "Tower", "Team", "Name"]);
    const col = head.findIndex((h) => String(h).startsWith(HOL));
    expect(String(head[col])).toContain("Test Day");
    const row = (pid: number) => rep.rows.find((r) => r[3] === d.people.find((p) => p.id === pid)!.name)!;
    expect(row(ANA)[col]).toBe("Holiday duty · WFH");
    expect(row(SAM)[col]).toBe("Holiday");
    expect(rep.rows[rep.rows.length - 1].slice(3, 4)).toEqual(["Total on holiday duty"]);
    expect(row(ANA)[0]).toBe(d.nodes.find((n) => n.type === "dept")!.name);
    expect(rep.rows[rep.rows.length - 1][col]).toBe(1);
  });
});

describe("update schedules for several members", async () => {
  const { authorizeCal } = await import("./authz");
  const base = { type: "setSchedule" as const, bid: "rm", from: "2026-10-05", to: "2026-10-11" };
  it("sets shift and weekday status for a week, keeping holidays and other days", () => {
    const d = fresh();
    d.holidays = d.holidays.concat({ id: "HT", date: "2026-10-07", name: "Test Day", type: "regular", scope: "all" });
    const other = d.people.find((p) => p.id !== ANA && p.assign.some((a) => new Cal(d, TODAY).O.anc(a).includes("rm")))!.id;
    const shift = d.shifts.find((x) => x.id !== d.people[ANA].shift)!.id;
    const r = run(d, { ...base, pids: [ANA, other], shift, days: { 1: "WFH", 5: "RD", 6: "RTO" } });
    expect(r.error).toBeUndefined();
    const c = new Cal(r.data, TODAY);
    for (const pid of [ANA, other]) {
      const p = c.person(pid);
      expect(c.raw(p, "2026-10-05", "rm").code).toBe("WFH"); // Mon
      expect(c.raw(p, "2026-10-09", "rm").code).toBe("RD"); // Fri
      expect(c.raw(p, "2026-10-10", "rm").code).toBe("RTO"); // Sat: working weekend
      expect(c.raw(p, "2026-10-07", "rm").code).toBe("HOL"); // holiday kept
      expect(c.shiftFor(p, "2026-10-06")).toBe(shift);
      expect(c.shiftFor(p, "2026-10-12")).toBe(p.shift); // outside the week
    }
    expect(r.message).toContain("2 members");
    const back = run(r.data, { ...base, pids: [ANA], shift: null, days: { 1: "" } });
    const c2 = new Cal(back.data, TODAY);
    expect(c2.raw(c2.person(ANA), "2026-10-05", "rm").code).toBe("RTO"); // usual pattern
  });
  it("covers a whole month and needs something to change", () => {
    const r = run(fresh(), { ...base, from: "2026-11-01", to: "2026-11-30", pids: [ANA], shift: null, days: { 2: "WFH" } });
    const c = new Cal(r.data, TODAY);
    expect(["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"].map((x) => c.raw(c.person(ANA), x, "rm").code)).toEqual(["WFH", "WFH", "WFH", "WFH"]);
    expect(run(fresh(), { ...base, pids: [ANA], shift: null, days: {} }).error).toBeTruthy();
  });
  it("only admins, only for people they manage", () => {
    const c = new Cal(fresh(), TODAY);
    expect("error" in authorizeCal({ ...base, pids: [ANA], shift: null, days: { 1: "RTO" } }, c, ANA)).toBe(true);
    expect("action" in authorizeCal({ ...base, pids: [ANA], shift: null, days: { 1: "RTO" } }, c, SAM)).toBe(true);
  });
  it("saves the team's planning period", () => {
    const r = run(fresh(), { type: "teamSettings", id: "rm", patch: { schedPeriod: "month" } });
    expect(r.data.nodes.find((n) => n.id === "rm")!.schedPeriod).toBe("month");
  });
});

describe("BCP events are active on their date only", () => {
  const start = (date: string) => run(fresh(), { type: "startEvent", name: "Flood", start: date, scope: "bss", note: "" });
  it("scheduled before, active on, closed after the date", () => {
    const e = { start: "2026-09-24", status: "active" as const };
    expect(evState(e, "2026-09-23")).toBe("scheduled");
    expect(evState(e, "2026-09-24")).toBe("active");
    expect(evState(e, "2026-09-25")).toBe("closed");
    expect(evState({ ...e, status: "closed" }, "2026-09-24")).toBe("closed");
  });
  it("takes check-ins only on the active date", () => {
    const later = start("2026-09-30");
    expect(later.message).toContain("set for");
    const ev = later.data.bcpEvents[0];
    const ci = { type: "checkin" as const, evId: ev.id, pid: ANA, status: "wfh" as const, note: "", actor: ANA };
    expect(run(later.data, ci).data).toBe(later.data); // not yet
    const today = start(TODAY);
    const r = run(today.data, { ...ci, evId: today.data.bcpEvents[0].id });
    expect(r.data.checkins[today.data.bcpEvents[0].id][ANA]).toBeTruthy();
    expect(start("2026-09-20").error).toBeTruthy(); // past date
  });
});

describe("headcount keeps each month with the team the person was in", async () => {
  const { teamHeadcount } = await import("./headcount");
  const { hcTeamOf } = await import("./org");
  // Someone only in Rate Management, hired before this year, who moves to Customer Service.
  const pick = (d: CalendarData) => {
    const c = new Cal(d, TODAY);
    return d.people.find((p) => c.O.branchesOf(p).length === 1 && c.O.branchesOf(p)[0].id === "rm" && p.hire < "2026-01-01" && !p.resign && p.level === "member")!;
  };
  const move = (d: CalendarData, pid: number, hcFrom?: string) => {
    const p = d.people.find((x) => x.id === pid)!;
    return run(d, { type: "saveMember", pid, level: p.level, shift: p.shift, adminHere: false, bid: "cs", assign: ["cs"], isNew: false, hcFrom });
  };
  const row = (d: CalendarData, team: string, pid: number) =>
    teamHeadcount(new Cal(d, TODAY), d.nodes.find((n) => n.id === team)!, 2026).rows.find((r) => r.pid === pid);

  it("a move from April keeps January–March in the old team", () => {
    const d0 = fresh();
    const p = pick(d0);
    const r = move(d0, p.id, "2026-04");
    expect(r.error).toBeUndefined();
    const moved = r.data.people.find((x) => x.id === p.id)!;
    expect(moved.hcHistory).toEqual([expect.objectContaining({ from: "0000-00", team: "rm" }), { from: "2026-04", team: "cs" }]);
    const O = new Cal(r.data, TODAY).O;
    expect([hcTeamOf(O, moved, "2026-03"), hcTeamOf(O, moved, "2026-04"), hcTeamOf(O, moved, "2026-12")]).toEqual(["rm", "cs", "cs"]);
    const rm = row(r.data, "rm", p.id)!;
    const cs = row(r.data, "cs", p.id)!;
    expect(rm.months.map((m) => m.actual)).toEqual([1, 1, 1, null, null, null, null, null, null, null, null, null]);
    expect(cs.months.map((m) => m.actual)).toEqual([null, null, null, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(rm.sub).toContain("moved");
    // Moving on again later keeps both earlier periods.
    const again = run(r.data, { type: "saveMember", pid: p.id, level: p.level, shift: p.shift, adminHere: false, bid: "rm", assign: ["rm"], isNew: false, hcFrom: "2026-10" });
    const h = again.data.people.find((x) => x.id === p.id)!.hcHistory!;
    expect(h.map((x) => `${x.from}:${x.team}`)).toEqual(["0000-00:rm", "2026-04:cs", "2026-10:rm"]);
  });

  it("without an effective month the change counts from this month; unrelated edits add nothing", () => {
    const d0 = fresh();
    const p = pick(d0);
    const r = move(d0, p.id);
    expect(r.data.people.find((x) => x.id === p.id)!.hcHistory!.at(-1)).toEqual({ from: TODAY.slice(0, 7), team: "cs" });
    const same = run(d0, { type: "saveMember", pid: p.id, level: p.level, shift: p.shift, adminHere: false, bid: "rm", assign: p.assign, isNew: false });
    expect(same.data.people.find((x) => x.id === p.id)!.hcHistory).toBeUndefined();
  });

  it("admins correct the tagging; bad months and teams are dropped", () => {
    const d0 = fresh();
    const p = pick(d0);
    const r = run(d0, {
      type: "setHcHistory",
      pid: p.id,
      history: [{ from: "2026-02", team: "rm" }, { from: "2026-06", team: "cs" }, { from: "2026-13", team: "cs" }, { from: "2026-08", team: "nope" }],
    });
    expect(r.data.people.find((x) => x.id === p.id)!.hcHistory).toEqual([{ from: "0000-00", team: "rm" }, { from: "2026-06", team: "cs" }]);
    expect(row(r.data, "rm", p.id)!.months.filter((m) => m.actual === 1).length).toBe(5);
  });
});

describe("roles", async () => {
  const { teamHeadcount, headcount, byRoles } = await import("./headcount");
  const { isLeader, LEVELS } = await import("./constants");
  it("has Associate to Director, and only team leads and above lead", () => {
    expect(Object.values(LEVELS)).toEqual(["Associate", "Specialist", "Sr. Specialist", "Team lead", "Manager", "Director"]);
    expect((["member", "specialist", "senior", "lead", "manager", "director"] as const).map(isLeader)).toEqual([false, false, false, true, true, true]);
  });
  it("reads roles from uploads, including the old names", () => {
    const d = fresh();
    const row = (Role: string) => ({ Name: "New Person", Email: `np.${Role.length}@example.com`, Role, Department: "BSS", Tower: "A&S Support - Rate Management", Team: "Rate Management" });
    const chk = checkUpload(new Cal(d, TODAY), "members", [row("Sr. Specialist"), row("Specialist"), row("Member"), row("Associate"), row("Boss")], "rm");
    expect(chk.map((x) => x.stText)).toEqual(["New", "New", "New", "New", "Error"]);
  });
  it("bills specialists like associates, and filters the headcount by role", () => {
    const d = fresh();
    d.people = d.people.map((p) => (p.id === ANA ? { ...p, level: "senior" } : p));
    const c = new Cal(d, TODAY);
    const ana = teamHeadcount(c, c.O.by.rm, 2026).rows.find((r) => r.pid === ANA)!;
    expect(ana.lead).toBe(false);
    expect(ana.months[0].billed).toBe(1);
    const only = byRoles(headcount(c, 2026, () => true), ["senior"]);
    const rows = only.flatMap((t) => t.teams.flatMap((tm) => tm.rows));
    expect(rows.every((r) => r.level === "senior")).toBe(true);
    expect(rows.some((r) => r.pid === ANA)).toBe(true);
    const rm = only.flatMap((t) => t.teams).find((tm) => tm.id === "rm")!;
    expect(rm.withTl[0].actual).toBe(rm.rows.filter((r) => r.months[0].actual).length);
  });
});

describe("rest day overtime", async () => {
  const { peopleFromCalendar } = await import("../workload/people");
  const SAT = "2026-09-26";
  it("tags a member's unscheduled weekend RDOT, not a weekday or a scheduled weekend", () => {
    const r = run(fresh(), { type: "restDayWork", pid: ANA, date: SAT, actor: ANA });
    expect(r.data.overrides[`${ANA}|${SAT}`]).toBe("RDOT");
    expect(new Cal(r.data, TODAY).raw(r.data.people.find((p) => p.id === ANA)!, SAT, null).code).toBe("RDOT");
    expect(run(fresh(), { type: "restDayWork", pid: ANA, date: "2026-09-25", actor: ANA }).data.overrides[`${ANA}|2026-09-25`]).toBeUndefined();
    const sched = { ...fresh(), overrides: { [`${ANA}|${SAT}`]: "RTO" as const } };
    expect(run(sched, { type: "restDayWork", pid: ANA, date: SAT, actor: ANA }).data.overrides[`${ANA}|${SAT}`]).toBe("RTO");
  });
  it("Workload treats an unscheduled weekend as a rest day they can work, and RDOT / RTO weekends accordingly", () => {
    const at = Date.parse(`${SAT}T10:00:00+08:00`);
    const d = fresh();
    const ana = () => peopleFromCalendar(new Cal(d, SAT), at, "rm").find((p) => p.id === ANA)!;
    expect(ana()).toMatchObject({ otDay: "restday", onToday: true, rdTag: true });
    d.overrides[`${ANA}|${SAT}`] = "RDOT";
    expect(ana()).toMatchObject({ otDay: "restday", onToday: true });
    expect(ana().rdTag).toBeUndefined();
    d.overrides[`${ANA}|${SAT}`] = "RTO"; // a regular weekend shift
    expect(ana().otDay).toBeUndefined();
  });
});

describe("attendance summary, reports, payroll and approvers", async () => {
  const { attendanceSummary, leadSummary, summaryText } = await import("./summary");
  const { nextCutoff, daysBetween } = await import("./dates");
  it("summarises a day per team and system", () => {
    const c = new Cal(fresh(), TODAY);
    const b = attendanceSummary(c, "rm", TODAY);
    expect(b[0]).toMatchObject({ name: "Rate Management", level: "team", detail: false });
    expect(b.slice(1).every((x) => x.level === "system")).toBe(true);
    const sys = b.slice(1);
    expect(sys.reduce((a, x) => a + x.headcount, 0)).toBeGreaterThan(0);
    const t = summaryText(b);
    expect(t.split("\n")[0]).toMatch(/^Rate Management \d+\/\d+$/);
    expect(t).toMatch(/\nRTO - \d+/);
  });
  it("counts people allocated to several teams or systems once", () => {
    const d = fresh();
    const p1 = d.people.find((p) => p.id === 1)!;
    p1.assign = ["inas", "lcl"]; // GPM and RCM
    const c = new Cal(d, TODAY);
    const all = attendanceSummary(c, "bss", TODAY);
    const teams = all.filter((b) => b.level === "team");
    const alive = d.people.filter((p) => c.alive(p, TODAY) && (!p.hire || p.hire <= TODAY) && c.O.branchesOf(p).length);
    // Ana is in Rate Management and Customer Service: counted once overall.
    expect(teams.reduce((a, b) => a + b.headcount, 0)).toBe(alive.length);
    const rm = attendanceSummary(c, "rm", TODAY);
    expect(rm.slice(1).reduce((a, b) => a + b.headcount, 0)).toBe(rm[0].headcount);
  });
  it("summarises a day per team lead's scope", () => {
    const d = fresh();
    const c = new Cal(d, TODAY);
    const b = leadSummary(c, "rm", TODAY);
    const names = b.map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(["GPM", "EU", "RCM"]));
    // Each member counts once, plus each block's own lead; managers and directors aside.
    const team = attendanceSummary(c, "rm", TODAY)[0];
    const above = d.people.filter((p) => ["manager", "director"].includes(p.level) && c.O.inN(p, "rm") && c.alive(p, TODAY));
    expect(b.reduce((a, x) => a + x.headcount, 0)).toBe(team.headcount - above.length);
    // The lead's own status line is marked; present counts only working codes.
    for (const x of b.filter((x) => x.lead)) expect(x.lines.reduce((a, l) => a + l.tl, 0)).toBe(1);
    for (const x of b) expect(x.present).toBe(x.lines.filter((l) => ["RTO", "WFH", "HDY", "RDOT"].includes(l.code)).reduce((a, l) => a + l.n, 0));
    expect(summaryText(b, " - ")).toMatch(/ incl TL/);
    expect(summaryText(b, " - ").split("\n")[0]).toMatch(/ - \d+\/\d+$/);
    // An assigned approver who is a lead wins over allocation.
    const ana = d.people.find((p) => p.id === 0)!;
    ana.approver = 21;
    // A lead on leave: deducted from present, still listed with "incl TL".
    d.overrides[`21|${TODAY}`] = "VL";
    const b2 = leadSummary(new Cal(d, TODAY), "rm", TODAY);
    // Several leads equally near (both allocated to the team): no guess, "No lead".
    const l2 = d.people.find((p) => p.id === 14)!;
    const savedL2 = l2.assign;
    l2.assign = ["rm"];
    const p66 = d.people.find((p) => p.id === 15)!;
    p66.approver = undefined;
    p66.assign = ["rcm"];
    d.people.find((p) => p.id === 24)!.assign = ["rm"];
    const tie = leadSummary(new Cal(d, TODAY), "rm", TODAY);
    expect(tie.find((x) => x.lead && x.lead === l2.name)?.headcount ?? 0).toBeLessThan(b.reduce((a, x) => a + x.headcount, 0));
    expect(tie.find((x) => x.name === "No lead")!.headcount).toBeGreaterThan(0);
    l2.assign = savedL2;
    d.people.find((p) => p.id === 24)!.assign = ["gpm"];
    const eu = b2.find((x) => x.name === "EU")!;
    expect(eu.headcount).toBe(b.find((x) => x.name === "EU")!.headcount + 1);
    expect(eu.lines.find((l) => l.code === "VL")).toMatchObject({ tl: 1 });
    expect(summaryText([eu], " - ")).toMatch(/\nVL - \d+ incl TL/);
    expect(eu.present).toBeLessThan(eu.headcount);
  });
  it("has count tiles for every report, and the schedule and summary reports", () => {
    const c = new Cal(fresh(), TODAY);
    for (const [type] of REPORT_TYPES) expect(buildReport(c, type, "bss", "2026-09-01", "2026-09-30").tiles.length).toBeGreaterThan(0);
    const sch = buildReport(c, "schedule", "rm", "2026-09-21", "2026-09-27");
    expect(sch.rows[0].slice(-7)).toHaveLength(7);
    expect(sch.rows.slice(1).some((r) => String(r[6]).startsWith("RTO · ") || String(r[6]).startsWith("WFH · "))).toBe(true);
    const sum = buildReport(c, "summary", "rm", TODAY, TODAY);
    expect(sum.rows[1][2]).toBe("Rate Management");
  });
  it("finds the next payroll cut-off from the dates set", () => {
    const dates = ["2026-10-27", "2026-09-15", "2026-09-30", "2026-10-13"];
    expect(nextCutoff("2026-09-24", dates)).toBe("2026-09-30");
    expect(nextCutoff("2026-10-01", dates)).toBe("2026-10-13");
    expect(nextCutoff("2026-10-28", dates)).toBeNull();
    expect(nextCutoff("2026-09-24", undefined)).toBeNull();
    expect(daysBetween("2026-09-28", "2026-09-30")).toBe(2);
  });
  it("records who decided a request", () => {
    const d = fresh();
    const q = d.requests.find((x) => x.approvals.rm === "pending");
    if (!q) return;
    const r = run(d, { type: "decide", rid: q.id, bid: "rm", st: "approved", actor: SAM });
    expect(r.data.requests.find((x) => x.id === q.id)!.decided?.rm?.by).toBe(SAM);
  });
});

describe("approvals by leaders", async () => {
  const { canDecide, approverOf, leadersOf } = await import("./approvals");
  const { authorizeCal } = await import("./authz");
  const form = { type: "VL" as const, start: "2026-10-12", end: "2026-10-12", half: "AM" as const, reason: "" };
  it("team leads and above don't need approval; members follow the team's setting", () => {
    const lead = run(fresh(), { type: "submitRequest", pid: 24, form, adminBid: null, actor: 24 }).data.requests[0];
    expect(Object.values(lead.approvals).every((x) => x === "approved")).toBe(true); // a team lead in an approval team
    const mem = run(fresh(), { type: "submitRequest", pid: ANA, form, adminBid: null, actor: ANA }).data.requests[0];
    expect(mem.approvals).toEqual({ rm: "pending" });
  });
  it("the assigned approver and the team's other leaders can decide; nobody decides their own", () => {
    const d = fresh();
    d.people = d.people.map((p) => (p.id === ANA ? { ...p, approver: 24 } : p));
    const r = run(d, { type: "submitRequest", pid: ANA, form, adminBid: null, actor: ANA }).data;
    const c = new Cal(r, TODAY);
    const q = r.requests[0];
    expect(approverOf(c, ANA)?.id).toBe(24);
    expect(leadersOf(c, "rm").map((p) => p.id)).toEqual(expect.arrayContaining([24, 14, 23]));
    expect(canDecide(c, 24, q, "rm")).toBe(true); // assigned approver (not an admin)
    expect(canDecide(c, 14, q, "rm")).toBe(true); // another team lead
    expect(canDecide(c, 8, q, "rm")).toBe(false); // an associate
    expect(canDecide(c, ANA, q, "rm")).toBe(false);
    expect("error" in authorizeCal({ type: "decide", rid: q.id, bid: "rm", st: "approved", actor: 24 }, c, 24)).toBe(false);
    expect("error" in authorizeCal({ type: "decide", rid: q.id, bid: "rm", st: "approved", actor: 8 }, c, 8)).toBe(true);
    // Saving a member: the approver must be a leader, not themselves.
    const bad = run(r, { type: "saveMember", pid: ANA, level: "member", shift: "D", adminHere: false, bid: "rm", assign: ["lcl", "cs"], isNew: false, details: { approver: 8 } });
    expect(bad.error).toMatch(/approver must be/);
  });
});

describe("update several members at once", async () => {
  const { authorizeCal } = await import("./authz");
  it("changes only the fields given, skips roles that don't fit, and needs admin rights over everyone", () => {
    const d = fresh();
    const r = run(d, { type: "bulkMembers", pids: [ANA, 8, 15], approver: 24, shift: "N", wfhDays: [3] });
    const got = (id: number) => r.data.people.find((p) => p.id === id)!;
    expect([ANA, 8, 15].map((id) => [got(id).approver, got(id).shift, got(id).wfhDays])).toEqual([[24, "N", [3]], [24, "N", [3]], [24, "N", [3]]]);
    expect(got(ANA).level).toBe(d.people.find((p) => p.id === ANA)!.level); // role kept
    const lv = run(d, { type: "bulkMembers", pids: [ANA, 8], level: "specialist" });
    expect([ANA, 8].map((id) => lv.data.people.find((p) => p.id === id)!.level)).toEqual(["specialist", "specialist"]);
    expect(lv.message).toBe("2 members updated.");
    expect(run(d, { type: "bulkMembers", pids: [ANA], approver: 8 }).error).toMatch(/team lead/);
    const c = new Cal(d, TODAY);
    expect("error" in authorizeCal({ type: "bulkMembers", pids: [15, 27] }, c, SAM)).toBe(true); // 27 is in another tower
    expect("error" in authorizeCal({ type: "bulkMembers", pids: [15, 16] }, c, SAM)).toBe(false);
  });
});
