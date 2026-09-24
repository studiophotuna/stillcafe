"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyAction, type Action } from "./actions";
import { nowMs, setRealClock } from "./clock";
import { ADMIN_ID, EMPLOYEE_ID, person } from "./constants";
import type { WorkloadData } from "./engine";
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
  setViewAs: (v: ViewAs) => void;
  me: Person;
  isAdmin: boolean;
  sys: string;
  tr: string;
  setSys: (v: string) => void;
  setTr: (v: string) => void;
  dialog: Dialog;
  setDialog: (d: Dialog) => void;
}

const Ctx = createContext<Store | null>(null);

const REFRESH_MS = 20_000;

export function WorkloadProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkloadData | null>(null);
  const dataRef = useRef<WorkloadData | null>(null);
  const [mode, setMode] = useState<DataMode | null>(null);
  const modeRef = useRef<DataMode | null>(null);
  const pending = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [viewAs, setViewAsState] = useState<ViewAs>("admin");
  const [sys, setSysState] = useState("all");
  const [tr, setTr] = useState("all");
  const [now, setNow] = useState(nowMs);
  const [dialog, setDialog] = useState<Dialog>(null);

  const commit = useCallback((d: WorkloadData) => {
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
      const r = await fetch("/api/wl/snapshot", { cache: "no-store" });
      const j = await r.json();
      if (j.mode === "db" && !pending.current) commit(j.data);
    } catch {}
  }, [commit]);

  // Decide the mode once: saved data if the server has a database, else sample data.
  useEffect(() => {
    let live = true;
    (async () => {
      let next: DataMode = "demo";
      let saved: WorkloadData | null = null;
      try {
        const r = await fetch("/api/wl/snapshot", { cache: "no-store" });
        const j = await r.json();
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
      if (modeRef.current !== "db") {
        if (local.message) toast(local.message);
        return;
      }
      pending.current++;
      // Send actions one at a time, in order.
      queue.current = queue.current.then(async () => {
        try {
          const r = await fetch("/api/wl/action", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(action),
          });
          const j = await r.json().catch(() => ({}));
          pending.current--;
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
      setViewAs,
      me: person(viewAs === "employee" ? EMPLOYEE_ID : ADMIN_ID)!,
      isAdmin: viewAs !== "employee",
      sys,
      tr,
      setSys: (v: string) => {
        setSysState(v);
        setTr("all");
      },
      setTr,
      dialog,
      setDialog,
    }),
    [data, mode, now, run, toast, toasts, viewAs, setViewAs, sys, tr, dialog],
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
