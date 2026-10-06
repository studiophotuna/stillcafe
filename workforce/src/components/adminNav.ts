import type { NavItem } from "./AppFrame";

/**
 * The Admin area: every admin and leader function from Calendar and Workload in one menu,
 * beside the Calendar and Workload areas (which keep only the everyday pages).
 */
export interface AdminFlags {
  /** Calendar: approve requests, administer the selected team, administer anything, lead people. */
  canApprove: boolean;
  teamAdmin: boolean;
  anyAdmin: boolean;
  leader: boolean;
  /** Workload: admin of the selected team, approves overtime. */
  wlAdmin: boolean;
  wlApprover: boolean;
  /** Pricing (business case): managers and above. */
  pricing?: boolean;
  badges?: Partial<Record<"approvals" | "overtime" | "breaks" | "complexity", number>>;
}

export interface NavSection {
  title: string;
  icon?: NavItem["icon"];
  /** The section's pages, shown as tabs at the top of each of them. */
  items: NavItem[];
}

/** Pages that belong to the Admin area. */
export const isAdminPath = (path: string) =>
  path.startsWith("/calendar/admin") ||
  path.startsWith("/workload/admin") ||
  ["/calendar/dashboard", "/calendar/management", "/workload/dashboard", "/workload/overtime", "/workload/breaks"].includes(path);

/** Whether someone gets the Admin area at all. */
export const hasAdminArea = (f: AdminFlags) => f.canApprove || f.teamAdmin || f.anyAdmin || f.leader || f.wlAdmin || f.wlApprover;

const when = (on: boolean, items: NavItem[]) => (on ? items : []);

/**
 * The Admin menu: a few sections, each one entry in the sidebar with its pages as tabs
 * (e.g. Trackers & reports: OT tracker, KPI tracker, Accuracy log, Reports, Business case).
 * Only the pages this person may open are listed; empty sections are left out.
 */
export function adminSections(f: AdminFlags): NavSection[] {
  const b = f.badges ?? {};
  const lead = f.leader || f.anyAdmin;
  const sections: NavSection[] = [
    {
      title: "Approvals",
      icon: "approvals",
      items: [
        ...when(f.canApprove || f.teamAdmin, [{ href: "/calendar/admin/approvals", icon: "approvals", label: "Leave & schedule", badge: b.approvals }]),
        ...when(f.wlApprover, [
          { href: "/workload/overtime", icon: "targets", label: "Overtime", badge: b.overtime },
          { href: "/workload/breaks", icon: "check", label: "Breaks", badge: b.breaks },
        ]),
      ],
    },
    {
      title: "People",
      icon: "members",
      items: [
        ...when(f.teamAdmin, [
          { href: "/calendar/admin/members", icon: "members", label: "Members" },
          { href: "/calendar/admin/schedules", icon: "calendar", label: "Schedules" },
        ]),
        ...when(f.anyAdmin, [{ href: "/calendar/admin/headcount", icon: "members", label: "Headcount" }]),
      ],
    },
    {
      title: "Dashboards",
      icon: "dash",
      items: [
        ...when(lead, [
          { href: "/calendar/dashboard", icon: "dash", label: "Attendance" },
          { href: "/calendar/management", icon: "mgmt", label: "Management calendar" },
        ]),
        ...when(f.wlAdmin, [
          { href: "/workload/dashboard", icon: "dash", label: "Workload" },
          { href: "/workload/admin/aht", icon: "dash", label: "Handling time" },
        ]),
      ],
    },
    {
      title: "Trackers & reports",
      icon: "reports",
      items: [
        ...when(lead, [
          { href: "/calendar/admin/ot-tracker", icon: "targets", label: "OT tracker" },
          { href: "/calendar/admin/kpi-tracker", icon: "dash", label: "KPI tracker" },
          { href: "/calendar/admin/accuracy", icon: "check", label: "Accuracy log" },
        ]),
        ...when(f.anyAdmin, [{ href: "/calendar/admin/reports", icon: "reports", label: "Reports" }]),
        ...when(f.wlAdmin && !!f.pricing, [{ href: "/workload/admin/business", icon: "reports", label: "Business case" }]),
      ],
    },
    {
      title: "Work queue",
      icon: "queue",
      items: when(f.wlAdmin, [
        { href: "/workload/admin/queue", icon: "queue", label: "Manage queue" },
        { href: "/workload/admin/complexity", icon: "fields", label: "Complexity review", badge: b.complexity },
      ]),
    },
    {
      title: "Team setup",
      icon: "settings",
      items: [
        ...when(f.teamAdmin, [{ href: "/calendar/admin/settings", icon: "settings", label: "Team settings" }]),
        ...when(f.wlAdmin, [
          { href: "/workload/admin/allocation", icon: "rules", label: "Allocation" },
          { href: "/workload/admin/sla", icon: "check", label: "SLA & task types" },
          { href: "/workload/admin/targets", icon: "targets", label: "Targets" },
          { href: "/workload/admin/fields", icon: "fields", label: "Task fields" },
          { href: "/workload/admin/intake", icon: "intake", label: "Intake" },
        ]),
      ],
    },
    {
      title: "Organization",
      icon: "org",
      items: when(f.anyAdmin, [
        { href: "/calendar/admin/organization", icon: "org", label: "Structure" },
        { href: "/calendar/admin/shifts", icon: "shifts", label: "Shifts" },
        { href: "/calendar/admin/holidays", icon: "holidays", label: "Holidays" },
      ]),
    },
  ];
  return sections.filter((s) => s.items.length);
}

/** The section a page belongs to. */
export const sectionOf = (sections: NavSection[], path: string) => sections.find((s) => s.items.some((n) => n.href === path));
