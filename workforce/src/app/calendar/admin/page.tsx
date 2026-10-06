"use client";

import Link from "next/link";
import { adminSections, type AdminFlags } from "@/components/adminNav";
import { Blueprint, Icon } from "@/components/ui";
import { useCalView } from "@/lib/calendar/useCalView";

const ABOUT: Record<string, string> = {
  "/calendar/admin/approvals": "Leave and schedule requests waiting for you",
  "/calendar/admin/members": "Add, edit and allocate people; roles and approvers",
  "/calendar/admin/schedules": "Change schedules, update several people, upload a schedule",
  "/calendar/admin/settings": "Approval mode, notifications, leave rules and team admins",
  "/calendar/dashboard": "Attendance today and this month, attendance summary",
  "/calendar/management": "Leads, managers and directors across towers",
  "/calendar/admin/reports": "Attendance, leave, schedule and summary reports",
  "/calendar/admin/headcount": "Headcount by month, cost centre and role",
  "/calendar/admin/shifts": "Shift times and buckets",
  "/calendar/admin/holidays": "Holidays by department, tower or team",
  "/calendar/admin/organization": "Departments, towers, teams, systems and trades; payroll cut-offs",
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
    badges: { approvals: v.pendingCount },
  };
  return (
    <>
      <div className="page-head">
        <h1>Admin</h1>
        <span>Everything for managing people and work in one place. Calendar and Workload keep the everyday pages.</span>
      </div>
      {adminSections(flags).map((sec) => (
        <Blueprint as="section" key={sec.title} className="panel" style={{ gap: 12 }}>
          <h2 className="h2">{sec.title}</h2>
          <div className="admin-hub">
            {sec.items
              .filter((n) => n.href !== "/calendar/admin")
              .map((n) => (
                <Link key={n.href} href={n.href} className="admin-hub-card">
                  <Icon name={n.icon} />
                  <span>
                    <strong>
                      {n.label}
                      {!!n.badge && <span className="tag tag-accent" style={{ marginLeft: 8 }}>{n.badge}</span>}
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
