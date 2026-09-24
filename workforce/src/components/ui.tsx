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
} as const;

export function Icon({ name, size = 18, stroke = "currentColor" }: { name: keyof typeof ICONS; size?: number; stroke?: string }) {
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
