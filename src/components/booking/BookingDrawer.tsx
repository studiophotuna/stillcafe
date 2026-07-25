"use client";

import { useEffect, useState } from "react";
import type { FaqItem, Package, Settings } from "@/lib/types";
import { DEFAULT_COPY, type SiteCopy } from "@/lib/copy";
import { BookingWizard } from "./BookingWizard";

const OPEN_EVENT = "open-booking-drawer";

/** Button that opens the booking drawer from anywhere on the page. */
export function BookNowTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
    >
      {children}
    </button>
  );
}

/** Right-side slide-over panel containing the full booking flow. */
export function BookingDrawer({
  packages,
  settings,
  bookedDates,
  policies,
  wizardFaqs,
  copy = DEFAULT_COPY,
}: {
  packages: Package[];
  settings: Settings | null;
  bookedDates: string[];
  policies?: string[];
  wizardFaqs?: FaqItem[];
  copy?: SiteCopy;
}) {
  const [open, setOpen] = useState(false);
  // Wizard mounts on first open so the landing page stays light.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      setMounted(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
      {/* Dimmed backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={copy.drawer_title}
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-cream shadow-elevated transition-transform duration-300 ease-out sm:max-w-xl ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-latte/30 bg-cream/95 px-5 py-4 sm:px-6">
          <h2 className="font-serif text-lg text-espresso">{copy.drawer_title}</h2>
          <div className="flex items-center gap-4">
            <a
              href="/book/status"
              className="text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
            >
              {copy.label_check_status}
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close booking panel"
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
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {mounted &&
            (settings && packages.length > 0 ? (
              <BookingWizard
                packages={packages}
                settings={settings}
                bookedDates={bookedDates}
                policies={policies}
                wizardFaqs={wizardFaqs}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="font-serif text-lg text-espresso">
                  Booking is warming up
                </p>
                <p className="mt-2 text-sm text-espresso/45">
                  We couldn&apos;t load the booking form here. Try the full
                  booking page instead.
                </p>
                <a
                  href="/book"
                  className="btn-primary mt-6"
                >
                  Open booking page
                </a>
              </div>
            ))}
        </div>
      </aside>
    </>
  );
}
