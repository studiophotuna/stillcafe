"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyAction, type Action } from "./actions";
import type { BusyElsewhere } from "./engine";
import { dayKey, nowMs, setRealClock } from "./clock";
import { usePoll } from "../poll";
import { loadMe, toLogin } from "../session";
import { isViewAs, person, personaId } from "./constants";
import { canUpload } from "./authz";
import { personOf, type AssistOffer, type WorkloadData } from "./engine";
import { demoTeamData, demoVisibleTeams } from "./demoTeams";
import type { Person, Task, Toast, ViewAs } from "./types";

/**
 * Client store for the Workload module.
 *
 * On load it asks /api/wl/snapshot for saved data. With a database configured
 * ("db" mode) every action is applied on screen straight away, then sent to
 * /api/wl/action, where the server applies the same rules to the stored data
 * and returns the result; the screen then shows what was saved. Data is also
 * refreshed every 30 s while the page is visible, so queues stay current. Without a database ("demo"
 * mode) the sample data lives in memory and resets on reload.
 */
export type DataMode = "demo" | "db";

export type Dialog =
  | { kind: "task"; id: string }
  | { kind: "editTicket"; id: string }
  | { kind: "hold"; id: string }
  | { kind: "delay"; id: string }
  | { kind: "done"; id: string }
  | { kind: "assist"; offer: AssistOffer }
  | { kind: "endWork" }
  | { kind: "addTask" }
  | null;

interface Store {
  data: WorkloadData;
  now: number;
  /** Apply an action (and save it in db mode); its message, if any, is shown as a toast. */
  run: (action: Action) => void;
  mode: DataMode;
  toast: (text: string) => void;
  toasts: Toast[];
  viewAs: ViewAs;
  /** Only with sample data; signed-in people are who they signed in as. */
  setViewAs?: (v: ViewAs) => void;
  me: Person;
  isAdmin: boolean;
  /** Admins, and members an admin allowed to upload tasks. */
  canUpload: boolean;
  /** Workload admins and the team's leads: may approve overtime. */
  isApprover: boolean;
  sys: string;
  tr: string;
  /** Today is a holiday for me: I'm working it (office or home), or not after all. Saved to the Calendar. */
  setHolidayWork: (code: "RTO" | "WFH" | "HOL") => void;
  /** Switch to another team this person can open (reloads its data). */
  setTeam: (id: string) => void;
  setSys: (v: string) => void;
  setTr: (v: string) => void;
  dialog: Dialog;
  setDialog: (d: Dialog) => void;
  /** Finished tasks fetched for older dates than load with the team (see useTasksIn). */
  older: Task[];
  /** Fetch the team's tasks finished between `from` and `to` into `older` (once per period). */
  loadDone: (from: number, to: number) => Promise<void>;
  /** A task by id, loaded with the team or fetched for older dates. */
  taskById: (id: string) => Task | undefined;
}

const Ctx = createContext<Store | null>(null);

const REFRESH_MS = 30_000;
const TEAM_KEY = "wfm.wlTeam";
const savedTeam = () => {
  try {
    return localStorage.getItem(TEAM_KEY) || "";
  } catch {
    return "";
  }
};

export function WorkloadProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkloadData | null>(null);
  const dataRef = useRef<WorkloadData | null>(null);
  const [mode, setMode] = useState<DataMode | null>(null);
  const modeRef = useRef<DataMode | null>(null);
  const pending = useRef(0);
  // The team being shown; the server checks the person may open it.
  const teamRef = useRef("");
  // The team's change stamp this page has: the background refresh only reloads when it changes.
  const stamp = useRef("");
  const q = (v = "") => (teamRef.current ? "?team=" + encodeURIComponent(teamRef.current) + (v ? "&v=" + encodeURIComponent(v) : "") : "");
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [viewAs, setViewAsState] = useState<ViewAs>("admin");
  const [sys, setSysState] = useState("all");
  const [tr, setTr] = useState("all");
  const [now, setNow] = useState(nowMs);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [blocked, setBlocked] = useState("");
  const [session, setSession] = useState<{ id: number; email: string } | null>(null);
  const [older, setOlder] = useState<Task[]>([]);
  const fetched = useRef(new Set<string>());

  const commit = useCallback((d: WorkloadData) => {
    const sameTeam = teamRef.current === d.org.team.id;
    if (!sameTeam) fetched.current.clear();
    // Older finished tasks belong to the team; keep them current when one of them was changed.
    setOlder((o) => (!o.length ? o : !sameTeam ? [] : o.map((t) => d.tasks.find((x) => x.id === t.id) ?? t)));
    teamRef.current = d.org.team.id;
    dataRef.current = d;
    setData(d);
    setNow(nowMs());
  }, []);

  const toast = useCallback((text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => t.concat({ id, text }));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  /** Load saved data (skipped while this browser still has changes on the way). */
  const refresh = useCallback(async () => {
    if (modeRef.current !== "db" || pending.current) return;
    try {
      const r = await fetch("/api/wl/snapshot" + q(stamp.current), { cache: "no-store" });
      if (r.status === 401) return toLogin();
      const j = await r.json();
      if (r.status === 403 && j.code !== "team") return toLogin("/change-password");
      if (j.mode === "db" && !j.same && !pending.current) {
        stamp.current = j.stamp ?? "";
        commit(j.data);
      }
    } catch {}
  }, [commit]);

  // Decide the mode once: saved data if the server has a database, else sample data.
  useEffect(() => {
    let live = true;
    (async () => {
      let next: DataMode = "demo";
      let saved: WorkloadData | null = null;
      const who = await loadMe();
      if (!who || !live) return;
      if (!who.demo) setSession({ id: who.personId, email: who.email });
      try {
        teamRef.current = savedTeam();
        let r = await fetch("/api/wl/snapshot" + q(), { cache: "no-store" });
        if (r.status === 401) return toLogin();
        let j = await r.json();
        // The remembered team may no longer be open to this person: fall back to their own team.
        if (r.status === 403 && j.code === "team" && teamRef.current) {
          teamRef.current = "";
          r = await fetch("/api/wl/snapshot", { cache: "no-store" });
          j = await r.json();
        }
        if (r.status === 403 && j.code === "team") {
          if (live) setBlocked(j.error);
          return;
        }
        if (r.status === 403) return toLogin("/change-password");
        if (j.mode === "db") {
          [next, saved] = ["db", j.data];
          stamp.current = j.stamp ?? "";
        }
        else if (j.mode === "error") toast("The database couldn’t be reached, so this is sample data. Changes won’t be saved.");
      } catch {}
      if (!live) return;
      if (next === "db") setRealClock();
      modeRef.current = next;
      setMode(next);
      commit(saved ?? demoTeamData("rm", nowMs()));
    })();
    return () => {
      live = false;
    };
  }, [commit, toast]);

  // Clock tick, plus a refresh of saved data so queues stay current.
  usePoll(refresh, REFRESH_MS);
  useEffect(() => {
    const tick = setInterval(() => setNow(nowMs()), 30_000);
    window.addEventListener("wfm:reload", refresh);
    return () => {
      clearInterval(tick);
      window.removeEventListener("wfm:reload", refresh);
    };
  }, [refresh]);

  useEffect(() => {
    try {
      const v = localStorage.getItem("wfm.viewAs");
      if (isViewAs(v)) setViewAsState(v);
    } catch {}
  }, []);

  // Sample data: each team's sample, kept while switching between teams.
  const demoCache = useRef<Record<string, WorkloadData>>({});
  // Sample data seen as a persona: only the teams they may open (as with saved data), and
  // their tasks in progress in those other teams, so one task at a time counts across teams.
  const demoView = useCallback(
    (d: WorkloadData): WorkloadData => {
      const pid = personaId(viewAs);
      const ids = demoVisibleTeams(pid, nowMs());
      const teams = d.org.teams.filter((t) => ids.includes(t.id));
      const busyElsewhere: BusyElsewhere[] = [];
      for (const t of teams) {
        if (t.id === d.org.team.id) continue;
        const other = (demoCache.current[t.id] ??= demoTeamData(t.id, nowMs()));
        for (const x of other.tasks)
          if (x.assignee === pid && x.status === "in_progress") busyElsewhere.push({ pid, team: t.id, teamName: t.name, id: x.id, title: x.title });
      }
      return { ...d, org: { ...d.org, teams: teams.length ? teams : d.org.teams }, busyElsewhere };
    },
    [viewAs],
  );

  const run = useCallback(
    (action: Action) => {
      if (!dataRef.current) return;
      const demo = modeRef.current === "demo";
      const local = applyAction(demo ? demoView(dataRef.current) : dataRef.current, action, nowMs());
      // Keep the full sample team list; the persona's view is worked out again on show.
      commit(demo ? { ...local.data, org: { ...local.data.org, teams: dataRef.current.org.teams }, busyElsewhere: undefined } : local.data);
      // Nothing left in the member's trades: ask whether they'll help elsewhere.
      if (local.ask) setDialog({ kind: "assist", offer: local.ask });
      if (modeRef.current !== "db") {
        if (local.message) toast(local.message);
        return;
      }
      pending.current++;
      // Send actions one at a time, in order.
      queue.current = queue.current.then(async () => {
        try {
          const r = await fetch("/api/wl/action" + q(), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(action),
          });
          const j = await r.json().catch(() => ({}));
          pending.current--;
          if (r.status === 401) return toLogin();
          if (!r.ok) {
            toast(j.error || "That change couldn’t be saved.");
            await refresh();
            return;
          }
          // Show the saved result once nothing else from this browser is on the way.
          if (!pending.current) commit(j.data);
          if (j.message) toast(j.message);
        } catch {
          pending.current--;
          toast("That change couldn’t be saved. Check your connection.");
          await refresh();
        }
      });
    },
    [commit, toast, refresh, demoView],
  );

  const setTeam = useCallback(
    async (id: string) => {
      if (id === teamRef.current) return;
      if (modeRef.current === "demo") {
        if (dataRef.current) demoCache.current[teamRef.current] = dataRef.current;
        setSysState("all");
        setTr("all");
        commit(demoCache.current[id] ?? demoTeamData(id, nowMs()));
        return;
      }
      if (modeRef.current !== "db") return;
      try {
        localStorage.setItem(TEAM_KEY, id);
      } catch {}
      const r = await fetch("/api/wl/snapshot?team=" + encodeURIComponent(id), { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast(j.error || "That team couldn’t be opened.");
      setSysState("all");
      setTr("all");
      stamp.current = j.stamp ?? "";
      commit(j.data);
    },
    [commit, toast],
  );

  // Working an unscheduled weekend / rest day: once they start a task, tag the day rest day
  // OT (RDOT) on their Calendar schedule. Once per day.
  const rdSent = useRef("");
  useEffect(() => {
    const me = session && data ? personOf(data, session.id) : null;
    if (modeRef.current !== "db" || !me?.rdTag || !data) return;
    const today = dayKey(Date.now());
    if (rdSent.current === today) return;
    const started = data.tasks.some((t) => t.assignee === me.id && t.startedAt && dayKey(t.startedAt) === today);
    if (!started) return;
    rdSent.current = today;
    fetch("/api/cal/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "restDayWork", pid: me.id, date: today, actor: me.id }),
    })
      .then((r) => r.json().catch(() => ({})).then((j) => r.ok && toast(j.message || "Today is marked as rest day OT.")))
      .catch(() => {});
  }, [data, session, toast]);

  const setHolidayWork = useCallback(
    async (code: "RTO" | "WFH" | "HOL") => {
      const me = session && dataRef.current && personOf(dataRef.current, session.id);
      if (modeRef.current !== "db" || !me?.holiday) return;
      try {
        const r = await fetch("/api/cal/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "holidayWork", pid: me.id, date: me.holiday.date, code, actor: me.id }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.status === 401) return toLogin();
        toast(r.ok ? j.message || "Saved." : j.error || "That change couldn’t be saved.");
      } catch {
        toast("That change couldn’t be saved. Check your connection.");
      }
      await refresh();
    },
    [session, toast, refresh],
  );

  const loadDone = useCallback(
    async (from: number, to: number) => {
      const team = teamRef.current;
      const key = `${team}|${from}|${to}`;
      if (modeRef.current !== "db" || fetched.current.has(key)) return;
      fetched.current.add(key);
      try {
        const r = await fetch(`/api/wl/done?team=${encodeURIComponent(team)}&from=${from}&to=${to}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Older tasks couldn’t be loaded.");
        if (teamRef.current !== team) return;
        setOlder((o) => {
          const m = new Map(o.map((t) => [t.id, t]));
          for (const t of j.tasks as Task[]) m.set(t.id, t);
          return [...m.values()];
        });
      } catch (e) {
        fetched.current.delete(key);
        toast(e instanceof Error ? e.message : "Older tasks couldn’t be loaded.");
      }
    },
    [toast],
  );

  const setViewAs = useCallback((v: ViewAs) => {
    setViewAsState(v);
    try {
      localStorage.setItem("wfm.viewAs", v);
    } catch {}
  }, []);

  // A persona who can't open the sample team on show starts on their own.
  useEffect(() => {
    if (mode !== "demo" || !data) return;
    const ids = demoVisibleTeams(personaId(viewAs), nowMs());
    if (ids.length && !ids.includes(data.org.team.id)) setTeam(ids[0]);
  }, [mode, data, viewAs, setTeam]);

  const value = useMemo<Store | null>(
    () => data && mode && ({
      data: mode === "demo" ? demoView(data) : data,
      now,
      run,
      mode,
      toast,
      toasts,
      viewAs,
      setViewAs: mode === "demo" ? setViewAs : undefined,
      me:
        mode === "db" && session
          ? (personOf(data, session.id) ?? {
              // Signed in but not a member of this team: can look, not take work.
              id: session.id,
              name: session.email.split("@")[0].replace(/[._]/g, " "),
              trades: [],
              avail: "offshift",
              shift: "—",
              shiftStart: 8,
            })
          : (personOf(data, personaId(viewAs)) ??
            person(personaId(viewAs)) ?? {
              // A sample persona outside the Workload team (the director): can look, not take work.
              id: personaId(viewAs),
              name: "Diego Samonte",
              trades: [],
              avail: "available",
              shift: "Day 08:00–17:00",
              shiftStart: 8,
            }),
      isAdmin: mode === "db" ? !!session && data.admins.includes(session.id) : viewAs !== "employee",
      canUpload: mode === "db" ? !!session && canUpload(data, session.id) : viewAs !== "employee" || canUpload(data, personaId(viewAs)),
      isApprover: mode === "db" ? !!session && data.approvers.includes(session.id) : viewAs !== "employee",
      sys,
      tr,
      setTeam,
      setHolidayWork,
      setSys: (v: string) => {
        setSysState(v);
        setTr("all");
      },
      setTr,
      dialog,
      setDialog,
      older,
      loadDone,
      taskById: (id: string) => data.tasks.find((t) => t.id === id) ?? older.find((t) => t.id === id),
    }),
    [data, mode, now, run, toast, toasts, viewAs, setViewAs, sys, tr, dialog, session, setTeam, setHolidayWork, older, loadDone, demoView],
  );

  if (blocked)
    return (
      <div className="auth">
        <div className="auth-card">
          <h1 className="dialog-title" style={{ fontSize: 26, margin: 0 }}>
            No team to show
          </h1>
          <p className="auth-sub">{blocked}</p>
          <a className="btn btn-secondary btn-40" href="/calendar">
            Go to Calendar
          </a>
        </div>
      </div>
    );
  // Nothing to show until we know whether this is saved or sample data.
  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkload() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useWorkload must be used inside WorkloadProvider");
  return s;
}
