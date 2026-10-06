"use client";

import Link from "next/link";
import { AhtPanels, useAht } from "@/components/AhtPanels";
import { DateRangePicker, useStoredRange } from "@/components/DateRangePicker";
import { Blueprint, Icon, Kpi, PageHead } from "@/components/ui";
import { dayKey, dur } from "@/lib/workload/clock";
import { fteStats, perContract, perTicket, vsExpected, type AhtRow, type FteRow } from "@/lib/workload/aht";
import { cxOn } from "@/lib/workload/engine";
import { downloadSheets } from "@/lib/workload/excel";
import { rangeLabel, rangeMs, todayRange } from "@/lib/workload/period";
import { useWorkload } from "@/lib/workload/store";
import { usePeriodInput } from "@/lib/workload/usePeriodInput";

const t = (ms: number | null) => (ms === null ? "—" : dur(ms));
const min = (ms: number | null) => (ms === null ? null : Math.round(ms / 60000));

/**
 * Average handling time: time worked per ticket and per contract (time pending and time
 * away excluded) by member, trade, task type and complexity level. Same dates as the Dashboard.
 */
export default function AhtPage() {
  const { data, now, toast } = useWorkload();
  const [rg, setRg] = useStoredRange("perf", todayRange(now));
  const r = rg ?? todayRange(now);
  const [from, to] = rangeMs(r);
  const { input, error } = usePeriodInput(from, to);
  const d = input ? { ...data, activities: input.activities } : data;
  const st = useAht(d, from, Math.min(to, now + 1));
  const on = cxOn(data.settings);
  const fte = fteStats(d, from, Math.min(to, now + 1), now);
  const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
  const label = rangeLabel(r, now);

  const download = async () => {
    const head = ["Tickets", "Contracts", "AHT / ticket (min)", "AHT / contract (min)", "Time vs expected (%)", "Questions"];
    const rows = (rs: AhtRow[]) => rs.map((x) => [x.name, x.tickets, x.contracts, min(perTicket(x)), min(perContract(x)), vsExpected(x), x.slow]);
    try {
      await downloadSheets(`AHT_${data.org.team.name.replace(/[^A-Za-z0-9]+/g, "-")}_${r.from}_${r.to}.xlsx`, [
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
        {
          name: "FTE",
          rows: [
            ["System › Trade", "Tickets received", "AHT / ticket (min)", "Work (h)", `FTE needed (${fte.prodH} h × ${fte.days} days)`, "FTE allocated", "Gap (allocated − needed)"],
            ...fte.rows.concat(fte.total).map((x) => [x.name, x.received, min(x.ahtMs), +x.workH.toFixed(1), +x.need.toFixed(2), +x.have.toFixed(2), +(x.have - x.need).toFixed(2)]),
          ],
        },
      ]);
    } catch {
      toast("The export couldn’t be created. Try again.");
    }
  };

  return (
    <>
      <PageHead
        title={`Average handling time · ${data.org.team.name}`}
        sub={
          <>
            Time worked on resolved tickets, per ticket and per contract. The dates are shared with the <Link href="/workload/dashboard">Dashboard</Link>, which shows the
            same figures.
          </>
        }
      />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <DateRangePicker value={r} onChange={setRg} today={dayKey(now)} id="aht" />
        <button className="btn btn-secondary btn-36" onClick={download} disabled={!st.total.tickets}>
          <Icon name="download" size={16} />
          Download Excel
        </button>
      </div>
      {error && <Blueprint className="panel">{error}</Blueprint>}
      <div className="grid-kpi">
        <Kpi k="Tickets resolved" v={st.total.tickets} m={label} />
        <Kpi k="Contracts" v={st.total.contracts} m={on ? "complexity counts, else the contracts field" : "from the contracts field (1 when blank)"} />
        <Kpi k="AHT per ticket" v={t(perTicket(st.total))} m="time worked ÷ tickets" />
        <Kpi k="AHT per contract" v={t(perContract(st.total))} m="time worked ÷ contracts" />
      </div>
      <AhtPanels st={st} />
      <FteTable rows={fte.rows} total={fte.total} days={fte.days} prodH={fte.prodH} f1={f1} />
    </>
  );
}

/** FTE needed per trade from the demand and AHT, against the members allocated. */
function FteTable({ rows, total, days, prodH, f1 }: { rows: FteRow[]; total: FteRow; days: number; prodH: number; f1: (n: number) => string }) {
  const row = (x: FteRow, bold = false) => {
    const gap = x.have - x.need;
    return (
      <tr key={x.key} style={bold ? { fontWeight: 600 } : undefined}>
        <td>{x.name}</td>
        <td style={{ textAlign: "right" }}>{x.received}</td>
        <td className="nowrap" style={{ textAlign: "right" }}>
          {t(x.ahtMs)}
          {!x.ahtOwn && x.ahtMs !== null && <span className="small"> (team)</span>}
        </td>
        <td style={{ textAlign: "right" }}>{f1(x.workH)} h</td>
        <td style={{ textAlign: "right" }}>{f1(x.need)}</td>
        <td style={{ textAlign: "right" }}>{f1(x.have)}</td>
        <td style={{ textAlign: "right", color: gap < -0.05 ? "#b3261e" : gap > 0.05 ? "var(--color-accent-800)" : undefined }}>
          {gap > 0.05 ? "+" : ""}
          {f1(gap)}
        </td>
      </tr>
    );
  };
  return (
    <Blueprint as="section" className="panel" style={{ gap: 10 }}>
      <div className="chart-head">
        <h2 className="h2">FTE needed</h2>
        <span className="small">
          FTE needed = tickets received × AHT per ticket ÷ ({prodH} productive h × {days} working day{days === 1 ? "" : "s"})
        </span>
      </div>
      {rows.length ? (
        <div className="boxed-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>System › Trade</th>
                <th style={{ textAlign: "right" }}>Received</th>
                <th style={{ textAlign: "right" }}>AHT / ticket</th>
                <th style={{ textAlign: "right" }}>Work</th>
                <th style={{ textAlign: "right" }}>FTE needed</th>
                <th style={{ textAlign: "right" }}>FTE allocated</th>
                <th style={{ textAlign: "right" }}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => row(x))}
              {rows.length > 1 && row(total, true)}
            </tbody>
          </table>
        </div>
      ) : (
        <span className="small">No tickets received or members allocated in this period.</span>
      )}
      <span className="small">
        Allocated: members in each trade (someone in two trades counts ½ in each). Gap: allocated − needed; red means short of people. Trades with no resolved
        tickets in the period use the team’s AHT. Productive hours per day come from Targets.
      </span>
    </Blueprint>
  );
}
