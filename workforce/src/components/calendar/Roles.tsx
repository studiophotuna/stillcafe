"use client";

import { LEVELS, LEVEL_ORDER } from "@/lib/calendar/constants";
import type { Level } from "@/lib/calendar/types";

/** "All roles" or one role. */
export function RoleFilter({ value, onChange }: { value: Level | "all"; onChange: (v: Level | "all") => void }) {
  return (
    <select aria-label="Role" className="input" value={value} onChange={(e) => onChange(e.target.value as Level | "all")} style={{ width: "auto" }}>
      <option value="all">All roles</option>
      {LEVEL_ORDER.map((l) => (
        <option key={l} value={l}>
          {LEVELS[l]}
        </option>
      ))}
    </select>
  );
}

/** A role name with its colour. */
export function RoleTag({ level }: { level: Level }) {
  return <span className={"role-tag lv-" + level}>{LEVELS[level]}</span>;
}

/** The role colours used on the rows. */
export function RoleLegend({ levels = LEVEL_ORDER }: { levels?: Level[] }) {
  return (
    <div className="role-legend" aria-label="Role colours">
      {levels.map((l) => (
        <RoleTag key={l} level={l} />
      ))}
    </div>
  );
}
