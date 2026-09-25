"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadMe, toLogin } from "../session";
import { dayKey, fmtT, nowMs, setRealClock } from "../workload/clock";
import type { Toast, ViewAs } from "../workload/types";
import { applyCalAction, type CalAction } from "./actions";
import { ADMIN_ID, EMPLOYEE_ID } from "./constants";
import { Cal } from "./engine";
import { initialCalendar } from "./seed";
import type { CalendarData } from "./types";

/**
 * Client store for the Calendar. Same model as the Workload store: with a
 * database, actions apply on screen at once, then /api/cal/action re-applies
 * them to the saved calendar and returns what was saved; data refreshes every
 * 20 s. Without one, the sample calendar lives in memory.
 */
export type DataMode = "demo" | "db";

/** Temporary passwords just created, shown once to the admin. */
export interface Issued {
  name: string;
  email: string;
  password: string;
}

export interface Sel {
  /** Management view: a tower id, or "all". */
  mTower: string;
  dept: string;
  branch: string;
  system: string;
  trade: string;
}

export type CalDialog =
  | { kind: "request"; date?: string }
  | { kind: "cell"; pid: number; date: string }
  | { kind: "resign"; pid: number }
  | { kind: "member"; pid: number | null }
  | { kind: "node"; mode: "add" | "rename"; id?: string; ntype: import("./types").NodeType; parent?: string | null }
  | { kind: "del"; id: string }
  | { kind: "shift"; orig: string | null }
  | { kind: "hol"; id: string | null }
  | { kind: "upload"; mode: "members" | "schedule" }
  | { kind: "checkin"; pid: number; evId: string }
  | { kind: "event" }
  | { kind: "orgImport" }
  | { kind: "nodeAdmins"; id: string }
  | null;

interface Store {
  data: CalendarData;
  cal: Cal;
  today: string;
  now: number;
  mode: DataMode;
  run: (a: CalAction) => void;
  toast: (t: string) => void;
  toasts: Toast[];
  viewAs: ViewAs;
  /** Only with sample data; signed-in people are who they signed in as. */
  setViewAs?: (v: ViewAs) => void;
  me: number;
  issued: Issued[];
  showIssued: (list: Issued[]) => void;
  sel: Sel;
  setSel: (p: Partial<Sel>) => void;
  y: number;
  m: number;
  setMonth: (y: number, m: number) => void;
  dialog: CalDialog;
  setDialog: (d: CalDialog) => void;
  nowLabel: () => string;
}

const Ctx = createContext<Store | null>(null);
const REFRESH_MS = 20_000;

export function CalendarProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<CalendarData | null>(null);
  const dataRef = useRef<CalendarData | null>(null);
  const [mode, setMode] = useState<DataMode | null>(null);
  const modeRef = useRef<DataMode | null>(null);
  const pending = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [viewAs, setViewAsState] = useState<ViewAs>("admin");
  const [sel, setSelState] = useState<Sel>({ dept: "bss", branch: "rm", system: "all", trade: "all", mTower: "all" });
  const [now, setNow] = useState(nowMs);
  const [ym, setYm] = useState(() => {
    const [y, m] = dayKey(nowMs()).split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [dialog, setDialog] = useState<CalDialog>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [issued, setIssued] = useState<Issued[]>([]);

  const commit = useCallback((d: CalendarData) => {
    dataRef.current = d;
    setData(d);
    setNow(nowMs());
  }, []);

  const toast = useCallback((text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => t.concat({ id, text }));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const refresh = useCallback(async () => {
    if (modeRef.current !== "db" || pending.current) return;
    try {
      const r = await fetch("/api/cal/snapshot", { cache: "no-store" });
      if (r.status === 401 || r.status === 403) return toLogin(r.status === 403 ? "/change-password" : "/login");
      const j = await r.json();
      if (j.mode === "db" && !pending.current) commit(j.data);
    } catch {}
  }, [commit]);

  useEffect(() => {
    let live = true;
    (async () => {
      let next: DataMode = "demo";
      let saved: CalendarData | null = null;
      const who = await loadMe();
      if (!who || !live) return;
      if (!who.demo) setSessionId(who.personId);
      try {
        const r = await fetch("/api/cal/snapshot", { cache: "no-store" });
        if (r.status === 401 || r.status === 403) return toLogin(r.status === 403 ? "/change-password" : "/login");
        const j = await r.json();
        if (j.mode === "db") [next, saved] = ["db", j.data];
        else if (j.mode === "error") toast("The database couldn’t be reached, so this is sample data. Changes won’t be saved.");
      } catch {}
      if (!live) return;
      if (next === "db") setRealClock();
      modeRef.current = next;
      setMode(next);
      const t = dayKey(nowMs());
      const [y, m] = t.split("-").map(Number);
      setYm({ y, m: m - 1 });
      commit(saved ?? initialCalendar(t));
    })();
    return () => {
      live = false;
    };
  }, [commit, toast]);

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
    (action: CalAction) => {
      if (!dataRef.current) return;
      const t = nowMs();
      const local = applyCalAction(dataRef.current, action, dayKey(t), t);
      if (local.error) {
        toast(local.error);
        return;
      }
      commit(local.data);
      if (modeRef.current !== "db") {
        if (local.message) toast(local.message);
        return;
      }
      pending.current++;
      queue.current = queue.current.then(async () => {
        try {
          const r = await fetch("/api/cal/action", {
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
          if (!pending.current) commit(j.data);
          if (j.message) toast(j.message);
          if (j.issued?.length) setIssued((x) => x.concat(j.issued));
          (j.warnings ?? []).forEach((w: string) => toast(w));
        } catch {
          pending.current--;
          toast("That change couldn’t be saved. Check your connection.");
          await refresh();
        }
      });
    },
    [commit, toast, refresh],
  );

  const setViewAs = useCallback((v: ViewAs) => {
    setViewAsState(v);
    setSelState({ dept: "bss", branch: "rm", system: "all", trade: "all", mTower: "all" });
    try {
      localStorage.setItem("wfm.viewAs", v);
    } catch {}
  }, []);

  const today = dayKey(now);
  const cal = useMemo(() => (data ? new Cal(data, today) : null), [data, today]);

  const value = useMemo<Store | null>(
    () =>
      data && cal && mode
        ? {
            data,
            cal,
            today,
            now,
            mode,
            run,
            toast,
            toasts,
            viewAs,
            setViewAs: mode === "demo" ? setViewAs : undefined,
            me: mode === "db" && sessionId !== null ? sessionId : viewAs === "employee" ? EMPLOYEE_ID : ADMIN_ID,
            issued,
            showIssued: setIssued,
            sel,
            setSel: (p: Partial<Sel>) => setSelState((s) => ({ ...s, ...p })),
            y: ym.y,
            m: ym.m,
            setMonth: (y: number, m: number) => setYm({ y, m }),
            dialog,
            setDialog,
            nowLabel: () => fmtT(nowMs()),
          }
        : null,
    [data, cal, today, now, mode, run, toast, toasts, viewAs, setViewAs, sel, ym, dialog, sessionId, issued],
  );

  if (!value) return null;
  if (!value.cal.people.get(value.me)) return <NotLinked />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCalendar() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useCalendar must be used inside CalendarProvider");
  return s;
}

/** Signed in, but the calendar has no member with this sign-in (e.g. removed after the sign-in was made). */
function NotLinked() {
  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="dialog-title" style={{ fontSize: 26, margin: 0 }}>
          Your sign-in isn’t linked to a member
        </h1>
        <p className="auth-sub">Ask your team admin to add you under Members with this email address.</p>
        <button
          className="btn btn-secondary btn-40"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
            window.location.replace("/login");
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
