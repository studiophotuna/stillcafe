import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/** The four "+" registration marks of an Industry blueprint frame. */
export const Corners = () => (
  <>
    <i className="corner tl" />
    <i className="corner tr" />
    <i className="corner bl" />
    <i className="corner br" />
  </>
);

type BlueprintProps<T extends ElementType> = { as?: T; className?: string; children?: ReactNode } & Omit<
  ComponentPropsWithoutRef<T>,
  "as" | "className" | "children"
>;

export function Blueprint<T extends ElementType = "div">({ as, className, children, ...rest }: BlueprintProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={"blueprint" + (className ? " " + className : "")} {...rest}>
      <Corners />
      {children}
    </Tag>
  );
}

/** Lucide icon paths (stroke 1.5). */
export const ICONS = {
  my: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 6v6l4 2"],
  queue: ["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
  dash: ["M3 3v18h18M18 17V9M13 17V5M8 17v-3"],
  intake: [
    "M22 12h-6l-2 3h-4l-2-3H2",
    "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  ],
  fields: ["M3 5h18M3 12h18M3 19h12"],
  rules: ["M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"],
  targets: [
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
    "M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z",
    "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  ],
  check: ["M20 6 9 17l-5-5"],
  play: ["M6 3l14 9-14 9V3z"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5", "M12 15V3"],
  plus: ["M5 12h14M12 5v14"],
  up: ["m18 15-6-6-6 6"],
  down: ["m6 9 6 6 6-6"],
  left: ["m15 18-6-6 6-6"],
  right: ["m9 18 6-6-6-6"],
  x: ["M18 6 6 18M6 6l12 12"],
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m17 8-5-5-5 5", "M12 3v12"],
  search: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "m21 21-4.3-4.3"],
  calendar: ["M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M8 2v4", "M16 2v4", "M3 10h18"],
  mgmt: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  bcp: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  requests: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M16 13H8", "M16 17H8", "M10 9H8"],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
  approvals: ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "m9 11 3 3L22 4"],
  members: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"],
  settings: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  shifts: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 6v6l4 2"],
  org: ["M9 3h6v6H9z", "M3 15h6v6H3z", "M15 15h6v6h-6z", "M6 15v-3h12v3", "M12 12V9"],
  holidays: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41"],
  reports: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M12 18v-6", "m9 15 3 3 3-3"],
  mail: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, stroke = "currentColor" }: { name: IconName; size?: number; stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function Kpi({ k, v, m }: { k: string; v: ReactNode; m: string }) {
  return (
    <Blueprint className="card kpi">
      <span className="card-kicker">{k}</span>
      <span className="kpi-value">{v}</span>
      <span className="card-meta">{m}</span>
    </Blueprint>
  );
}

export function PageHead({ title, sub, style }: { title: string; sub?: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {sub && <span style={style}>{sub}</span>}
    </div>
  );
}

export const pct = (v: number | null) => (v === null ? "—" : v + "%");
