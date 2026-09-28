"use client";

/**
 * Small, dependency-free SVG charts for the dashboards (fast to load and render).
 * Specs follow the data-viz method: thin marks (≤24px columns with a 4px rounded end,
 * square at the baseline), 2px lines, a 2px surface gap between stacked segments,
 * hairline recessive grid, a legend for 2+ series, a per-slot hover/focus tooltip that
 * lists every series, and text in text colours (never the series colour).
 * Every chart sits next to a table with the same numbers, so hover never gates a value.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface Series {
  name: string;
  /** A --viz-* colour (CSS value). */
  color: string;
  values: (number | null)[];
}

/** Categorical slots, in the validated order (see industry theme --viz-1…3). */
export const VIZ = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)"] as const;
export const VIZ_OTHER = "var(--viz-other)";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** A clean axis maximum and step: 0 / 5 / 10 …, 0 / 25 / 50 …, 0 / 1,000 / 2,000 … */
function niceScale(max: number, ticks = 4) {
  if (!(max > 0)) return { top: 1, step: 0.25 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: Math.ceil(max / step) * step, step };
}

const fmtNum = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(Math.round(n * 10) / 10));

/** Column rounded at the top only (the data end), square at the baseline. */
function colPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function Legend({ series, line }: { series: Series[]; line?: boolean }) {
  if (series.length < 2) return null;
  return (
    <div className="viz-legend">
      {series.map((s) => (
        <span key={s.name}>
          <i className={line ? "key-line" : "key-box"} style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function Tip({ x, w, title, rows, fmt }: { x: number; w: number; title: string; rows: { s: Series; v: number | null }[]; fmt: (n: number) => string }) {
  // Beside the hovered position, kept inside the chart.
  const left = x + 196 < w ? x + 12 : Math.max(0, x - 192);
  return (
    <div className="viz-tip" style={{ left }} role="status">
      <div className="viz-tip-title">{title}</div>
      {rows.map(({ s, v }) => (
        <div key={s.name} className="viz-tip-row">
          <i style={{ background: s.color }} />
          <strong>{v === null ? "—" : fmt(v)}</strong>
          <span>{s.name}</span>
        </div>
      ))}
    </div>
  );
}

const M = { l: 44, r: 10, t: 12, b: 28 };

/** Columns per category: grouped (side by side) or stacked. */
export function ColumnChart({
  labels,
  series,
  stacked,
  height = 220,
  fmt = fmtNum,
  label,
  mark,
  ticks: axis,
}: {
  labels: string[];
  /** Shorter labels for the axis (tooltips keep the full ones). */
  ticks?: string[];
  series: Series[];
  stacked?: boolean;
  height?: number;
  fmt?: (n: number) => string;
  /** Accessible name. */
  label: string;
  /** Index of a category to emphasise (e.g. today). */
  mark?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const n = labels.length;
  const pw = W - M.l - M.r;
  const ph = height - M.t - M.b;
  const totals = labels.map((_, i) => (stacked ? series.reduce((a, s) => a + (s.values[i] ?? 0), 0) : Math.max(0, ...series.map((s) => s.values[i] ?? 0))));
  const { top, step } = niceScale(Math.max(...totals, 0));
  const y = (v: number) => M.t + ph - (v / top) * ph;
  const slot = pw / Math.max(1, n);
  const gap = 2;
  const bw = stacked ? Math.min(24, slot * 0.62) : Math.min(24, (slot * 0.72 - gap * (series.length - 1)) / series.length);
  const group = stacked ? bw : bw * series.length + gap * (series.length - 1);
  const every = Math.max(1, Math.ceil(n / Math.max(1, pw / 44)));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return (
    <div className="viz" ref={ref}>
      <Legend series={series} />
      <div style={{ position: "relative" }}>
        <svg width={W} height={height} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="viz-grid" />
              <text x={M.l - 8} y={y(t)} className="viz-axis" textAnchor="end" dominantBaseline="middle">
                {fmt(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            const cx = M.l + slot * i + slot / 2;
            let acc = 0;
            return (
              <g key={i}>
                {hi === i && <rect x={M.l + slot * i} y={M.t} width={slot} height={ph} className="viz-hover" />}
                {series.map((s, k) => {
                  const v = s.values[i] ?? 0;
                  if (v <= 0) return null;
                  if (stacked) {
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    const isTop = series.slice(k + 1).every((z) => !(z.values[i] ?? 0));
                    const h = Math.max(0, y0 - y1 - (acc - v > 0 ? gap : 0));
                    return isTop ? (
                      <path key={s.name} d={colPath(cx - bw / 2, y1, bw, h)} fill={s.color} />
                    ) : (
                      <rect key={s.name} x={cx - bw / 2} y={y1} width={bw} height={h} fill={s.color} />
                    );
                  }
                  const x0 = cx - group / 2 + k * (bw + gap);
                  return <path key={s.name} d={colPath(x0, y(v), bw, y(0) - y(v))} fill={s.color} />;
                })}
                {(i === mark || (i % every === 0 && (mark === undefined || Math.abs(i - mark) >= Math.max(1, every)))) && (
                  <text x={cx} y={height - 8} className={"viz-axis" + (i === mark ? " viz-mark" : "")} textAnchor="middle">
                    {axis?.[i] ?? l}
                  </text>
                )}
                <rect
                  x={M.l + slot * i}
                  y={M.t}
                  width={slot}
                  height={ph + M.b}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${l}: ${series.map((s) => `${s.name} ${s.values[i] === null ? "none" : fmt(s.values[i]!)}`).join(", ")}`}
                  onPointerEnter={() => setHi(i)}
                  onPointerLeave={() => setHi(null)}
                  onFocus={() => setHi(i)}
                  onBlur={() => setHi(null)}
                />
              </g>
            );
          })}
          <line x1={M.l} x2={W - M.r} y1={y(0)} y2={y(0)} className="viz-base" />
        </svg>
        {hi !== null && (
          <Tip
            x={M.l + slot * hi + slot / 2}
            w={W}
            title={labels[hi]}
            rows={series.map((s) => ({ s, v: s.values[hi] }))}
            fmt={fmt}
          />
        )}
      </div>
    </div>
  );
}

/** Lines over categories (e.g. percentages over days), with an optional reference line. */
export function LineChart({
  labels,
  series,
  height = 220,
  fmt = (n: number) => `${Math.round(n)}%`,
  label,
  reference,
  mark,
  ticks: axis,
}: {
  labels: string[];
  ticks?: string[];
  series: Series[];
  height?: number;
  fmt?: (n: number) => string;
  label: string;
  /** A horizontal reference, e.g. 100 for "target". */
  reference?: { value: number; label: string };
  mark?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const n = labels.length;
  const pw = W - M.l - M.r;
  const ph = height - M.t - M.b;
  const vals = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const { top, step } = niceScale(Math.max(reference?.value ?? 0, ...vals, 0));
  const y = (v: number) => M.t + ph - (v / top) * ph;
  const x = (i: number) => M.l + (n <= 1 ? pw / 2 : (pw * i) / (n - 1));
  const every = Math.max(1, Math.ceil(n / Math.max(1, pw / 44)));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const path = (s: Series) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i)},${y(v)}`;
      pen = true;
    });
    return d;
  };
  const near = (px: number) => Math.max(0, Math.min(n - 1, Math.round(n <= 1 ? 0 : ((px - M.l) / pw) * (n - 1))));
  return (
    <div className="viz" ref={ref}>
      <Legend series={series} line />
      <div style={{ position: "relative" }}>
        <svg
          width={W}
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          onPointerMove={(e) => setHi(near(e.clientX - (e.currentTarget as SVGSVGElement).getBoundingClientRect().left))}
          onPointerLeave={() => setHi(null)}
          onFocus={() => setHi(n - 1)}
          onBlur={() => setHi(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHi((h) => Math.max(0, (h ?? n - 1) - 1));
            if (e.key === "ArrowRight") setHi((h) => Math.min(n - 1, (h ?? 0) + 1));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="viz-grid" />
              <text x={M.l - 8} y={y(t)} className="viz-axis" textAnchor="end" dominantBaseline="middle">
                {fmt(t)}
              </text>
            </g>
          ))}
          {reference && (
            <g>
              <line x1={M.l} x2={W - M.r} y1={y(reference.value)} y2={y(reference.value)} className="viz-ref" />
              <text x={W - M.r} y={y(reference.value) - 5} className="viz-axis" textAnchor="end">
                {reference.label}
              </text>
            </g>
          )}
          {labels.map((l, i) =>
            i === mark || (i % every === 0 && (mark === undefined || Math.abs(i - mark) >= Math.max(1, every))) ? (
              <text key={i} x={x(i)} y={height - 8} className={"viz-axis" + (i === mark ? " viz-mark" : "")} textAnchor="middle">
                {axis?.[i] ?? l}
              </text>
            ) : null,
          )}
          {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={M.t} y2={M.t + ph} className="viz-cross" />}
          {series.map((s) => (
            <path key={s.name} d={path(s)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {series.map((s) => {
            // End marker on each line, plus the hovered point.
            const last = s.values.reduce<number>((a, v, i) => (v !== null ? i : a), -1);
            return [last, hi]
              .filter((i, k, all): i is number => i !== null && i >= 0 && s.values[i] !== null && all.indexOf(i) === k)
              .map((i) => <circle key={s.name + i} cx={x(i)} cy={y(s.values[i]!)} r={4} fill={s.color} className="viz-dot" />);
          })}
        </svg>
        {hi !== null && (
          <Tip x={x(hi)} w={W} title={labels[hi]} rows={series.map((s) => ({ s, v: s.values[hi] }))} fmt={fmt} />
        )}
      </div>
    </div>
  );
}

/** Horizontal bars with the value at the tip (one series), optional target marker. */
export function BarList({
  rows,
  fmt = fmtNum,
  color = "var(--viz-1)",
  target,
  max,
  empty = "Nothing to show for this period.",
}: {
  rows: { key: string; label: ReactNode; value: number | null; note?: string }[];
  fmt?: (n: number) => string;
  color?: string;
  /** A marker, e.g. 100 for the target. */
  target?: { value: number; label: string };
  max?: number;
  empty?: string;
}) {
  const shown = rows.filter((r) => r.value !== null);
  if (!shown.length) return <span className="small">{empty}</span>;
  const top = niceScale(Math.max(max ?? 0, target?.value ?? 0, ...shown.map((r) => r.value!))).top;
  return (
    <div className="viz-bars">
      {target && (
        <div className="viz-bars-ref" style={{ left: `calc(var(--viz-label) + (100% - var(--viz-label) - var(--viz-val)) * ${target.value / top})` }} title={target.label}>
          <span>{target.label}</span>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.key} className="viz-bar-row" title={r.note}>
          <span className="viz-bar-label">{r.label}</span>
          <span className="viz-bar-track">
            {r.value !== null && r.value > 0 && <i style={{ width: `${(r.value / top) * 100}%`, background: color }} />}
          </span>
          <span className="viz-bar-val">{r.value === null ? "—" : fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
