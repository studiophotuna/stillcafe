"use client";

import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** "More" button with a short list of less-used actions (closes on a choice, Escape or a click outside). */
export function MoreMenu({ items, label = "More" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <div className="more-menu" ref={ref}>
      <button
        className="btn btn-ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          // Fixed to the window, so a scrolling table doesn't cut the list off.
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
          setOpen(!open);
        }}
      >
        {label} ▾
      </button>
      {open && (
        <div className="more-menu-list" role="menu" style={pos ? { position: "fixed", top: pos.top, right: pos.right } : undefined}>
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              disabled={it.disabled}
              className={it.danger ? "danger" : undefined}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
