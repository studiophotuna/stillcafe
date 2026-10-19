/**
 * Sample Workload data for every team of the sample Calendar (demo / sample mode only):
 * the Rate Desk keeps its detailed sample; the other teams get their people, systems and
 * trades from the Calendar sample and a day of sample tickets.
 */
import { Cal } from "../calendar/engine";
import { initialCalendar } from "../calendar/seed";
import { H, M, dayKey } from "./clock";
import { DEMO_CARRIERS } from "./constants";
import { billedFor, holidaysFor, orgFor, peopleFromCalendar, workloadAdmins, workloadApprovers, workloadPricers } from "./people";
import { initialData } from "./seed";
import type { WorkloadData } from "./engine";
import type { Person, Priority, Task } from "./types";

/** Kinds of request per sample team (titles of the sample tickets). */
const KINDS: Record<string, string[]> = {
  cs: ["Shipment status request", "Customer enquiry", "Complaint follow-up", "Document request"],
  bk: ["New booking", "Booking amendment", "Booking cancellation", "Space request"],
  imp: ["Arrival notice", "Import declaration", "Delivery order", "Duty payment check"],
  exp: ["Export booking", "Shipping instructions", "Bill of lading draft", "VGM submission"],
  sales: ["Quotation request", "Account review", "Rate validity check", "Contract renewal"],
  doc: ["Customs entry", "HS code review", "Permit application", "Certificate of origin"],
};

const sampleCal = (now: number) => {
  const today = dayKey(now);
  return new Cal(initialCalendar(today), today);
};

/** The sample teams, as listed in the Workload team picker. */
export function demoTeams(now: number) {
  const c = sampleCal(now);
  return { c, teams: c.d.nodes.filter((n) => n.type === "branch") };
}

/** Sample tickets for a team: waiting, in progress, assigned, pending and done today. */
function teamTasks(team: string, now: number, units: string[], people: Person[], seed: number): Task[] {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const kinds = KINDS[team] ?? ["Request"];
  const prefix = team.slice(0, 3).toUpperCase();
  const workers = people.filter((p) => p.trades.length);
  const tasks: Task[] = [];
  let n = 100;
  const mk = (o: Partial<Task> & { by?: Person }): Task => {
    const trade = o.trade ?? (o.by ? pick(o.by.trades) : pick(units));
    const pr: Priority = o.pr ?? (r() < 0.2 ? "high" : r() < 0.8 ? "normal" : "low");
    const rec = o.received ?? now - Math.floor(r() * 26 * H);
    const car = pick(DEMO_CARRIERS);
    const kind = pick(kinds);
    const status = o.status ?? "new";
    const id = `${prefix}-${n++}`;
    const t: Task = {
      id,
      title: `${kind} – ${car}`,
      trade,
      pr,
      received: rec,
      source: r() < 0.6 ? "outlook" : "upload",
      status,
      assignee: o.by?.id ?? null,
      startedAt: o.startedAt ?? null,
      doneAt: o.doneAt ?? null,
      ot: false,
      hold: o.hold ?? "",
      fields: { ticket: `${prefix}-${30000 + n}`, carrier: car, contract: "", contracts: status === "done" ? 1 + Math.floor(r() * 5) : "", amendments: "", remarks: "" },
      email: null,
      history: [{ at: rec, text: "Received" }],
    };
    if (o.by) t.history.push({ at: t.startedAt ?? rec + 20 * M, text: (status === "assigned" ? "Assigned to " : "Started by ") + o.by.name });
    if (status === "on_hold") t.history.push({ at: rec + 2 * H, text: "On hold: " + t.hold });
    if (status === "done") t.history.push({ at: t.doneAt!, text: "Done" });
    tasks.push(t);
    return t;
  };
  for (let i = 0; i < 12; i++) mk({});
  workers.slice(0, 3).forEach((p, i) => mk({ by: p, status: "in_progress", startedAt: now - (12 + i * 10) * M, received: now - (2 + i) * H }));
  workers.slice(3, 4).forEach((p) => mk({ by: p, status: "assigned", received: now - 4 * H }));
  workers.slice(1, 2).forEach((p) => mk({ by: p, status: "on_hold", hold: "Waiting for the customer’s documents", startedAt: now - 5 * H, received: now - 7 * H }));
  workers.forEach((p, i) => {
    for (let k = 0; k < 2; k++) {
      const st = now - (4 - k * 1.5) * H - i * 9 * M;
      mk({ by: p, status: "done", startedAt: st, doneAt: st + (25 + Math.floor(r() * 50)) * M, received: st - 2 * H });
    }
  });
  return tasks;
}

/** A sample team's Workload data; the Rate Desk keeps its detailed sample. */
export function demoTeamData(team: string, now: number): WorkloadData {
  const { c, teams } = demoTeams(now);
  const list = teams.map((b) => ({ id: b.id, name: b.name, tower: c.O.up(b.id, "tower")?.name ?? "" }));
  if (team === "rm" || !c.O.by[team]) {
    const d = initialData(now);
    return { ...d, org: { ...d.org, teams: list } };
  }
  const org = orgFor(c, team, teams);
  const people = peopleFromCalendar(c, now, team);
  const base = initialData(now, true);
  const units = org.trades.map((t) => t.id);
  return {
    ...base,
    org,
    people,
    admins: workloadAdmins(c, team),
    approvers: workloadApprovers(c, team),
    holidays: holidaysFor(c, team),
    hc: billedFor(c, team),
    pricers: workloadPricers(c, team),
    tasks: teamTasks(team, now, units, people, 7 + team.length * 13),
    settings: {
      ...base.settings,
      mailbox: `${team}.requests@demobss.com`,
      targets: Object.fromEntries(units.map((u) => [u, 8])),
      uploaders: people.filter((p) => !workloadAdmins(c, team).includes(p.id)).slice(0, 1).map((p) => p.id),
    },
    seq: 3000,
  };
}
