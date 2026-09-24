import type { CSSProperties, ReactNode } from "react";
import type { Chip as ChipStyle } from "@/lib/calendar/constants";

/** Square status/shift code chip (RTO, WFH, VL, …). */
export function Chip({ s, children, style }: { s: ChipStyle; children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="chip" style={{ background: s.bg, color: s.fg, border: s.bd, ...style }}>
      {children}
    </span>
  );
}

/** Segmented control (radio group styled as .seg). */
export function Seg<T extends string>({
  name,
  value,
  options,
  onChange,
  style,
  full,
}: {
  name: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  style?: CSSProperties;
  full?: boolean;
}) {
  return (
    <div className="seg" style={{ ...(full ? { display: "flex" } : {}), ...style }} role="radiogroup">
      {options.map(([k, l]) => (
        <label key={k} className="seg-opt lg" style={full ? { flex: 1, justifyContent: "center" } : undefined}>
          <input type="radio" name={name} checked={value === k} onChange={() => onChange(k)} />
          {l}
        </label>
      ))}
    </div>
  );
}
