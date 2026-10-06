"use client";

import Link from "next/link";
import { useState } from "react";
import { Seg } from "@/components/calendar/bits";
import { adminSections, type AdminFlags } from "@/components/adminNav";
import { Blueprint, Icon } from "@/components/ui";
import { useCalView } from "@/lib/calendar/useCalView";

const ABOUT: Record<string, string> = {
  "/calendar/admin/approvals": "Leave and schedule requests waiting for you",
  "/calendar/admin/members":
    "Add, edit and allocate people; roles and approvers",
  "/calendar/admin/schedules":
    "Change schedules, update several people, upload a schedule",
  "/calendar/admin/settings":
    "Approval mode, notifications, leave rules and team admins",
  "/calendar/dashboard": "Attendance today and this month, attendance summary",
  "/calendar/management": "Leads, managers and directors across towers",
  "/calendar/admin/reports": "Attendance, leave, schedule and summary reports",
  "/calendar/admin/headcount": "Headcount by month, cost centre and role",
  "/calendar/admin/shifts": "Shift times and buckets",
  "/calendar/admin/holidays": "Holidays by department, tower or team",
  "/calendar/admin/organization":
    "Departments, towers, teams, systems and trades; payroll cut-offs",
  "/workload/dashboard": "Productivity, timeliness and handling time",
  "/workload/admin/queue": "Assign, re-prioritise and share out tickets",
  "/workload/overtime": "Overtime to approve",
  "/workload/breaks": "Breaks over the allowance",
  "/workload/admin/aht": "Handling time and FTE needed",
  "/workload/admin/complexity": "Complexity levels and tickets to review",
  "/workload/admin/intake": "Mailbox and uploads",
  "/workload/admin/allocation": "How tasks are given out",
  "/workload/admin/sla": "SLA by priority and task types",
  "/workload/admin/targets": "Working time and productivity targets",
  "/workload/admin/fields": "Fields on each ticket",
  "/workload/admin/business": "Fixed billing against unit pricing; agreed rates",
  "/calendar/admin/ot-tracker": "Weekly and monthly overtime per team, with remarks",
  "/calendar/admin/kpi-tracker": "Utilization, productivity, timeliness and accuracy per team",
  "/calendar/admin/accuracy": "Issues with root cause, preventive and corrective actions",
};

/** The Admin area's home: every admin function, grouped, with what's waiting. */
export default function AdminHome() {
  const v = useCalView();
  const flags: AdminFlags = {
    canApprove: v.canApprove,
    teamAdmin: v.isAdmin,
    anyAdmin: v.anyAdmin,
    leader: v.isLeader,
    wlAdmin: v.anyAdmin,
    wlApprover: v.isLeader || v.anyAdmin,
    pricing:
      !!v.meP.sysAdmin ||
      v.meP.level === "manager" ||
      v.meP.level === "director",
    badges: { approvals: v.pendingCount },
  };
  // Filters: find a function by name or description, one area, or only what's waiting.
  const [q, setQ] = useState("");
  const [area, setArea] = useState("all");
  const [waiting, setWaiting] = useState(false);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = adminSections(flags).map((sec) => ({
    ...sec,
    items: sec.items.filter((n) => n.href !== "/calendar/admin"),
  }));
  const shown = all
    .filter((sec) => area === "all" || sec.title === area)
    .map((sec) => ({
      ...sec,
      items: sec.items.filter(
        (n) =>
          (!waiting || !!n.badge) &&
          words.every((w) =>
            `${n.label} ${ABOUT[n.href] ?? ""} ${sec.title}`
              .toLowerCase()
              .includes(w),
          ),
      ),
    }))
    .filter((sec) => sec.items.length);
  return (
    <>
      <div className="page-head">
        <h1>Admin</h1>
        <span>
          Everything for managing people and work in one place. Calendar and
          Workload keep the everyday pages.
        </span>
      </div>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <input
          className="input"
          type="search"
          aria-label="Find an admin function"
          placeholder="Find, e.g. leave, overtime, shifts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 280, maxWidth: "100%" }}
        />
        {all.length > 1 && (
          <Seg
            name="hub-area"
            value={area}
            options={[
              ["all", "All"],
              ...all.map((sec): [string, string] => [sec.title, sec.title]),
            ]}
            onChange={setArea}
            style={{ flexWrap: "wrap", maxWidth: "100%" }}
          />
        )}
        <label className="check-row" style={{ alignItems: "center" }}>
          <input
            type="checkbox"
            className="check"
            checked={waiting}
            onChange={() => setWaiting(!waiting)}
          />
          <span>Only what’s waiting for me</span>
        </label>
      </div>
      {!shown.length && (
        <Blueprint className="panel">
          <span>
            {waiting && !words.length
              ? "Nothing is waiting for you."
              : "No admin function matches."}{" "}
            <button
              className="btn btn-ghost"
              onClick={() => {
                setQ("");
                setArea("all");
                setWaiting(false);
              }}
            >
              Clear filters
            </button>
          </span>
        </Blueprint>
      )}
      {shown.map((sec) => (
        <Blueprint
          as="section"
          key={sec.title}
          className="panel"
          style={{ gap: 12 }}
        >
          <h2 className="h2">{sec.title}</h2>
          <div className="admin-hub">
            {sec.items.map((n) => (
              <Link key={n.href} href={n.href} className="admin-hub-card">
                <Icon name={n.icon} />
                <span>
                  <strong>
                    {n.label}
                    {!!n.badge && (
                      <span
                        className="tag tag-accent"
                        style={{ marginLeft: 8 }}
                      >
                        {n.badge}
                      </span>
                    )}
                  </strong>
                  <span className="small">{ABOUT[n.href] ?? ""}</span>
                </span>
              </Link>
            ))}
          </div>
        </Blueprint>
      ))}
    </>
  );
}
