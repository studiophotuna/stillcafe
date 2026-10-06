"use client";

import Link from "next/link";
import { useState } from "react";
import { Seg } from "@/components/calendar/bits";
import { Blueprint, Icon, Kpi, PageHead } from "@/components/ui";
import {
  ROLE_NAME,
  ROLE_ORDER,
  STANDARD,
  billingOf,
  businessCase,
  type BcLine,
  type BcMonth,
} from "@/lib/workload/business";
import { dayKey } from "@/lib/workload/clock";
import { downloadSheets } from "@/lib/workload/excel";
import { useWorkload } from "@/lib/workload/store";
import type { Billing } from "@/lib/workload/types";

const MON = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const monName = (ym: string) =>
  `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/**
 * Business case: the team's billing on a fixed basis (billed FTE × monthly rate per role,
 * from Calendar › Headcount) against unit pricing (transactions × the agreed price per task
 * type), month by month. The team's billing mode says which one it bills on.
 */
export default function BusinessCasePage() {
  const { data, run, now, toast } = useWorkload();
  const b = billingOf(data);
  const set = (patch: Partial<Billing>) =>
    run({ type: "setSettings", patch: { billing: { ...b, ...patch } } });
  const today = dayKey(now);
  const year = data.hc?.year ?? Number(today.slice(0, 4));
  const upTo =
    year === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) : 12;
  const bc = businessCase(data, year, upTo);
  const [open, setOpen] = useState<string | null>(null);
  const money = (n: number, dp = 2) =>
    `${n < -0.0049 ? "−" : ""}${b.currency} ${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const big = (n: number, sign = false) => (
    <span
      style={{ fontSize: "clamp(20px, 2.1vw, 28px)", overflowWrap: "anywhere" }}
    >
      {sign && n > 0.0049 ? "+" : ""}
      {money(n, Math.abs(n) >= 1000 ? 0 : 2)}
    </span>
  );
  const qty = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const numFields = data.fields.filter((f) => f.type === "number");
  const unitLabel =
    b.unit === "tasks"
      ? "tickets"
      : (
          data.fields.find((f) => f.key === b.unit)?.label ?? b.unit
        ).toLowerCase();
  const types = [
    { id: STANDARD, name: "Standard request (no task type)" },
    ...(data.settings.taskTypes ?? []).map((t) => ({ id: t.id, name: t.name })),
  ];
  const billed = b.mode === "unit" ? bc.total.unit : bc.total.fixed;
  const other = b.mode === "unit" ? bc.total.fixed : bc.total.unit;
  const diff = bc.total.unit - bc.total.fixed;
  const pct =
    bc.total.fixed > 0 ? Math.round((diff / bc.total.fixed) * 1000) / 10 : null;
  const ytd = upTo < 12 ? `Jan–${MON[upTo - 1]} ${year}` : String(year);

  const rateInput = (
    id: string,
    value: number | undefined,
    save: (v: number | undefined) => void,
    label: string,
  ) => (
    <input
      id={id}
      key={String(value)}
      aria-label={label}
      className="input"
      type="number"
      min={0}
      step="0.01"
      defaultValue={value ?? ""}
      placeholder="Not set"
      style={{ width: 120, textAlign: "right" }}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        const v = raw === "" ? undefined : Math.max(0, Number(raw));
        if (v !== undefined && !Number.isFinite(v)) return;
        if (v !== value) save(v);
      }}
    />
  );
  const setRole = (role: string, v: number | undefined) => {
    const r = { ...b.roleRates } as Record<string, number>;
    if (v === undefined) delete r[role];
    else r[role] = v;
    set({ roleRates: r });
  };
  const setType = (id: string, v: number | undefined) => {
    const r = { ...b.unitRates };
    if (v === undefined) delete r[id];
    else r[id] = v;
    set({ unitRates: r });
  };

  const download = async () => {
    const lines = (m: BcMonth, ls: BcLine[], kind: string) =>
      ls.map((l) => [monName(m.ym), kind, l.name, l.qty, l.rate, l.amount]);
    try {
      await downloadSheets(
        `Business-case_${data.org.team.name.replace(/[^A-Za-z0-9]+/g, "-")}_${year}.xlsx`,
        [
          {
            name: "Summary",
            rows: [
              [
                "Month",
                "Billed FTE",
                `Fixed (${b.currency})`,
                `Transactions (${unitLabel})`,
                `Unit (${b.currency})`,
                `Unit − fixed (${b.currency})`,
                "Bills on",
              ],
              ...bc.months.map((m) => [
                monName(m.ym),
                m.fte,
                m.fixed,
                m.units,
                m.unit,
                Math.round((m.unit - m.fixed) * 100) / 100,
                b.mode === "unit" ? "Unit" : "Fixed",
              ]),
              [
                "Total",
                bc.total.fte,
                bc.total.fixed,
                bc.total.units,
                bc.total.unit,
                Math.round(diff * 100) / 100,
                "",
              ],
            ],
          },
          {
            name: "Detail",
            rows: [
              [
                "Month",
                "Model",
                "Role / task type",
                "FTE / transactions",
                `Rate (${b.currency})`,
                `Amount (${b.currency})`,
              ],
              ...bc.months.flatMap((m) => [
                ...lines(m, m.roles, "Fixed"),
                ...lines(m, m.types, "Unit"),
              ]),
            ],
          },
        ],
      );
    } catch {
      toast("The export couldn’t be created. Try again.");
    }
  };

  return (
    <>
      <PageHead
        title={`Business case · ${data.org.team.name}`}
        sub={
          <>
            Fixed billing (billed FTE × the monthly rate for each role, from{" "}
            <Link href="/calendar/admin/headcount">Headcount</Link>) side by
            side with unit pricing (transactions × the agreed price per task
            type). The team bills on the model you choose; the other is shown
            for comparison. Rates are visible to Workload admins only.
          </>
        }
      />
      <div className="grid-2">
        <Blueprint as="section" className="panel" style={{ gap: 14 }}>
          <h2 className="h2">Billing</h2>
          <div className="field">
            <span style={{ fontSize: 12 }}>This team bills on</span>
            <Seg
              name="bc-mode"
              value={b.mode}
              options={[
                ["fixed", "Fixed (per role, per month)"],
                ["unit", "Unit pricing (per transaction)"],
              ]}
              onChange={(mode) => set({ mode })}
              style={{ flexWrap: "wrap", maxWidth: "100%" }}
            />
          </div>
          <div className="field">
            <label htmlFor="bc-cur">Currency</label>
            <input
              id="bc-cur"
              key={b.currency}
              className="input"
              maxLength={6}
              defaultValue={b.currency}
              style={{ width: 120, textTransform: "uppercase" }}
              onBlur={(e) => {
                const v = e.target.value.trim().toUpperCase();
                if (v && v !== b.currency) set({ currency: v });
                else e.target.value = b.currency;
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="bc-unit">One transaction is</label>
            <select
              id="bc-unit"
              className="input"
              value={b.unit}
              onChange={(e) => set({ unit: e.target.value })}
            >
              <option value="tasks">Each ticket</option>
              {numFields.map((f) => (
                <option key={f.key} value={f.key}>
                  Each of “{f.label}” in a ticket
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bc-when">
              Count transactions in the month they were
            </label>
            <select
              id="bc-when"
              className="input"
              value={b.when}
              onChange={(e) =>
                set({
                  when: e.target.value === "received" ? "received" : "resolved",
                })
              }
            >
              <option value="resolved">Resolved (resolved tickets only)</option>
              <option value="received">Received (every ticket received)</option>
            </select>
          </div>
        </Blueprint>
        <Blueprint as="section" className="panel" style={{ gap: 12 }}>
          <h2 className="h2">Agreed rates</h2>
          <div className="boxed-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Fixed: role</th>
                  <th style={{ textAlign: "right" }}>
                    Per FTE a month ({b.currency})
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROLE_ORDER.map((r) => (
                  <tr key={r}>
                    <td>{ROLE_NAME[r]}</td>
                    <td style={{ textAlign: "right" }}>
                      {rateInput(
                        "bc-r-" + r,
                        b.roleRates[r],
                        (v) => setRole(r, v),
                        `${ROLE_NAME[r]} monthly rate`,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="boxed-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Unit: task type</th>
                  <th style={{ textAlign: "right" }}>
                    Per transaction ({b.currency})
                  </th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id || "std"}>
                    <td>{t.name}</td>
                    <td style={{ textAlign: "right" }}>
                      {rateInput(
                        "bc-t-" + (t.id || "std"),
                        b.unitRates[t.id],
                        (v) => setType(t.id, v),
                        `${t.name} price`,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="small">
            Task types are set in{" "}
            <Link href="/workload/admin/sla">SLA &amp; task types</Link>. Billed
            FTE per person and month (team leads and above 0 unless overridden)
            comes from Headcount.
          </span>
        </Blueprint>
      </div>

      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 className="h2">{ytd}</h2>
        <button className="btn btn-secondary btn-36" onClick={download}>
          <Icon name="download" size={16} />
          Download Excel
        </button>
      </div>
      {(bc.unpricedRoles.length > 0 ||
        bc.unpricedTypes.length > 0 ||
        !data.hc) && (
        <Blueprint className="panel" style={{ gap: 4 }}>
          {!data.hc && (
            <span>
              Billed headcount isn’t available for this team, so the fixed model
              shows 0.
            </span>
          )}
          {bc.unpricedRoles.length > 0 && (
            <span>
              No monthly rate yet for{" "}
              {bc.unpricedRoles.map((r) => ROLE_NAME[r]).join(", ")}: their
              billed FTE is left out of the fixed total.
            </span>
          )}
          {bc.unpricedTypes.length > 0 && (
            <span>
              No price yet for {bc.unpricedTypes.join(", ")}: those transactions
              are left out of the unit total.
            </span>
          )}
        </Blueprint>
      )}
      <div className="grid-kpi">
        <Kpi
          k={`Billed · ${b.mode === "unit" ? "unit pricing" : "fixed"}`}
          v={big(billed)}
          m={`${ytd}; the other model: ${money(other)}`}
        />
        <Kpi
          k="Fixed"
          v={big(bc.total.fixed)}
          m={`${qty(bc.total.fte)} billed FTE-months`}
        />
        <Kpi
          k="Unit pricing"
          v={big(bc.total.unit)}
          m={`${qty(bc.total.units)} ${unitLabel} ${b.when}`}
        />
        <Kpi
          k="Unit − fixed"
          v={big(diff, true)}
          m={
            pct === null
              ? "no fixed amount to compare"
              : `${pct > 0 ? "+" : ""}${pct}% against fixed`
          }
        />
        <Kpi
          k="Fixed cost per transaction"
          v={bc.total.units ? big(bc.total.fixed / bc.total.units) : "—"}
          m="fixed ÷ transactions, to compare with the unit prices"
        />
      </div>
      <Blueprint as="section" className="panel" style={{ gap: 10 }}>
        <div className="chart-head">
          <h2 className="h2">By month</h2>
          <span className="small">
            Select a month for the breakdown by role and task type.
          </span>
        </div>
        <div className="boxed-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th style={{ textAlign: "right" }}>Billed FTE</th>
                <th style={{ textAlign: "right" }}>Fixed</th>
                <th style={{ textAlign: "right" }}>Transactions</th>
                <th style={{ textAlign: "right" }}>Unit pricing</th>
                <th style={{ textAlign: "right" }}>Unit − fixed</th>
              </tr>
            </thead>
            <tbody>
              {bc.months
                .slice()
                .reverse()
                .flatMap((m) => {
                  const d = m.unit - m.fixed;
                  const rows = [
                    <tr key={m.ym}>
                      <td className="nowrap">
                        <button
                          className="hc-name"
                          aria-expanded={open === m.ym}
                          onClick={() => setOpen(open === m.ym ? null : m.ym)}
                        >
                          {monName(m.ym)}
                        </button>
                      </td>
                      <td style={{ textAlign: "right" }}>{qty(m.fte)}</td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: b.mode === "fixed" ? 600 : undefined,
                        }}
                      >
                        {money(m.fixed)}
                      </td>
                      <td style={{ textAlign: "right" }}>{qty(m.units)}</td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: b.mode === "unit" ? 600 : undefined,
                        }}
                      >
                        {money(m.unit)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          color:
                            d < -0.005
                              ? "#b3261e"
                              : d > 0.005
                                ? "var(--color-accent-800)"
                                : undefined,
                        }}
                      >
                        {d > 0.005 ? "+" : ""}
                        {money(d)}
                      </td>
                    </tr>,
                  ];
                  if (open === m.ym)
                    rows.push(
                      <tr key={m.ym + "-d"}>
                        <td
                          colSpan={6}
                          style={{
                            background: "var(--color-neutral-50, #f6f7f9)",
                          }}
                        >
                          <div className="grid-2">
                            <Breakdown
                              title="Fixed by role"
                              unit="FTE"
                              lines={m.roles}
                              money={money}
                              qty={qty}
                            />
                            <Breakdown
                              title="Unit by task type"
                              unit={unitLabel}
                              lines={m.types}
                              money={money}
                              qty={qty}
                            />
                          </div>
                        </td>
                      </tr>,
                    );
                  return rows;
                })}
              <tr style={{ fontWeight: 600 }}>
                <td>Total</td>
                <td style={{ textAlign: "right" }}>{qty(bc.total.fte)}</td>
                <td style={{ textAlign: "right" }}>{money(bc.total.fixed)}</td>
                <td style={{ textAlign: "right" }}>{qty(bc.total.units)}</td>
                <td style={{ textAlign: "right" }}>{money(bc.total.unit)}</td>
                <td style={{ textAlign: "right" }}>
                  {diff > 0.005 ? "+" : ""}
                  {money(diff)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Blueprint>
    </>
  );
}

function Breakdown({
  title,
  unit,
  lines,
  money,
  qty,
}: {
  title: string;
  unit: string;
  lines: BcLine[];
  money: (n: number) => string;
  qty: (n: number) => string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <strong>{title}</strong>
      {lines.length ? (
        <table className="table">
          <tbody>
            {lines.map((l) => (
              <tr key={l.id || "std"}>
                <td>{l.name}</td>
                <td style={{ textAlign: "right" }} className="nowrap">
                  {qty(l.qty)} {unit} ×{" "}
                  {l.rate === null ? (
                    <span className="muted">no rate</span>
                  ) : (
                    money(l.rate)
                  )}
                </td>
                <td style={{ textAlign: "right" }} className="nowrap">
                  {money(l.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <span className="small">Nothing this month.</span>
      )}
    </div>
  );
}
