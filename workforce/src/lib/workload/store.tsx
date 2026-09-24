"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { nowMs } from "./clock";
import { ADMIN_ID, EMPLOYEE_ID, FIELDS0, person } from "./constants";
import type { Outcome, WorkloadData } from "./engine";
import { seedTasks } from "./seed";
import type { Person, Toast, ViewAs } from "./types";

/**
 * Client-side store for the Workload module. Data lives in memory and resets
 * on reload; swap `initialData` / `run` for Supabase queries and RPCs when the
 * backend is added (see supabase/migrations).
 */
function initialData(): WorkloadData {
  return {
    tasks: seedTasks(nowMs()),
    fields: FIELDS0.map((f) => ({ ...f })),
    settings: {
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
    },
    seq: 2000,
    mailCount: 0,
  };
}

export type Dialog =
  | { kind: "task"; id: string }
  | { kind: "hold"; id: string }
  | { kind: "done"; id: string }
  | null;

interface Store {
  data: WorkloadData;
  now: number;
  /** Apply an engine action; its message (if any) is shown as a toast. */
  run: (fn: (d: WorkloadData, now: number) => Outcome) => void;
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

export function WorkloadProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState(initialData);
  const dataRef = useRef(data);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [viewAs, setViewAsState] = useState<ViewAs>("admin");
  const [sys, setSysState] = useState("all");
  const [tr, setTr] = useState("all");
  const [now, setNow] = useState(nowMs);
  const [dialog, setDialog] = useState<Dialog>(null);

  // Clock tick so waiting times, "started … ago" and metrics stay current.
  useEffect(() => {
    const iv = setInterval(() => setNow(nowMs()), 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    try {
      const v = localStorage.getItem("wfm.viewAs");
      if (v === "admin" || v === "employee") setViewAsState(v);
    } catch {}
  }, []);

  const toast = useCallback((text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => t.concat({ id, text }));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const run = useCallback(
    (fn: (d: WorkloadData, now: number) => Outcome) => {
      const t = nowMs();
      const o = fn(dataRef.current, t);
      dataRef.current = o.data;
      setData(o.data);
      setNow(t);
      if (o.message) toast(o.message);
    },
    [toast],
  );

  const setViewAs = useCallback((v: ViewAs) => {
    setViewAsState(v);
    try {
      localStorage.setItem("wfm.viewAs", v);
    } catch {}
  }, []);

  const value = useMemo<Store>(
    () => ({
      data,
      now,
      run,
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
    [data, now, run, toast, toasts, viewAs, setViewAs, sys, tr, dialog],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkload() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useWorkload must be used inside WorkloadProvider");
  return s;
}
