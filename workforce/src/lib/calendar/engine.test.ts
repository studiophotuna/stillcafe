import { describe, expect, it } from "vitest";
import { applyCalAction } from "./actions";
import { Cal } from "./engine";
import { buildReport, toCsv } from "./reports";
import { initialCalendar } from "./seed";
import { checkUpload } from "./uploads";
import type { CalendarData } from "./types";

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
    expect(d.bcpEvents.find((e) => e.status === "active")?.id).toBe("E2");
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
  it("routes per team: auto-approve vs admin approval, with notifications", () => {
    const d = fresh();
    const o = run(d, { type: "submitRequest", pid: ANA, form: { type: "VL", start: "2026-10-12", end: "2026-10-13", half: "AM", reason: "" }, adminBid: null, actor: ANA });
    const q = o.data.requests[0];
    expect(q.approvals).toEqual({ rm: "pending", cs: "approved" });
    expect(o.message).toBe("Request sent. The Rate Management admin will get an email to approve it.");
    const newLogs = o.data.logs.slice(0, o.data.logs.length - d.logs.length);
    expect(newLogs.map((l) => l.subject)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Approval needed: Ana Reyes/), expect.stringMatching(/^Your vacation leave was approved · Customer Service/)]),
    );
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
    expect(o.data.requests[0].approvals).toEqual({ rm: "approved", cs: "approved" }); // cs is auto
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
      "Give a Code (RTO, WFH, RD, VL, SL, EL, HD, BT, HDY) or a Shift",
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
    expect("action" in authorizeCal({ type: "decide", rid: "x", bid: "rm", st: "approved", actor: ANA }, c, ANA)).toBe(true);
  });
  it("lets a department or tower lose its last admin, not a team", () => {
    let d = run(fresh(), { type: "addAdmin", id: "bss", pid: SAM }).data;
    d = run(d, { type: "removeAdmin", id: "bss", pid: SAM }).data;
    expect(d.nodes.find((n) => n.id === "bss")!.admins).toEqual([]);
    const only = fresh().nodes.find((n) => n.id === "rm")!.admins!;
    if (only.length === 1) expect(run(fresh(), { type: "removeAdmin", id: "rm", pid: only[0] }).data.nodes.find((n) => n.id === "rm")!.admins).toEqual(only);
  });
});
