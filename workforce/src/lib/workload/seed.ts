import { H, M } from "./clock";
import { CARRIERS, DEMO_ORG, FIELDS0, PEOPLE, person, tradeOf } from "./constants";
import type { WorkloadData } from "./engine";
import type { Priority, Task, TaskStatus } from "./types";

const KINDS = ["Rate filing", "Contract amendment", "New contract upload", "Surcharge update", "Rate sheet review"];
const SENDERS = [
  "pricing.eu@dsv.com",
  "sales.lcl@dsv.com",
  "tlm.fewb@dsv.com",
  "procurement.asla@dsv.com",
  "pricing.us@dsv.com",
  "kam.inas@dsv.com",
];

interface Opts {
  trade?: string;
  pr?: Priority;
  rec?: number;
  status?: TaskStatus;
  assignee?: number;
  startedAt?: number;
  doneAt?: number;
  ot?: boolean;
  hold?: string;
}

/**
 * Deterministic sample tasks for Rate Management, relative to `now`.
 * Mirrors the design prototype's seed so the screens match it.
 */
export function seedTasks(now: number): Task[] {
  let s = 9;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const tasks: Task[] = [];
  let n = 1040;

  const mk = (o: Opts): Task => {
    const tr = o.trade !== undefined ? o.trade : pick(DEMO_ORG.trades).id;
    const car = pick(CARRIERS);
    const kind = pick(KINDS);
    const pr: Priority = o.pr || (r() < 0.2 ? "high" : r() < 0.8 ? "normal" : "low");
    const rec = o.rec || now - Math.floor(r() * 30 * H);
    const src = r() < 0.65 ? "outlook" : "upload";
    const status = o.status || "new";
    const trName = tr ? " " + tradeOf(DEMO_ORG, tr)!.name : "";
    const id = "T-" + n++;
    const ticket = "RM-" + (20400 + n);
    const contract = r() < 0.6 ? car + "-" + (1000 + Math.floor(r() * 8999)) : "";
    const contracts = status === "done" ? 1 + Math.floor(r() * 8) : "";
    const amendments = status === "done" ? Math.floor(r() * 12) : "";
    const t: Task = {
      id,
      title: kind + " – " + car + trName,
      trade: tr,
      pr,
      received: rec,
      source: src,
      status,
      assignee: o.assignee ?? null,
      startedAt: o.startedAt || null,
      doneAt: o.doneAt || null,
      ot: !!o.ot,
      otMin: o.ot ? 30 + ((n * 7) % 4) * 15 : 0,
      hold: o.hold || "",
      fields: { ticket, carrier: car, contract, contracts, amendments, remarks: "" },
      email: null,
      history: [{ at: rec, text: src === "outlook" ? "Received from Outlook" : "Imported from upload" }],
    };
    if (src === "outlook") {
      const from = pick(SENDERS);
      const attachments = [car + "_rates.xlsx"].concat(r() < 0.4 ? ["contract_" + car + ".pdf"] : []);
      t.email = {
        from,
        cc: "rm.team@dsv.com",
        subject: (pr === "high" ? "URGENT: " : "") + kind + " – " + car + trName,
        body: `Hi team,\n\nPlease process the attached ${kind.toLowerCase()} for ${car}. Effective date is next Monday.\n\nThank you.`,
        attachments,
      };
    }
    if (t.assignee !== null)
      t.history.push({
        at: t.startedAt || rec + 20 * M,
        text: (status === "assigned" ? "Assigned to " : "Started by ") + person(t.assignee)!.name,
      });
    if (status === "on_hold") t.history.push({ at: rec + 2 * H, text: "On hold: " + t.hold });
    if (status === "done") t.history.push({ at: t.doneAt!, text: "Done" + (t.ot ? ` (overtime ${t.otMin} min)` : "") });
    tasks.push(t);
    return t;
  };

  for (let i = 0; i < 20; i++) mk({});
  mk({ trade: "", pr: "normal", rec: now - 40 * M });
  (
    [
      [1, "inas"],
      [3, "eu"],
      [5, "fewb"],
      [9, "fewb"],
      [15, "lcl"],
      [25, "us"],
    ] as const
  ).forEach(([p, tr], i) =>
    mk({ trade: tr, status: "in_progress", assignee: p, startedAt: now - (15 + i * 9) * M, rec: now - (3 + i) * H }),
  );
  (
    [
      [16, "lcl"],
      [30, "asla"],
    ] as const
  ).forEach(([p, tr]) => mk({ trade: tr, status: "assigned", assignee: p, rec: now - 5 * H }));
  (
    [
      [2, "inas", "Waiting for rate sheet from carrier"],
      [11, "fewb", "Clarifying effective date with sales"],
    ] as const
  ).forEach(([p, tr, hold]) =>
    mk({ trade: tr, status: "on_hold", assignee: p, hold, startedAt: now - 6 * H, rec: now - 9 * H }),
  );
  const doneBy = [
    [1, "inas"],
    [3, "eu"],
    [5, "fewb"],
    [5, "fewb"],
    [9, "fewb"],
    [15, "lcl"],
    [16, "lcl"],
    [25, "us"],
    [29, "asla"],
    [30, "asla"],
    [14, "us"],
    [6, "eu"],
    [0, "lcl"],
  ] as const;
  doneBy.forEach(([p, tr], i) => {
    const st = now - 4 * H + i * 14 * M - Math.floor(r() * 20) * M;
    const d = 25 + Math.floor(r() * 65);
    mk({ trade: tr, status: "done", assignee: p, startedAt: st, doneAt: st + d * M, ot: i === 2 || i === 7, rec: st - 2 * H });
  });
  const ot1 = mk({ trade: "fewb", status: "done", assignee: 9, startedAt: now - 4.2 * H, doneAt: now - 3.4 * H, ot: true, rec: now - 6 * H });
  return tasks;
}

/** Sample emails used by "Check mailbox now" until Microsoft Graph intake is connected. */
export const SAMPLE_MAIL: [string, string, string, string[]][] = [
  ["sales.lcl@dsv.com", "LCL rate request – CMDU Manila to Singapore", "Hi team,\n\nCustomer needs LCL rates for next week. Details attached.", ["CMDU_LCL_request.xlsx"]],
  ["pricing.eu@dsv.com", "URGENT: EU surcharge update – HLCU", "Please update the ENS surcharge for HLCU effective 1 October.", ["HLCU_surcharge.pdf"]],
  ["kam.inas@dsv.com", "Contract amendment – ONEY INAS", "Amendment 3 for the ONEY contract is attached.", ["ONEY_amd3.pdf"]],
  ["ops@dsv.com", "Question about last week’s filing", "Could someone confirm the filing reference?", []],
];

/**
 * A team's starting data: default settings and fields. Sample data (not `empty`)
 * adds the sample tasks, people and org; a real team gets those from the Calendar.
 */
export function initialData(now: number, empty = false): WorkloadData {
  return {
    tasks: empty ? [] : seedTasks(now),
    people: empty ? [] : PEOPLE,
    admins: empty ? [] : [23],
    org: DEMO_ORG,
    activities: [],
    approvers: empty ? [] : [23],
    fields: FIELDS0.map((f) => ({ ...f })),
    settings: {
      mode: "fifo",
      order: "priority",
      skipUnavail: true,
      autoFeed: true,
      sla: { high: 4, normal: 24, low: 72 },
      mailbox: empty ? "" : "rm.requests@dsv.com",
      mailTrade: "",
      work: { shift: 9, b1: 60, b2: 30, prod: 6.8 },
      targets: empty ? {} : { fewb: 8, inas: 6, eu: 7, us: 6, asla: 6, lcl: 8 },
      memberTargets: {},
    },
    seq: 2000,
    mailCount: 0,
  };
}
