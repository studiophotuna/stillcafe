"use client";

import { useEffect, useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import {
  lookupBookingStatus,
  type BookingStatusView,
} from "@/app/book/actions";

const OPEN_EVENT = "open-status-drawer";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-800" },
  paid: { label: "Paid", color: "bg-green-100 text-green-800" },
  completed: { label: "Completed", color: "bg-sand text-espresso" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800" },
};

/** Button that opens the Check Status slide-over from anywhere. */
export function StatusTrigger({
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

export function StatusDrawer({
  title = "Check your booking",
  intro = "Enter the reference number from your booking confirmation.",
}: {
  title?: string;
  intro?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<BookingStatusView | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ref.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const found = await lookupBookingStatus(ref);
      setResult(found);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setRef("");
    setResult(null);
    setSearched(false);
  }

  const statusInfo = result
    ? STATUS_LABELS[result.status] ?? STATUS_LABELS.pending
    : null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-cream shadow-elevated transition-transform duration-300 ease-out sm:max-w-md ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-latte/30 bg-cream/95 px-5 py-4 sm:px-6">
          <h2 className="font-serif text-lg text-espresso">{title}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close status panel"
            className="flex h-8 w-8 items-center justify-center rounded-full text-espresso/50 transition-colors hover:bg-sand/60 hover:text-espresso"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <form onSubmit={onSubmit}>
            <p className="text-sm text-espresso/45">{intro}</p>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. BK-A3X9P2"
              className="field-input mt-4 text-center font-mono text-lg uppercase tracking-wider"
            />
            <button
              type="submit"
              disabled={loading || !ref.trim()}
              className="btn-primary mt-4 w-full disabled:opacity-50"
            >
              {loading ? "Looking up…" : "Look up"}
            </button>
          </form>

          {searched && !loading && !result && (
            <div className="mt-6 rounded-xl border border-latte/40 bg-card p-6 text-center">
              <p className="text-sm text-espresso/60">
                No booking matches that reference. Double-check and try again.
              </p>
            </div>
          )}

          {result && statusInfo && (
            <div className="mt-6 animate-fade-in overflow-hidden rounded-xl border border-latte/40 bg-card">
              <div className="flex items-center justify-between border-b border-latte/30 px-5 py-4">
                <span className="font-mono text-sm font-semibold text-espresso">
                  {result.reference}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              </div>
              <dl className="space-y-2.5 p-5 text-sm">
                <Row label="Package" value={result.package_name} />
                <Row label="Date" value={formatDate(result.event_date)} />
                {result.event_time && <Row label="Time" value={result.event_time} />}
                <Row label="Location" value={result.event_location} />
                {result.event_type && <Row label="Event" value={result.event_type} />}
                {result.guest_count != null && (
                  <Row label="Guests" value={String(result.guest_count)} />
                )}
                <Row label="Name" value={result.customer_name} />
                <div className="space-y-2.5 border-t border-latte/40 pt-2.5">
                  <Row label="Total" value={formatMoney(result.package_price_cents)} />
                  <Row label="Deposit due" value={formatMoney(result.amount_due_cents)} />
                  <Row label="Amount paid" value={formatMoney(result.amount_paid_cents)} />
                </div>
              </dl>
              <div className="border-t border-latte/30 px-5 py-3 text-center">
                <button
                  type="button"
                  onClick={reset}
                  className="text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
                >
                  Look up another
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-espresso/45">{label}</dt>
      <dd className="text-right font-medium text-espresso">{value}</dd>
    </div>
  );
}
