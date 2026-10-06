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
  badges?: Partial<Record<"approvals" | "overtime" | "breaks" | "complexity", number>>;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Pages that belong to the Admin area. */
export const isAdminPath = (path: string) =>
  path.startsWith("/calendar/admin") ||
  path.startsWith("/workload/admin") ||
  ["/calendar/dashboard", "/calendar/management", "/workload/dashboard", "/workload/overtime", "/workload/breaks"].includes(path);

/** Whether someone gets the Admin area at all. */
export const hasAdminArea = (f: AdminFlags) => f.canApprove || f.teamAdmin || f.anyAdmin || f.leader || f.wlAdmin || f.wlApprover;

export function adminSections(f: AdminFlags): NavSection[] {
  const b = f.badges ?? {};
  const people: NavItem[] = [
    { href: "/calendar/admin", icon: "dash", label: "Overview" },
    ...(f.canApprove || f.teamAdmin ? [{ href: "/calendar/admin/approvals", icon: "approvals" as const, label: "Approvals", badge: b.approvals }] : []),
    ...(f.teamAdmin
      ? [
          { href: "/calendar/admin/members", icon: "members" as const, label: "Members" },
          { href: "/calendar/admin/schedules", icon: "calendar" as const, label: "Schedules" },
          { href: "/calendar/admin/settings", icon: "settings" as const, label: "Team settings" },
        ]
      : []),
    ...(f.leader || f.anyAdmin
      ? [
          { href: "/calendar/dashboard", icon: "dash" as const, label: "Attendance dashboard" },
          { href: "/calendar/management", icon: "mgmt" as const, label: "Management calendar" },
        ]
      : []),
    ...(f.anyAdmin
      ? [
          { href: "/calendar/admin/reports", icon: "reports" as const, label: "Reports" },
          { href: "/calendar/admin/headcount", icon: "members" as const, label: "Headcount" },
          { href: "/calendar/admin/shifts", icon: "shifts" as const, label: "Shifts" },
          { href: "/calendar/admin/holidays", icon: "holidays" as const, label: "Holidays" },
          { href: "/calendar/admin/organization", icon: "org" as const, label: "Organization" },
        ]
      : []),
  ];
  const work: NavItem[] = [
    ...(f.wlAdmin
      ? [
          { href: "/workload/dashboard", icon: "dash" as const, label: "Workload dashboard" },
          { href: "/workload/admin/queue", icon: "queue" as const, label: "Manage queue" },
        ]
      : []),
    ...(f.wlApprover
      ? [
          { href: "/workload/overtime", icon: "targets" as const, label: "Overtime", badge: b.overtime },
          { href: "/workload/breaks", icon: "check" as const, label: "Breaks", badge: b.breaks },
        ]
      : []),
    ...(f.wlAdmin
      ? [
          { href: "/workload/admin/aht", icon: "dash" as const, label: "Handling time" },
          { href: "/workload/admin/business", icon: "reports" as const, label: "Business case" },
          { href: "/workload/admin/complexity", icon: "fields" as const, label: "Complexity", badge: b.complexity },
          { href: "/workload/admin/intake", icon: "intake" as const, label: "Intake" },
          { href: "/workload/admin/allocation", icon: "rules" as const, label: "Allocation" },
          { href: "/workload/admin/sla", icon: "check" as const, label: "SLA & task types" },
          { href: "/workload/admin/targets", icon: "targets" as const, label: "Targets" },
          { href: "/workload/admin/fields", icon: "fields" as const, label: "Task fields" },
        ]
      : []),
  ];
  return [
    { title: "People & calendar", items: people },
    { title: "Workload", items: work },
  ].filter((s) => s.items.length);
}
