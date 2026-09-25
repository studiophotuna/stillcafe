"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyAction, type Action } from "./actions";
import { nowMs, setRealClock } from "./clock";
import { loadMe, toLogin } from "../session";
import { ADMIN_ID, EMPLOYEE_ID, person } from "./constants";
import { canUpload } from "./authz";
import { personOf, type AssistOffer, type WorkloadData } from "./engine";
import { initialData } from "./seed";
import type { Person, Toast, ViewAs } from "./types";

/**
 * Client store for the Workload module.
 *
 * On load it asks /api/wl/snapshot for saved data. With a database configured
 * ("db" mode) every action is applied on screen straight away, then sent to
 * /api/wl/action, where the server applies the same rules to the stored data
 * and returns the result; the screen then shows what was saved. Data is also
 * refreshed every 20 s so queues stay current. Without a database ("demo"
 * mode) the sample data lives in memory and resets on reload.
 */
export type DataMode = "demo" | "db";

export type Dialog =
  | { kind: "task"; id: string }
  | { kind: "hold"; id: string }
  | { kind: "done"; id: string }
  | { kind: "assist"; offer: AssistOffer }
  | { kind: "endWork" }
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
  setHolidayWork: (code: "RTO" | "WFH" | null) => void;
  /** Switch to another team this person can open (reloads its data). */
  setTeam: (id: string) => void;
  setSys: (v: string) => void;
  setTr: (v: string) => void;
  dialog: Dialog;
  setDialog: (d: Dialog) => void;
}

const Ctx = createContext<Store | null>(null);

const REFRESH_MS = 20_000;
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
  const q = () => (teamRef.current ? "?team=" + encodeURIComponent(teamRef.current) : "");
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [viewAs, setViewAsState] = useState<ViewAs>("admin");
  const [sys, setSysState] = useState("all");
  const [tr, setTr] = useState("all");
  const [now, setNow] = useState(nowMs);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [blocked, setBlocked] = useState("");
  const [session, setSession] = useState<{ id: number; email: string } | null>(null);

  const commit = useCallback((d: WorkloadData) => {
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
      const r = await fetch("/api/wl/snapshot" + q(), { cache: "no-store" });
      if (r.status === 401) return toLogin();
      const j = await r.json();
      if (r.status === 403 && j.code !== "team") return toLogin("/change-password");
      if (j.mode === "db" && !pending.current) commit(j.data);
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
        if (j.mode === "db") [next, saved] = ["db", j.data];
        else if (j.mode === "error") toast("The database couldn’t be reached, so this is sample data. Changes won’t be saved.");
      } catch {}
      if (!live) return;
      if (next === "db") setRealClock();
      modeRef.current = next;
      setMode(next);
      commit(saved ?? initialData(nowMs()));
    })();
    return () => {
      live = false;
    };
  }, [commit, toast]);

  // Clock tick, plus a refresh of saved data so queues stay current.
  useEffect(() => {
    const tick = setInterval(() => setNow(nowMs()), 30_000);
    const poll = setInterval(refresh, REFRESH_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    try {
      const v = localStorage.getItem("wfm.viewAs");
      if (v === "admin" || v === "employee") setViewAsState(v);
    } catch {}
  }, []);

  const run = useCallback(
    (action: Action) => {
      if (!dataRef.current) return;
      const local = applyAction(dataRef.current, action, nowMs());
      commit(local.data);
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
    [commit, toast, refresh],
  );

  const setTeam = useCallback(
    async (id: string) => {
      if (modeRef.current !== "db" || id === teamRef.current) return;
      try {
        localStorage.setItem(TEAM_KEY, id);
      } catch {}
      const r = await fetch("/api/wl/snapshot?team=" + encodeURIComponent(id), { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast(j.error || "That team couldn’t be opened.");
      setSysState("all");
      setTr("all");
      commit(j.data);
    },
    [commit, toast],
  );

  const setHolidayWork = useCallback(
    async (code: "RTO" | "WFH" | null) => {
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

  const setViewAs = useCallback((v: ViewAs) => {
    setViewAsState(v);
    try {
      localStorage.setItem("wfm.viewAs", v);
    } catch {}
  }, []);

  const value = useMemo<Store | null>(
    () => data && mode && ({
      data,
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
          : person(viewAs === "employee" ? EMPLOYEE_ID : ADMIN_ID)!,
      isAdmin: mode === "db" ? !!session && data.admins.includes(session.id) : viewAs !== "employee",
      canUpload: mode === "db" ? !!session && canUpload(data, session.id) : viewAs !== "employee",
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
    }),
    [data, mode, now, run, toast, toasts, viewAs, setViewAs, sys, tr, dialog, session, setTeam, setHolidayWork],
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
