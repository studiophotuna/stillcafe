"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Blueprint } from "@/components/ui";
import { dur } from "@/lib/workload/clock";
import { ahtStats, perContract, perTicket, vsExpected, type AhtRow } from "@/lib/workload/aht";
import { cxOn, type WorkloadData } from "@/lib/workload/engine";
import { useWorkload } from "@/lib/workload/store";

const t = (ms: number | null) => (ms === null ? "—" : dur(ms));

/** The handling-time figures for [from, to): uses `d`'s tasks and time away. */
export function useAht(d: WorkloadData, from: number, to: number) {
  return useMemo(() => ahtStats(d, from, to), [d, from, to]);
}

/**
 * Average handling time tables (Dashboard and Admin › Handling time): per complexity
 * level against its set AHT, by member, by trade and by task type.
 */
export function AhtPanels({ st, trades = true }: { st: ReturnType<typeof ahtStats>; trades?: boolean }) {
  const { data, run, toast } = useWorkload();
  const cx = data.settings.complexity;
  const on = cxOn(data.settings);

  const setAht = (id: string, minutes: number) => {
    if (!cx) return;
    run({ type: "setSettings", patch: { complexity: { ...cx, levels: cx.levels.map((l) => (l.id === id ? { ...l, aht: minutes } : l)) } } });
  };

  const table = (title: string, rows: AhtRow[], first: string, withCheck: boolean) => (
    <Blueprint as="section" className="panel" style={{ gap: 10 }}>
      <h2 className="h2">{title}</h2>
      {rows.length ? (
        <div className="boxed-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{first}</th>
                <th style={{ textAlign: "right" }}>Tickets</th>
                <th style={{ textAlign: "right" }}>Contracts</th>
                <th style={{ textAlign: "right" }}>AHT / ticket</th>
                <th style={{ textAlign: "right" }}>AHT / contract</th>
                {withCheck && <th style={{ textAlign: "right" }}>Time vs expected</th>}
                {withCheck && <th style={{ textAlign: "right" }}>Questions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const vs = vsExpected(r);
                return (
                  <tr key={r.key}>
                    <td>{r.name}</td>
                    <td style={{ textAlign: "right" }}>{r.tickets}</td>
                    <td style={{ textAlign: "right" }}>{r.contracts}</td>
                    <td className="nowrap" style={{ textAlign: "right" }}>
                      {t(perTicket(r))}
                    </td>
                    <td className="nowrap" style={{ textAlign: "right" }}>
                      {t(perContract(r))}
                    </td>
                    {withCheck && (
                      <td style={{ textAlign: "right", fontWeight: vs !== null && vs > 100 + (cx?.tol ?? 50) ? 600 : 400 }}>{vs === null ? "—" : `${vs}%`}</td>
                    )}
                    {withCheck && <td style={{ textAlign: "right" }}>{r.slow || "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="banner">No tickets resolved in this period.</div>
      )}
    </Blueprint>
  );

  return (
    <>
      {on ? (
        <Blueprint as="section" className="panel" style={{ gap: 10 }}>
          <h2 className="h2">Handling time by complexity</h2>
          <span className="small">
            Actual AHT per contract of each level. A ticket with several levels shares its time across them by their set AHT. Use the actual AHT to update the level’s AHT
            (used to question tagging in <Link href="/workload/admin/complexity">Complexity</Link>).
          </span>
          <div className="boxed-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Level</th>
                  <th style={{ textAlign: "right" }}>Set AHT</th>
                  <th style={{ textAlign: "right" }}>Actual AHT / contract</th>
                  <th style={{ textAlign: "right" }}>Difference</th>
                  <th style={{ textAlign: "right" }}>Contracts</th>
                  <th style={{ textAlign: "right" }}>Tickets</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {st.levels.map(({ level, row }) => {
                  const act = perContract(row);
                  const actMin = act === null ? null : Math.max(1, Math.round(act / 60000));
                  const set = level.aht ?? 0;
                  const diff = act !== null && set ? Math.round((act / (set * 60000) - 1) * 100) : null;
                  return (
                    <tr key={level.id}>
                      <td style={{ fontWeight: 500 }}>{level.name}</td>
                      <td style={{ textAlign: "right" }}>{set ? `${set} min` : "—"}</td>
                      <td style={{ textAlign: "right" }}>{t(act)}</td>
                      <td style={{ textAlign: "right" }}>{diff === null ? "—" : `${diff > 0 ? "+" : ""}${diff}%`}</td>
                      <td style={{ textAlign: "right" }}>{row.contracts}</td>
                      <td style={{ textAlign: "right" }}>{row.tickets}</td>
                      <td style={{ textAlign: "right" }}>
                        {actMin !== null && actMin !== set && (
                          <button
                            className="btn btn-ghost"
                            onClick={() => {
                              setAht(level.id, actMin);
                              toast(`${level.name} AHT set to ${actMin} min.`);
                            }}
                          >
                            Use {actMin} min
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Blueprint>
      ) : null}
      {table("Handling time by member", st.members, "Member", on)}
      {trades && (
        <div className="grid-2">
          {table("Handling time by trade", st.trades, "System › Trade", false)}
          {table("Handling time by task type", st.types, "Task type", false)}
        </div>
      )}
      <span className="small">
        Time worked excludes time pending, breaks, meetings and other time away.{on ? " Time vs expected: time worked on tickets tagged with complexity ÷ the time their levels’ AHT implies (100% = as expected). Questions: tickets still waiting for an admin’s check." : ""}
      </span>
    </>
  );
}
