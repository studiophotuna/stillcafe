"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Seg } from "@/components/calendar/bits";
import { Blueprint, Icon, Kpi, PageHead } from "@/components/ui";
import { H, TZ_OFFSET_H, dayKey, dur } from "@/lib/workload/clock";

const D = 24 * H;
import { ahtStats, perContract, perTicket, vsExpected, type AhtRow } from "@/lib/workload/aht";
import { cxOn } from "@/lib/workload/engine";
import { downloadSheets } from "@/lib/workload/excel";
import { useWorkload } from "@/lib/workload/store";

type Span = "today" | "7" | "30";
const SPANS: [Span, string][] = [
  ["today", "Today"],
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
];
const t = (ms: number | null) => (ms === null ? "—" : dur(ms));
const min = (ms: number | null) => (ms === null ? null : Math.round(ms / 60000));

/**
 * Average handling time: time worked per ticket and per contract (breaks and time on hold
 * excluded) by member, trade, task type and complexity level, with the level's set AHT
 * next to the actual one.
 */
export default function AhtPage() {
  const { data, run, now, toast } = useWorkload();
  const [span, setSpan] = useState<Span>("7");
  // Days start at midnight team time; "Last 7 days" includes today.
  const dayStart = now - ((now + TZ_OFFSET_H * H) % D);
  const from = span === "today" ? dayStart : dayStart - (Number(span) - 1) * D;
  const st = useMemo(() => ahtStats(data, from, now + 1), [data, from, now]);
  const cx = data.settings.complexity;
  const on = cxOn(data.settings);
  const label = SPANS.find(([k]) => k === span)![1];

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
                    <td className="nowrap" style={{ textAlign: "right" }}>{t(perTicket(r))}</td>
                    <td className="nowrap" style={{ textAlign: "right" }}>{t(perContract(r))}</td>
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
        <div className="banner">No tickets done in this period.</div>
      )}
    </Blueprint>
  );

  const download = async () => {
    const head = ["Tickets", "Contracts", "AHT / ticket (min)", "AHT / contract (min)", "Time vs expected (%)", "Questions"];
    const rows = (rs: AhtRow[]) => rs.map((r) => [r.name, r.tickets, r.contracts, min(perTicket(r)), min(perContract(r)), vsExpected(r), r.slow]);
    try {
      await downloadSheets(`AHT_${data.org.team.name.replace(/[^A-Za-z0-9]+/g, "-")}_${dayKey(from)}_${dayKey(now)}.xlsx`, [
        ...(on
          ? [
              {
                name: "Complexity",
                rows: [
                  ["Level", "Set AHT (min)", "Actual AHT / contract (min)", "Contracts", "Tickets"],
                  ...st.levels.map(({ level, row }) => [level.name, level.aht ?? null, min(perContract(row)), row.contracts, row.tickets]),
                ],
              },
            ]
          : []),
        { name: "Members", rows: [["Member", ...head], ...rows(st.members)] },
        { name: "Trades", rows: [["System › Trade", ...head], ...rows(st.trades)] },
        { name: "Task types", rows: [["Task type", ...head], ...rows(st.types)] },
      ]);
    } catch {
      toast("The export couldn’t be created. Try again.");
    }
  };

  return (
    <>
      <PageHead
        title={`Average handling time · ${data.org.team.name}`}
        sub="Time worked on done tickets (start to done, minus time pending and breaks, meetings and other time away), per ticket and per contract."
      />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Seg name="aht-span" value={span} options={SPANS} onChange={setSpan} />
        <button className="btn btn-secondary btn-36" onClick={download} disabled={!st.total.tickets}>
          <Icon name="download" size={16} />
          Download Excel
        </button>
      </div>
      <div className="grid-kpi">
        <Kpi k="Tickets done" v={st.total.tickets} m={label.toLowerCase()} />
        <Kpi k="Contracts" v={st.total.contracts} m={on ? "complexity counts, else the contracts field" : "from the contracts field (1 when blank)"} />
        <Kpi k="AHT per ticket" v={t(perTicket(st.total))} m="time worked ÷ tickets" />
        <Kpi k="AHT per contract" v={t(perContract(st.total))} m="time worked ÷ contracts" />
      </div>

      {on ? (
        <Blueprint as="section" className="panel" style={{ gap: 10 }}>
          <h2 className="h2">By complexity</h2>
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
      ) : (
        <div className="banner">
          Complexity is off, so AHT is shown per ticket and per contract only. Switch it on in <Link href="/workload/admin/complexity">Complexity</Link> to see AHT by level.
        </div>
      )}

      {table("By member", st.members, "Member", on)}
      <div className="grid-2">
        {table("By trade", st.trades, "System › Trade", false)}
        {table("By task type", st.types, "Task type", false)}
      </div>
      <span className="small">
        Time vs expected: time worked on tickets tagged with complexity ÷ the time their levels’ AHT implies (100% = as expected). Questions: tickets still waiting for an
        admin’s check.
      </span>
    </>
  );
}
