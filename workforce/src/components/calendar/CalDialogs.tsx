"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Dialogs";
import { Blueprint, Icon } from "@/components/ui";
import {
  ANNUAL, APPR_WORD, BCP_ST, BUCKETS, CI_DESC, CODES, HTYPE, LEVELS, OOO, POOL, REQ_TYPES, TYPE_L, first,
} from "@/lib/calendar/constants";
import { fmt, fmtY, MONL, rng2 } from "@/lib/calendar/dates";
import { downloadMembersTemplate, downloadScheduleTemplate, readCalendarUpload } from "@/lib/calendar/excel";
import { useCalendar, type Issued } from "@/lib/calendar/store";
import { ALLOC_MIN, allocNeeds, allocProblem } from "@/lib/calendar/org";
import { parseOrgText, planOrgImport } from "@/lib/calendar/orgImport";
import { checkUpload, type UploadRow } from "@/lib/calendar/uploads";
import { useCalView } from "@/lib/calendar/useCalView";
import { EMAIL_RE } from "@/lib/calendar/actions";
import type { BcpStatus, Bucket, CalPerson, Code, HolidayType, Level } from "@/lib/calendar/types";
import { Chip, Seg } from "./bits";

const PrimaryBtn = ({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) => (
  <Blueprint as="button" className="btn btn-primary btn-40" style={{ padding: "0 18px" }} disabled={disabled} onClick={onClick}>
    {children}
  </Blueprint>
);
const Title = ({ children }: { children: React.ReactNode }) => (
  <div className="dialog-title" style={{ fontSize: 26 }}>
    {children}
  </div>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="banner">{children}</div>
);

// ── Request leave or schedule change ──
function RequestDialog({ date }: { date?: string }) {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  const [f, setF] = useState({ type: "VL" as Code, start: date || s.today, end: date || s.today, half: "AM" as "AM" | "PM", reason: "" });
  const set = (k: keyof typeof f, val: string) =>
    setF((x) => {
      const n = { ...x, [k]: val };
      if (k === "start" && n.end < val) n.end = val;
      return n;
    });
  const close = () => s.setDialog(null);
  const isHalf = f.type === "HD";
  const nReq = isHalf ? (c.workdays(f.start, f.start) ? 0.5 : 0) : c.workdays(f.start, f.end);
  const meP = v.meP;
  const remaining = c.poolOf(meP) - c.usedOf(meP);
  const elLeft = (meP.elEnt ?? 5) - c.elUsedOf(meP);
  const left = POOL.includes(f.type) ? remaining - nReq : f.type === "EL" ? elLeft - nReq : null;
  const daysLine =
    nReq === 0
      ? "The dates you picked have no working days. Choose a weekday that isn’t a holiday."
      : `${nReq} working day${nReq === 1 ? "" : "s"}` +
        (left === null
          ? " · doesn’t use your leave balance"
          : left < 0
            ? ` · this is more than your ${f.type === "EL" ? "emergency leave" : "VL + SL"} balance`
            : ` · ${left}${f.type === "EL" ? " emergency leave" : " VL + SL"} days left after this`);
  const routing = v.myBranches.map((b) => {
    const n = s.data.people.filter((x) => x.id !== s.me && c.O.inN(x, b.id) && !(x.resign && x.resign < s.today)).length;
    const admins = (b.admins ?? []).map((i) => c.people.get(i)?.name).filter(Boolean);
    return {
      id: b.id,
      name: b.name,
      text: b.mode === "auto" ? "Approved automatically" : `Waits for approval from ${admins.join(", ") || "the team admin"}`,
      sub:
        b.mode === "auto"
          ? b.invite && OOO.includes(f.type)
            ? `Outlook reminder goes to ${n} team members`
            : "You’ll get a confirmation email"
          : b.notifyAdmin
            ? "They’ll get an email with Approve and Decline buttons"
            : "",
    };
  });
  return (
    <Modal onClose={close} width={540}>
      <div className="dialog-scroll" style={{ gap: 12, padding: 20 }}>
        <Title>Request leave or schedule change</Title>
        <div className="field">
          <label htmlFor="rq-type">Type</label>
          <select id="rq-type" className="input" value={f.type} onChange={(e) => set("type", e.target.value)}>
            {REQ_TYPES.map((k) => (
              <option key={k} value={k}>
                {CODES[k].label} ({k})
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label htmlFor="rq-start">{isHalf ? "Date" : "First day"}</label>
            <input id="rq-start" className="input" type="date" value={f.start} onChange={(e) => set("start", e.target.value)} />
          </div>
          {isHalf ? (
            <div className="field">
              <label>Which half</label>
              <Seg name="half" full value={f.half} options={[["AM", "Morning"], ["PM", "Afternoon"]]} onChange={(val) => set("half", val)} />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="rq-end">Last day</label>
              <input id="rq-end" className="input" type="date" value={f.end} min={f.start} onChange={(e) => set("end", e.target.value)} />
            </div>
          )}
        </div>
        <Note>{daysLine}</Note>
        <div className="field">
          <label htmlFor="rq-reason">Reason (optional)</label>
          <textarea id="rq-reason" className="input" value={f.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Visible to your team admins" style={{ minHeight: 70 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="small" style={{ fontSize: 12 }}>What happens next</span>
          {routing.length === 0 && (
            <span style={{ fontSize: 13.5 }}>You aren’t in a team, so this is approved automatically.</span>
          )}
          {routing.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5 }}>
              <span className="tag tag-outline" style={{ flex: "none", minWidth: 120, justifyContent: "center" }}>
                {r.name}
              </span>
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span>{r.text}</span>
                <span className="small" style={{ fontSize: 12 }}>{r.sub}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={close}>
            Cancel
          </button>
          <PrimaryBtn
            disabled={nReq === 0}
            onClick={() => {
              s.run({ type: "submitRequest", pid: s.me, form: f, adminBid: null, actor: s.me });
              close();
            }}
          >
            Submit request
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

// ── Member: working on a holiday (holiday duty) or not ──
function HolidayWorkDialog({ date }: { date: string }) {
  const s = useCalendar();
  const c = s.cal;
  const p = c.person(s.me);
  const h = c.holFor(p, date);
  const close = () => s.setDialog(null);
  if (!h) return null;
  const o = s.data.overrides[p.id + "|" + date];
  const cur = o === "WFH" ? "WFH" : o ? "RTO" : null;
  const opts: [("RTO" | "WFH" | null), string, string][] = [
    ["RTO", "Working in office", "Holiday duty, at the office"],
    ["WFH", "Working from home", "Holiday duty, from home"],
    [null, "Not working", "Enjoy the holiday"],
  ];
  return (
    <Modal onClose={close} width={440} pad>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Title>{h.name}</Title>
        <span className="muted">
          {fmtY(date)} · {cur ? "you’re on holiday duty" : "holiday"}
        </span>
      </div>
      <span className="small">Working on this holiday? Update your status so your team and Workload know. Your team admins are told.</span>
      <div style={{ display: "grid", gap: 8 }}>
        {opts.map(([k, l, sub]) => (
          <button
            key={l}
            className="btn btn-secondary"
            aria-pressed={cur === k}
            style={{ justifyContent: "flex-start", minHeight: 48, gap: 10, ...(cur === k ? { borderColor: "var(--color-accent-700)", fontWeight: 600 } : {}) }}
            onClick={() => {
              if (cur !== k) s.run({ type: "holidayWork", pid: p.id, date, code: k, actor: s.me });
              close();
            }}
          >
            <Chip s={CODES[k ? "HDY" : "HOL"]}>{k ? "HDY" : "HOL"}</Chip>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span>{l}</span>
              <span className="small" style={{ fontWeight: 400 }}>{sub}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary btn-40" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

// ── Admin: change one person's day ──
function CellDialog({ pid, date }: { pid: number; date: string }) {
  const s = useCalendar();
  const v = useCalView();
  const c = s.cal;
  const p = c.person(pid);
  const cell = c.raw(p, date, v.bid);
  const close = () => s.setDialog(null);
  const codes: Code[] = (c.holFor(p, date) ? (["HDY"] as Code[]) : []).concat(["RTO", "WFH", "VL", "SL", "EL", "HD", "BT", "RD"]);
  return (
    <Modal onClose={close} width={480} pad>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Title>{p.name}</Title>
        <span className="muted">
          {fmt(date)} {date.slice(0, 4)} · currently {cell.code ? CODES[cell.code].label.toLowerCase() + (cell.pending ? " (pending)" : "") : "weekend"}
        </span>
      </div>
      {cell.req && (
        <div className="banner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13.5 }}>
          <span>
            {CODES[cell.req.type].label} {rng2(cell.req.start, cell.req.end)} · {APPR_WORD[cell.req.approvals[v.bid]]}
          </span>
          <button
            className="btn btn-ghost"
            style={{ color: "var(--color-accent-800)" }}
            onClick={() => {
              s.run({ type: "cancelRequest", rid: cell.req!.id, via: "admin" });
              close();
            }}
          >
            Remove leave
          </button>
        </div>
      )}
      <span className="small" style={{ fontSize: 12 }}>Set this day to</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
        {codes.map((k) => (
          <button
            key={k}
            className="btn btn-secondary"
            style={{ justifyContent: "flex-start", minHeight: 44, gap: 10 }}
            onClick={() => {
              if (ANNUAL.includes(k))
                s.run({
                  type: "submitRequest",
                  pid,
                  form: { type: k, start: date, end: date, half: "AM", reason: "Entered by " + v.meP.name },
                  adminBid: v.bid,
                  actor: s.me,
                });
              else s.run({ type: "setOverride", pid, date, code: k });
              close();
            }}
          >
            <Chip s={CODES[k]}>{k}</Chip>
            {CODES[k].label}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="cell-shift">Shift this day</label>
        <select id="cell-shift" className="input" value={c.shiftFor(p, date)} onChange={(e) => s.run({ type: "setShiftDay", pid, date, shift: e.target.value })}>
          {s.data.shifts.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ({x.start}–{x.end})
            </option>
          ))}
        </select>
      </div>
      <span className="small">
        Leave you enter here is approved for {v.branch.name}. Other teams {first(p.name)} belongs to follow their own approval setting.
      </span>
      <div className="dialog-actions" style={{ justifyContent: "space-between", gap: 10 }}>
        <button
          className="btn btn-ghost"
          onClick={() => {
            s.run({ type: "setOverride", pid, date, code: null });
            close();
          }}
        >
          Reset to usual schedule
        </button>
        <button className="btn btn-secondary btn-40" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

// ── Resignation ──
function ResignDialog({ pid }: { pid: number }) {
  const s = useCalendar();
  const p = s.cal.person(pid);
  const [d, setD] = useState(p.resign || "");
  const close = () => s.setDialog(null);
  let nm = "";
  if (d) {
    const [y, m] = d.split("-").map(Number);
    nm = `${MONL[m % 12]} ${m === 12 ? y + 1 : y}`;
  }
  return (
    <Modal onClose={close} pad>
      <Title>Resignation · {p.name}</Title>
      <div className="field">
        <label htmlFor="res-date">Last working day</label>
        <input id="res-date" className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} />
      </div>
      <Note>
        {d
          ? `${first(p.name)} stays on the calendar until ${fmtY(d)} and won’t appear from ${nm} onwards, on every calendar they’re allocated to. Leave requests after this date are cancelled.`
          : "Pick the last working day."}
      </Note>
      <div className="dialog-actions" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        {p.resign && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              s.run({ type: "setResign", pid, date: null });
              close();
            }}
          >
            Withdraw resignation
          </button>
        )}
        <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
          <button className="btn btn-secondary btn-40" onClick={close}>
            Cancel
          </button>
          <PrimaryBtn
            disabled={!d}
            onClick={() => {
              s.run({ type: "setResign", pid, date: d });
              close();
            }}
          >
            Save
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

// ── Add / edit member ──
interface AllocRow {
  dept: string;
  tower: string;
  branch: string;
  system: string;
  trade: string;
}
const WEEKDAYS: [number, string][] = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"]];
function MemberDialog({ pid: pid0 }: { pid: number | null }) {
  const s = useCalendar();
  const v = useCalView();
  const { O } = s.cal;
  const allocOf = (a: string): AllocRow => ({
    dept: O.up(a, "dept")?.id ?? "",
    tower: O.up(a, "tower")?.id ?? "",
    branch: O.up(a, "branch")?.id ?? "",
    system: O.up(a, "system")?.id ?? "",
    trade: O.up(a, "trade")?.id ?? "",
  });
  const isNew = pid0 === null;
  const init = pid0 !== null ? s.cal.person(pid0) : null;
  // A new member is a new person, or someone already in another team.
  const [who, setWho] = useState<"new" | "existing">("new");
  const [pid, setPid] = useState<number | null>(pid0);
  const detailsOf = (p: CalPerson | null) => ({
    name: p?.name ?? "",
    email: p?.email ?? "",
    hire: p?.hire ?? s.today,
    entitle: String(p?.entitle ?? 25),
    elEnt: String(p?.elEnt ?? 5),
    carry: String(p?.carry ?? 0),
    ytd: String(p?.ytd ?? 0),
    ytdEl: String(p?.ytdEl ?? 0),
  });
  const wfhOf = (p: CalPerson | null) => p?.wfhDays ?? (p ? (p.pattern === "B" ? [4, 5] : [1, 2]) : []);
  const [f, setF] = useState(() => detailsOf(init));
  const [wfh, setWfh] = useState<number[]>(() => wfhOf(init));
  const [primary, setPrimary] = useState(init?.primaryTeam ?? "");
  const [level, setLevel] = useState<Level>(init?.level ?? "member");
  const [shift, setShift] = useState(init?.shift ?? (s.data.shifts.some((x) => x.id === "D") ? "D" : s.data.shifts[0]?.id ?? "D"));
  const [adminHere, setAdminHere] = useState(init ? (v.branch.admins ?? []).includes(init.id) : false);
  const hereRow: AllocRow = { dept: v.dept.id, tower: v.tower.id, branch: v.bid, system: v.system !== "all" ? v.system : "", trade: v.trade !== "all" ? v.trade : "" };
  const [alloc, setAlloc] = useState<AllocRow[]>(init ? init.assign.map(allocOf) : [hereRow]);
  const close = () => s.setDialog(null);
  const setA = (i: number, k: keyof AllocRow, val: string) =>
    setAlloc((rows) =>
      rows.map((r, j) => {
        if (j !== i) return r;
        const n = { ...r, [k]: val };
        if (k === "dept") Object.assign(n, { tower: "", branch: "", system: "", trade: "" });
        if (k === "tower") Object.assign(n, { branch: "", system: "", trade: "" });
        if (k === "branch") Object.assign(n, { system: "", trade: "" });
        if (k === "system") n.trade = "";
        return n;
      }),
    );
  const setD = (k: keyof typeof f, val: string) => setF((x) => ({ ...x, [k]: val }));
  const cands = s.data.people
    .filter((p) => !O.inN(p, v.bid) && !(p.resign && p.resign < s.today))
    .sort((a, b) => a.name.localeCompare(b.name));
  const existing = isNew && who === "existing";
  const showDetails = !existing || pid !== null;
  // Directors need only a department, managers a tower; everyone else a team.
  const need = ALLOC_MIN[level];
  const leafOf = (r: AllocRow) => r.trade || r.system || r.branch || r.tower || r.dept;
  const assign = [...new Set(alloc.map(leafOf).filter(Boolean))];

  // Same checks as the server, so problems show before saving.
  const email = f.email.trim().toLowerCase();
  const nums: [keyof typeof f, string, number, number][] = [
    ["entitle", "VL + SL entitlement", 0, 60],
    ["elEnt", "Emergency leave", 0, 30],
    ["carry", "Carry-over", 0, 5],
    ["ytd", "VL + SL already used", 0, 60],
    ["ytdEl", "EL already used", 0, 30],
  ];
  const problem = !showDetails
    ? "Choose a person."
    : !f.name.trim()
      ? "Enter the person’s name."
      : !EMAIL_RE.test(email)
        ? "Enter a valid work email. It’s what they sign in with."
        : s.data.people.some((p) => p.id !== pid && p.email.toLowerCase() === email)
          ? "Someone already has that email."
          : !/^\d{4}-\d{2}-\d{2}$/.test(f.hire)
            ? "Enter the hire date."
            : (nums.map(([k, l, lo, hi]) => {
                const n = Number(f[k]);
                return f[k].trim() === "" || !Number.isFinite(n) || n < lo || n > hi ? `${l} must be between ${lo} and ${hi}.` : "";
              }).find(Boolean) ??
              (!alloc.length || alloc.some((r) => !r.dept) ? `Choose ${allocNeeds(level)} for each allocation.` : allocProblem(s.cal.O, level, assign)));
  const emailChanged = !!init && email !== init.email.toLowerCase();
  const signIn =
    s.mode !== "db"
      ? ""
      : isNew && !existing
        ? "Saving creates their sign-in. You’ll see a temporary password once; they change it at first sign-in."
        : emailChanged
          ? "Changing the email replaces their sign-in and creates a new temporary password."
          : "";

  const save = () => {
    const details = {
      name: f.name,
      email: f.email,
      hire: f.hire,
      entitle: Number(f.entitle),
      elEnt: Number(f.elEnt),
      carry: Number(f.carry),
      ytd: Number(f.ytd),
      ytdEl: Number(f.ytdEl),
      wfhDays: wfh,
      primaryTeam: primary,
    };
    if (isNew && !existing) s.run({ type: "addPerson", details, level, shift, adminHere, bid: v.bid, assign });
    else s.run({ type: "saveMember", pid: pid!, level, shift, adminHere, bid: v.bid, assign, isNew, details });
    close();
  };
  const opts = (l: { id: string; name: string }[]) =>
    l.map((o) => (
      <option key={o.id} value={o.id}>
        {o.name}
      </option>
    ));
  const numField = (k: keyof typeof f, label: string, hint?: string) => (
    <div className="field">
      <label htmlFor={"mem-" + k}>{label}</label>
      <input id={"mem-" + k} className="input" type="number" min={0} step={0.5} value={f[k]} disabled={existing} onChange={(e) => setD(k, e.target.value)} />
      {hint && <span className="small" style={{ fontSize: 12 }}>{hint}</span>}
    </div>
  );
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 } as const;
  const section = (t: string) => (
    <span className="small" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-accent-700)" }}>
      {t}
    </span>
  );
  return (
    <Modal onClose={close} width={980}>
      <div className="dialog-scroll" style={{ padding: 20 }}>
        <Title>{isNew ? "Add member to " + v.branch.name : "Edit " + init!.name}</Title>
        {isNew && cands.length > 0 && (
          <Seg
            name="mem-who"
            value={who}
            options={[["new", "New person"], ["existing", "Someone from another team"]]}
            onChange={(val) => {
              setWho(val);
              setPid(null);
              setF(detailsOf(null));
              setWfh([]);
              setAlloc([hereRow]);
            }}
            style={{ alignSelf: "flex-start" }}
          />
        )}
        {existing && (
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="mem-p">Person</label>
            <select
              id="mem-p"
              className="input"
              value={pid === null ? "" : String(pid)}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") return setPid(null);
                const p = s.cal.person(Number(val));
                setPid(p.id);
                setF(detailsOf(p));
                setWfh(wfhOf(p));
                setPrimary(p.primaryTeam ?? "");
                setLevel(p.level);
                setShift(p.shift);
                setAlloc(p.assign.map(allocOf).concat(hereRow));
              }}
            >
              <option value="">Choose a person</option>
              {cands.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.email}
                </option>
              ))}
            </select>
          </div>
        )}
        {showDetails && (
          <>
            {section("Person")}
            <div style={grid}>
              <div className="field">
                <label htmlFor="mem-name">Full name *</label>
                <input id="mem-name" className="input" value={f.name} disabled={existing} onChange={(e) => setD("name", e.target.value)} autoComplete="off" />
              </div>
              <div className="field">
                <label htmlFor="mem-email">Work email * · used to sign in</label>
                <input id="mem-email" className="input" type="email" value={f.email} disabled={existing} onChange={(e) => setD("email", e.target.value)} autoComplete="off" />
              </div>
              <div className="field">
                <label htmlFor="mem-hire">Hire date *</label>
                <input id="mem-hire" className="input" type="date" value={f.hire} disabled={existing} onChange={(e) => setD("hire", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="mem-l">Role</label>
                <select id="mem-l" className="input" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                  {(Object.keys(LEVELS) as Level[]).map((k) => (
                    <option key={k} value={k}>
                      {LEVELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {section("Schedule")}
            <div style={grid}>
              <div className="field">
                <label htmlFor="mem-s">Default shift</label>
                <select id="mem-s" className="input" value={shift} onChange={(e) => setShift(e.target.value)}>
                  {s.data.shifts.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} ({x.start}–{x.end})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span style={{ fontSize: 12 }}>Work from home on</span>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", minHeight: 36, alignItems: "center" }}>
                  {WEEKDAYS.map(([d, l]) => (
                    <label key={d} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" className="check" checked={wfh.includes(d)} onChange={() => setWfh(wfh.includes(d) ? wfh.filter((x) => x !== d) : wfh.concat(d).sort())} />
                      {l}
                    </label>
                  ))}
                </div>
                <span className="small" style={{ fontSize: 12 }}>Other weekdays are in the office (RTO).</span>
              </div>
              <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", alignSelf: "center", minHeight: 36 }}>
                <input type="checkbox" className="check" checked={adminHere} onChange={() => setAdminHere(!adminHere)} />
                Admin of {v.branch.name}
              </label>
            </div>
            {section("Leave balance this year")}
            <div style={grid}>
              {numField("entitle", "VL + SL entitlement (days)")}
              {numField("elEnt", "Emergency leave entitlement")}
              {numField("carry", "Carried over (max 5)")}
              {numField("ytd", "VL + SL already used", "Taken this year before using the app")}
              {numField("ytdEl", "EL already used", "Taken this year before using the app")}
            </div>
          </>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {section("Allocations · their schedule and leave show on every calendar they’re allocated to")}
          <span className="small" style={{ fontSize: 12, marginTop: -6 }}>
            {LEVELS[level]}s need {allocNeeds(level)}
            {need === "dept" ? "; tower and team are optional." : need === "tower" ? "; team is optional." : "."}
          </span>
          {alloc.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr)) 36px", gap: 8, alignItems: "end", padding: 12, border: "1px solid var(--color-divider)" }}>
              <div className="field">
                <label>Department *</label>
                <select className="input" value={r.dept} onChange={(e) => setA(i, "dept", e.target.value)}>
                  <option value="">Choose</option>
                  {opts(s.data.nodes.filter((n) => n.type === "dept"))}
                </select>
              </div>
              <div className="field">
                <label>Tower{need !== "dept" ? " *" : ""}</label>
                <select className="input" value={r.tower} onChange={(e) => setA(i, "tower", e.target.value)}>
                  <option value="">{need !== "dept" ? "Choose" : "None"}</option>
                  {r.dept && opts(O.kids(r.dept, "tower"))}
                </select>
              </div>
              <div className="field">
                <label>Team{need === "branch" ? " *" : ""}</label>
                <select className="input" value={r.branch} onChange={(e) => setA(i, "branch", e.target.value)}>
                  <option value="">{need === "branch" ? "Choose" : "None"}</option>
                  {r.tower && opts(O.kids(r.tower, "branch"))}
                </select>
              </div>
              <div className="field">
                <label>System</label>
                <select className="input" value={r.system} onChange={(e) => setA(i, "system", e.target.value)}>
                  <option value="">None</option>
                  {r.branch && opts(O.kids(r.branch, "system"))}
                </select>
              </div>
              <div className="field">
                <label>Trade</label>
                <select className="input" value={r.trade} onChange={(e) => setA(i, "trade", e.target.value)}>
                  <option value="">None</option>
                  {r.system ? opts(O.kids(r.system, "trade")) : r.branch ? opts(O.kids(r.branch, "trade")) : null}
                </select>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setAlloc(alloc.filter((_, j) => j !== i))} title="Remove allocation" aria-label="Remove allocation" style={{ color: "var(--color-neutral-700)" }}>
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}
          {(() => {
            // Several teams: which one counts this person on the headcount report.
            const teams = [...new Set(alloc.map((r) => r.branch).filter(Boolean))];
            if (teams.length < 2) return null;
            const cur = teams.includes(primary) ? primary : teams[0];
            return (
              <div className="field" style={{ maxWidth: 420 }}>
                <label htmlFor="mem-primary">Primary team · counted in headcount</label>
                <select id="mem-primary" className="input" value={cur} onChange={(e) => setPrimary(e.target.value)}>
                  {teams.map((t) => (
                    <option key={t} value={t}>
                      {O.by[t]?.name ?? t}
                    </option>
                  ))}
                </select>
                <span className="small" style={{ fontSize: 12 }}>
                  They appear on every team’s calendar, but are counted as 1 FTE only in this team on the headcount report.
                </span>
              </div>
            );
          })()}
          <div>
            <button className="btn btn-secondary btn-36" onClick={() => setAlloc(alloc.concat({ dept: v.dept.id, tower: "", branch: "", system: "", trade: "" }))}>
              <Icon name="plus" size={16} />
              Add another allocation
            </button>
          </div>
        </div>
        {signIn && <Note>{signIn}</Note>}
        <div className="dialog-actions" style={{ gap: 10, alignItems: "center" }}>
          {problem && showDetails && (
            <span style={{ marginRight: "auto", fontSize: 13, color: "var(--color-neutral-800)" }} role="status">
              {problem}
            </span>
          )}
          <button className="btn btn-secondary btn-40" onClick={close}>
            Cancel
          </button>
          <PrimaryBtn disabled={!!problem} onClick={save}>
            {isNew && !existing ? "Add member" : "Save"}
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

/** Temporary passwords, shown once after adding people or resetting a password. */
export function IssuedPasswords() {
  const s = useCalendar();
  const [copied, setCopied] = useState("");
  if (!s.issued.length) return null;
  const text = (i: Issued) => `${i.name} <${i.email}>\nTemporary password: ${i.password}\nSign in at ${window.location.origin}/login`;
  const copy = async (key: string, t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(key);
    } catch {}
  };
  const csv = () => {
    const q = (x: string) => `"${x.replace(/"/g, '""')}"`;
    const body = ["Name,Email,Temporary password"].concat(s.issued.map((i) => [i.name, i.email, i.password].map(q).join(","))).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
    a.download = "temporary-passwords.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const close = () => s.showIssued([]);
  return (
    <Modal onClose={() => {}} width={640}>
      <div className="dialog-scroll" style={{ padding: 20 }}>
        <Title>Temporary passwords</Title>
        <Note>
          Give each person their password privately. It’s shown only now; they must choose their own password when they first sign in. If one is lost,
          use Reset password under Members.
        </Note>
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Temporary password</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s.issued.map((i) => (
              <tr key={i.email + i.password}>
                <td>
                  {i.name}
                  <div className="small">{i.email}</div>
                </td>
                <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 15 }}>{i.password}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn btn-ghost" onClick={() => copy(i.email, text(i))}>
                    {copied === i.email ? "Copied" : "Copy"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dialog-actions" style={{ gap: 10 }}>
          {s.issued.length > 1 && (
            <button className="btn btn-secondary btn-40" onClick={csv}>
              Download CSV
            </button>
          )}
          <PrimaryBtn onClick={close}>Done</PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

// ── Organization: add / rename / delete ──
function NodeDialog({ mode, id, ntype, parent }: { mode: "add" | "rename"; id?: string; ntype: keyof typeof TYPE_L; parent?: string | null }) {
  const s = useCalendar();
  const { O } = s.cal;
  const [name, setName] = useState(mode === "rename" && id ? O.by[id].name : "");
  const close = () => s.setDialog(null);
  const par = parent ? O.by[parent] : null;
  const ph = {
    dept: "e.g. BSS (Business Support Services)",
    tower: "e.g. A&S Support - Rate Management",
    branch: "e.g. Rate Management",
    system: "e.g. GPM",
    trade: "e.g. FEWB",
  }[ntype];
  return (
    <Modal onClose={close} pad>
      <Title>{mode === "add" ? `Add ${TYPE_L[ntype].toLowerCase()}${par ? " to " + par.name : ""}` : `Rename ${TYPE_L[ntype].toLowerCase()}`}</Title>
      <div className="field">
        <label htmlFor="node-name">Name</label>
        <input id="node-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={ph} />
      </div>
      {mode === "add" && ntype === "branch" && <span className="small" style={{ fontSize: 13 }}>New teams start with admin approval and you as the admin. Change this in Settings.</span>}
      <div className="dialog-actions" style={{ gap: 10 }}>
        <button className="btn btn-secondary btn-40" onClick={close}>
          Cancel
        </button>
        <PrimaryBtn
          disabled={!name.trim()}
          onClick={() => {
            if (mode === "rename" && id) s.run({ type: "renameNode", id, name });
            else s.run({ type: "addNode", ntype, parent: parent ?? null, name, actor: s.me });
            close();
          }}
        >
          Save
        </PrimaryBtn>
      </div>
    </Modal>
  );
}

function DelDialog({ id }: { id: string }) {
  const s = useCalendar();
  const { O } = s.cal;
  const n = O.by[id];
  const close = () => s.setDialog(null);
  if (!n) return null;
  const ids = [n.id].concat(O.desc(n.id).map((x) => x.id));
  const affected = s.data.people.filter((p) => p.assign.some((a) => ids.includes(a)));
  const soft = n.type === "system" || n.type === "trade";
  const par = n.parent ? O.by[n.parent] : null;
  const text =
    (ids.length > 1 ? `This also deletes ${ids.length - 1} item(s) inside it. ` : "") +
    (affected.length
      ? soft
        ? `${affected.length} people allocated here will stay in ${par?.name}.`
        : `${affected.length} people will lose this allocation. Anyone left with no allocation drops off every calendar.`
      : "No one is allocated here.");
  return (
    <Modal onClose={close} pad>
      <Title>Delete {n.name}?</Title>
      <p className="dialog-body" style={{ margin: 0, opacity: 1 }}>
        {text}
      </p>
      <div className="dialog-actions" style={{ gap: 10 }}>
        <button className="btn btn-secondary btn-40" onClick={close}>
          Cancel
        </button>
        <PrimaryBtn
          onClick={() => {
            s.run({ type: "deleteNode", id });
            close();
          }}
        >
          Delete
        </PrimaryBtn>
      </div>
    </Modal>
  );
}

// ── Shifts ──
function ShiftDialog({ orig }: { orig: string | null }) {
  const s = useCalendar();
  const x0 = orig ? s.data.shifts.find((x) => x.id === orig) : null;
  const [r, setR] = useState({ id: x0?.id ?? "", name: x0?.name ?? "", start: x0?.start ?? "09:00", end: x0?.end ?? "18:00", bucket: (x0?.bucket ?? "morning") as Bucket });
  const close = () => s.setDialog(null);
  const dup = !orig && s.data.shifts.some((x) => x.id.toLowerCase() === r.id.toLowerCase());
  const invalid = !r.id.trim() || !r.name.trim() || !r.start || !r.end || dup;
  return (
    <Modal onClose={close} width={460}>
      <div className="dialog-scroll" style={{ gap: 12, padding: 20 }}>
        <Title>{orig ? "Edit shift" : "Add shift"}</Title>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
          <div className="field">
            <label htmlFor="sh-id">Code</label>
            <input id="sh-id" className="input" value={r.id} disabled={!!orig} placeholder="e.g. MID" onChange={(e) => setR({ ...r, id: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
          </div>
          <div className="field">
            <label htmlFor="sh-name">Name</label>
            <input id="sh-name" className="input" value={r.name} placeholder="e.g. Midshift" onChange={(e) => setR({ ...r, name: e.target.value })} />
          </div>
        </div>
        {dup && <span style={{ fontSize: 12.5, color: "var(--color-accent-800)" }}>That code is already used.</span>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label htmlFor="sh-s">Starts</label>
            <input id="sh-s" className="input" type="time" value={r.start} onChange={(e) => setR({ ...r, start: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="sh-e">Ends</label>
            <input id="sh-e" className="input" type="time" value={r.end} onChange={(e) => setR({ ...r, end: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="sh-b">Manning group</label>
          <select id="sh-b" className="input" value={r.bucket} onChange={(e) => setR({ ...r, bucket: e.target.value as Bucket })}>
            {(Object.keys(BUCKETS) as Bucket[]).map((k) => (
              <option key={k} value={k}>
                {BUCKETS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={close}>
            Cancel
          </button>
          <PrimaryBtn
            disabled={invalid}
            onClick={() => {
              s.run({ type: "saveShift", orig, rec: r });
              close();
            }}
          >
            Save
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

// ── Holidays ──
export function holidayScopeOpts(s: ReturnType<typeof useCalendar>) {
  const { O } = s.cal;
  const o = [{ id: "all", name: "Everyone (all departments)" }];
  s.data.nodes
    .filter((n) => n.type === "dept")
    .forEach((d) => {
      o.push({ id: d.id, name: d.name });
      O.kids(d.id, "tower").forEach((t) => {
        o.push({ id: t.id, name: "— " + t.name });
        O.kids(t.id, "branch").forEach((b) => o.push({ id: b.id, name: "—— " + b.name }));
      });
    });
  return o;
}
function HolDialog({ id }: { id: string | null }) {
  const s = useCalendar();
  const h0 = id ? s.data.holidays.find((x) => x.id === id) : null;
  const [r, setR] = useState({ date: h0?.date ?? "", name: h0?.name ?? "", type: (h0?.type ?? "regular") as HolidayType, scope: h0?.scope ?? "all" });
  const close = () => s.setDialog(null);
  return (
    <Modal onClose={close} pad>
      <Title>{id ? "Edit holiday" : "Add holiday"}</Title>
      <div className="field">
        <label htmlFor="hol-d">Date</label>
        <input id="hol-d" className="input" type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="hol-n">Name</label>
        <input id="hol-n" className="input" value={r.name} placeholder="e.g. Independence Day" onChange={(e) => setR({ ...r, name: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="hol-t">Type</label>
        <select id="hol-t" className="input" value={r.type} onChange={(e) => setR({ ...r, type: e.target.value as HolidayType })}>
          {(Object.keys(HTYPE) as HolidayType[]).map((k) => (
            <option key={k} value={k}>
              {HTYPE[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="hol-s">Applies to</label>
        <select id="hol-s" className="input" value={r.scope} onChange={(e) => setR({ ...r, scope: e.target.value })}>
          {holidayScopeOpts(s).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="dialog-actions" style={{ gap: 10 }}>
        <button className="btn btn-secondary btn-40" onClick={close}>
          Cancel
        </button>
        <PrimaryBtn
          disabled={!r.date || !r.name.trim()}
          onClick={() => {
            s.run({ type: "saveHoliday", rec: { id: id ?? "H" + Date.now().toString(36), ...r }, isNew: !id });
            close();
          }}
        >
          Save
        </PrimaryBtn>
      </div>
    </Modal>
  );
}

// ── Uploads (members / schedule) ──
function UploadDialog({ mode: mode0 }: { mode: "members" | "schedule" }) {
  const s = useCalendar();
  const v = useCalView();
  const [mode, setMode] = useState(mode0);
  const [file, setFile] = useState<{ name: string; rows: UploadRow[] } | null>(null);
  const [month, setMonth] = useState(`${s.y}-${String(s.m + 1).padStart(2, "0")}`);
  const close = () => s.setDialog(null);
  const all = useMemo(() => (file ? checkUpload(s.cal, mode, file.rows, v.bid) : []), [file, s.cal, mode, v.bid]);
  const checked = all.filter((c) => !c.skip);
  const skipped = all.length - checked.length;
  const okN = checked.filter((c) => c.ok).length;
  const switchMode = (m: "members" | "schedule") => {
    setMode(m);
    setFile(null);
  };
  return (
    <Modal onClose={close} width={760}>
      <div className="dialog-scroll" style={{ gap: 12, padding: 20 }}>
        <Title>{mode === "members" ? "Upload members" : "Upload schedule"}</Title>
        <Seg name="upmode" value={mode} options={[["members", "Members"], ["schedule", "Schedule"]]} onChange={switchMode} style={{ alignSelf: "flex-start" }} />
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-neutral-800)", maxWidth: "70ch" }}>
          {mode === "members"
            ? `The Excel template has drop-downs for Role, Department, Tower, Team, System, Trade and Default Shift, filled from your current selection (${v.unitLabel}). One row per allocation; existing people (matched by email) get the new allocation added.`
            : `The Excel template is a calendar for the month you pick: one row per person in ${v.unitLabel}, one column per day, with a Status tab and a Shift tab. Each cell has a drop-down and is pre-filled with the current schedule, so only change what you need. Leave codes are recorded as approved.`}
        </p>
        {mode === "schedule" && (
          <div className="field" style={{ maxWidth: 220 }}>
            <label htmlFor="up-month">Template month</label>
            <input id="up-month" className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        )}
        <div className="row">
          <button
            className="btn btn-secondary btn-36"
            onClick={async () => {
              try {
                const name =
                  mode === "schedule"
                    ? await downloadScheduleTemplate(s.cal, v.unitId, v.unitLabel, v.bid, month)
                    : await downloadMembersTemplate(s.cal, v.dept, v.tower, v.branch);
                s.toast(name + " downloaded.");
              } catch {
                s.toast("The template couldn’t be created. Try again.");
              }
            }}
          >
            <Icon name="download" size={16} />
            Download template (.xlsx)
          </button>
          <label className="btn btn-secondary btn-36 file-btn">
            Choose file (.xlsx or .csv)
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  setFile({ name: f.name, rows: await readCalendarUpload(f, mode) });
                } catch {
                  s.toast("That file couldn’t be read. Use .xlsx or .csv.");
                }
              }}
            />
          </label>
          <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>{file?.name}</span>
        </div>
        {file && (
          <>
            <Note>
              {checked.length} changes · {okN} ready · {checked.length - okN} with errors{skipped ? ` · ${skipped} unchanged cells skipped` : ""}
            </Note>
            <div className="boxed-scroll" style={{ maxHeight: 280 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Details</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.slice(0, 200).map((u, i) => (
                    <tr key={i}>
                      <td className="muted">{u.n}</td>
                      <td>{u.summary}</td>
                      <td>
                        <span className={"tag " + u.stCls}>{u.stText}</span>
                      </td>
                      <td style={{ fontSize: 13, color: "var(--color-neutral-800)" }}>{u.msg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={close}>
            Cancel
          </button>
          {file && (
            <PrimaryBtn
              disabled={!okN}
              onClick={() => {
                s.run({ type: "importUpload", mode, rows: file.rows, bid: v.bid });
                close();
              }}
            >
              Import {okN} row{okN === 1 ? "" : "s"}
            </PrimaryBtn>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── BCP check-in and event ──
function CheckinDialog({ pid, evId }: { pid: number; evId: string }) {
  const s = useCalendar();
  const ev = s.data.bcpEvents.find((e) => e.id === evId);
  const cur = (s.data.checkins[evId] || {})[pid];
  const [st, setSt] = useState<BcpStatus>(cur && cur.status !== "none" ? cur.status : "wfh");
  const [note, setNote] = useState(cur?.note ?? "");
  const close = () => s.setDialog(null);
  if (!ev) return null;
  const p = s.cal.person(pid);
  return (
    <Modal onClose={close} width={520}>
      <div className="dialog-scroll" style={{ gap: 12, padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Title>{pid === s.me ? "BCP check-in" : "Update status · " + p.name}</Title>
          <span className="muted">{ev.name}</span>
        </div>
        <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(Object.keys(CI_DESC) as (keyof typeof CI_DESC)[]).map((k) => (
            <button key={k} role="radio" aria-checked={st === k} className="pick-card" style={{ alignItems: "center", minHeight: 56 }} onClick={() => setSt(k)}>
              <span className="mode-radio" style={{ marginTop: 0 }}>
                <span style={{ background: st === k ? "var(--color-accent)" : "transparent" }} />
              </span>
              <span className="mode-text">
                <strong style={{ fontWeight: 500, fontSize: 15 }}>{BCP_ST[k]}</strong>
                <span>{CI_DESC[k]}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="ci-note">Note (optional)</label>
          <textarea id="ci-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. No power since 10:00, using mobile data" style={{ minHeight: 64 }} />
        </div>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={close}>
            Cancel
          </button>
          <PrimaryBtn
            onClick={() => {
              s.run({ type: "checkin", evId, pid, status: st, note, actor: s.me });
              close();
            }}
          >
            Save status
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

export function bcpScopeOpts(s: ReturnType<typeof useCalendar>, deptId: string) {
  const { O } = s.cal;
  const o = [{ id: deptId, name: O.by[deptId].name }];
  O.kids(deptId, "tower").forEach((t) => {
    o.push({ id: t.id, name: "— " + t.name });
    O.kids(t.id, "branch").forEach((b) => o.push({ id: b.id, name: "—— " + b.name }));
  });
  return o;
}
function EventDialog() {
  const s = useCalendar();
  const v = useCalView();
  const [r, setR] = useState({ name: "", start: s.today, scope: v.dept.id, note: "" });
  const close = () => s.setDialog(null);
  return (
    <Modal onClose={close} width={500}>
      <div className="dialog-scroll" style={{ gap: 12, padding: 20 }}>
        <Title>Start BCP event</Title>
        <div className="field">
          <label htmlFor="ev-n">Event name</label>
          <input id="ev-n" className="input" value={r.name} placeholder="e.g. Typhoon Helen – Signal No. 3" onChange={(e) => setR({ ...r, name: e.target.value })} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label htmlFor="ev-s">Start date</label>
            <input id="ev-s" className="input" type="date" value={r.start} onChange={(e) => setR({ ...r, start: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ev-sc">Who needs to check in</label>
            <select id="ev-sc" className="input" value={r.scope} onChange={(e) => setR({ ...r, scope: e.target.value })}>
              {bcpScopeOpts(s, v.dept.id).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ev-note">Message to staff</label>
          <textarea id="ev-note" className="input" value={r.note} placeholder="e.g. Office is closed. Work from home if it is safe to do so." onChange={(e) => setR({ ...r, note: e.target.value })} style={{ minHeight: 70 }} />
        </div>
        <span className="small" style={{ fontSize: 13 }}>Everyone in scope sees a check-in banner in Workforce Management and gets an email.</span>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={close}>
            Cancel
          </button>
          <PrimaryBtn
            disabled={!r.name.trim() || !r.start}
            onClick={() => {
              s.run({ type: "startEvent", ...r });
              close();
            }}
          >
            Start event
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

// ── Import org structure (paste from Excel) ──
function OrgImportDialog() {
  const s = useCalendar();
  const v = useCalView();
  const depts = s.data.nodes.filter((n) => n.type === "dept");
  const [dept, setDept] = useState(v.dept.id);
  const [text, setText] = useState("");
  const rows = useMemo(() => parseOrgText(text), [text]);
  const plan = useMemo(() => planOrgImport(s.data, dept, rows, "preview"), [s.data, dept, rows]);
  const close = () => s.setDialog(null);
  const TL: Record<string, string> = { tower: "Tower", branch: "Team", system: "System", trade: "Trade" };
  return (
    <Modal onClose={close} width={760}>
      <div className="dialog-scroll" style={{ padding: 20 }}>
        <Title>Import towers and teams</Title>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-neutral-800)" }}>
          Copy the columns from Excel and paste them below: <strong>Tower, Team</strong>, and optionally <strong>System, Trade</strong>. A header row is
          ignored. Anything already there is skipped, so you can paste the same list again after adding rows.
        </p>
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="oi-dept">Department</label>
          <select id="oi-dept" className="input" value={dept} onChange={(e) => setDept(e.target.value)}>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="oi-text">Rows</label>
          <textarea
            id="oi-text"
            className="input"
            rows={8}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, resize: "vertical" }}
            placeholder={"Tower\tTeam\nCustoms MNL\tAustralia\nCustoms MNL\tCanada"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {plan.errors.map((e) => (
              <div key={e} className="auth-error">
                {e}
              </div>
            ))}
            <span className="small" style={{ fontSize: 12 }}>
              {rows.length} row{rows.length === 1 ? "" : "s"} · {plan.add.length} to add · {plan.skip.length} already there
            </span>
            {plan.add.length > 0 && (
              <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid var(--color-divider)" }}>
                <table className="table">
                  <tbody>
                    {plan.add.map((x, i) => (
                      <tr key={i}>
                        <td style={{ width: 90 }}>
                          <span className={"tag " + (x.type === "tower" ? "tag-accent" : x.type === "branch" ? "tag-outline" : "tag-neutral")}>{TL[x.type]}</span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{x.name}</td>
                        <td className="small">in {x.under}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {plan.skip.length > 0 && (
              <span className="small" style={{ fontSize: 12 }}>
                Skipped: {plan.skip.map((x) => `${x.name} (${x.why})`).join(", ")}
              </span>
            )}
          </div>
        )}
        <Note>New teams start with admin approval and no team admin. Set each team’s admins under Settings, or tick “Admin of …” when adding a member.</Note>
        <div className="dialog-actions" style={{ gap: 10 }}>
          <button className="btn btn-secondary btn-40" onClick={close}>
            Cancel
          </button>
          <PrimaryBtn
            disabled={!plan.add.length || plan.errors.length > 0}
            onClick={() => {
              s.run({ type: "importOrg", dept, rows });
              close();
            }}
          >
            {plan.add.length ? `Add ${plan.add.length}` : "Add"}
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

/** Admins of a department or tower: they administer every team under it. */
function NodeAdminsDialog({ id }: { id: string }) {
  const s = useCalendar();
  const { O } = s.cal;
  const n = O.by[id];
  const [pick, setPick] = useState("");
  if (!n) return null;
  const admins = n.admins ?? [];
  const close = () => s.setDialog(null);
  // Suggest people allocated here (directors and managers first), then everyone else.
  const rank: Record<string, number> = { director: 0, manager: 1, lead: 2, member: 3 };
  const cands = s.data.people
    .filter((p) => !admins.includes(p.id) && !(p.resign && p.resign < s.today))
    .sort((a, b) => Number(O.inN(b, id)) - Number(O.inN(a, id)) || rank[a.level] - rank[b.level] || a.name.localeCompare(b.name));
  const kind = n.type === "dept" ? "department" : "tower";
  return (
    <Modal onClose={close} width={560}>
      <div className="dialog-scroll" style={{ padding: 20 }}>
        <Title>Admins of {n.name}</Title>
        <Note>
          Admins of this {kind} have admin rights in every team under it: approvals, members, settings, schedules and Workload — the same as each
          team’s own admins.
        </Note>
        {admins.length ? (
          <table className="table">
            <tbody>
              {admins.map((pid) => {
                const p = s.cal.people.get(pid);
                return (
                  <tr key={pid}>
                    <td style={{ fontWeight: 500 }}>
                      {p?.name ?? `#${pid}`}
                      <div className="small">{p ? LEVELS[p.level] : ""}</div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-ghost" onClick={() => s.run({ type: "removeAdmin", id, pid })}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <span className="small">No admins yet.</span>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="na-p">Add an admin</label>
            <select id="na-p" className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a person</option>
              {cands.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {LEVELS[p.level]}
                  {O.inN(p, id) ? "" : " (not allocated here)"}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-secondary btn-40"
            disabled={!pick}
            onClick={() => {
              s.run({ type: "addAdmin", id, pid: Number(pick) });
              setPick("");
            }}
          >
            Add
          </button>
        </div>
        <div className="dialog-actions">
          <PrimaryBtn onClick={close}>Done</PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

export function CalDialogs() {
  const { dialog: d } = useCalendar();
  if (!d) return null;
  switch (d.kind) {
    case "request":
      return <RequestDialog date={d.date} />;
    case "holWork":
      return <HolidayWorkDialog date={d.date} />;
    case "cell":
      return <CellDialog key={d.pid + d.date} pid={d.pid} date={d.date} />;
    case "resign":
      return <ResignDialog pid={d.pid} />;
    case "member":
      return <MemberDialog pid={d.pid} />;
    case "node":
      return <NodeDialog mode={d.mode} id={d.id} ntype={d.ntype} parent={d.parent} />;
    case "del":
      return <DelDialog id={d.id} />;
    case "shift":
      return <ShiftDialog orig={d.orig} />;
    case "hol":
      return <HolDialog id={d.id} />;
    case "upload":
      return <UploadDialog mode={d.mode} />;
    case "checkin":
      return <CheckinDialog pid={d.pid} evId={d.evId} />;
    case "event":
      return <EventDialog />;
    case "orgImport":
      return <OrgImportDialog />;
    case "nodeAdmins":
      return <NodeAdminsDialog id={d.id} />;
  }
}
