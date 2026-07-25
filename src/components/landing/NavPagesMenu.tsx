"use client";

import { useEffect, useState } from "react";
import type { NavPage } from "@/lib/types";

/**
 * Landing page left-nav links. Each item opens a slide-over panel from
 * the left with admin-managed content.
 */
export function NavPagesMenu({ pages }: { pages: NavPage[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const open = openIdx !== null;
  const page = open ? pages[openIdx] : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIdx(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className="flex items-center gap-6 sm:gap-8">
        {pages.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpenIdx(i)}
            className="text-[length:var(--size-links,0.62em)] uppercase tracking-[0.2em] text-espresso transition-opacity hover:opacity-70"
            style={{ fontWeight: "var(--weight-links)", fontStyle: "var(--italic-links)" }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Dimmed backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpenIdx(null)}
        aria-hidden="true"
      />

      {/* Left slide-over panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={page?.title || "Information"}
        className={`fixed inset-y-0 left-0 z-50 flex w-full flex-col bg-cream shadow-elevated transition-transform duration-300 ease-out sm:max-w-md ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-latte/30 px-5 py-4 sm:px-6">
          <h2 className="font-serif text-lg text-espresso">
            {page?.title || page?.label}
          </h2>
          <button
            type="button"
            onClick={() => setOpenIdx(null)}
            aria-label="Close panel"
            className="flex h-8 w-8 items-center justify-center rounded-full text-espresso/50 transition-colors hover:bg-sand/60 hover:text-espresso"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          {page?.content && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-espresso/70">
              {page.content}
            </p>
          )}
          {page?.sections && page.sections.length > 0 && (
            <div className={`space-y-2.5 ${page.content ? "mt-5" : ""}`}>
              {page.sections.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-latte/30 bg-sand/20 p-4"
                >
                  {s.heading && (
                    <strong className="block text-sm text-espresso/80">
                      {s.heading}
                    </strong>
                  )}
                  {s.body && (
                    <p
                      className={`whitespace-pre-line text-sm leading-relaxed text-espresso/55 ${
                        s.heading ? "mt-1" : ""
                      }`}
                    >
                      {s.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
