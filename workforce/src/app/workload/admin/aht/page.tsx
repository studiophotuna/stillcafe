"use client";

import Link from "next/link";
import { AhtPanels, useAht } from "@/components/AhtPanels";
import { DateRangePicker, useStoredRange } from "@/components/DateRangePicker";
import { Blueprint, Icon, Kpi, PageHead } from "@/components/ui";
import { dayKey, dur } from "@/lib/workload/clock";
import { perContract, perTicket, vsExpected, type AhtRow } from "@/lib/workload/aht";
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
    </>
  );
}
