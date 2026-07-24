import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookingById, getPaymentsForBooking } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { updateBooking } from "@/app/admin/actions";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { BookingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "paid",
  "completed",
  "cancelled",
];

export default async function BookingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [booking, payments] = await Promise.all([
    getBookingById(params.id),
    getPaymentsForBooking(params.id),
  ]);

  if (!booking) notFound();

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/bookings"
        className="inline-flex items-center gap-1 text-sm text-mocha hover:underline"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Bookings
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-2xl text-espresso">
          {booking.reference}
        </h1>
        <StatusBadge status={booking.status} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-espresso/45">
        <span>Created {formatDate(booking.created_at.split("T")[0])}</span>
        <span>&middot;</span>
        <span>{booking.customer_name}</span>
        {booking.customer_email && (
          <>
            <span>&middot;</span>
            <a href={`mailto:${booking.customer_email}`} className="text-mocha hover:underline">
              {booking.customer_email}
            </a>
          </>
        )}
      </div>

      <form action={updateBooking} className="mt-6 items-start gap-6 lg:flex">
        <input type="hidden" name="id" value={booking.id} />
        <div className="min-w-0 flex-1 space-y-5">

        <div className="card overflow-hidden">
          <div className="border-b border-latte/30 px-6 py-4">
            <h2 className="flex items-center gap-2 font-serif text-base text-espresso">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-espresso/40">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              Customer
            </h2>
          </div>
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Name</label>
                <input
                  name="customer_name"
                  defaultValue={booking.customer_name}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Email</label>
                <input
                  name="customer_email"
                  type="email"
                  defaultValue={booking.customer_email}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Phone</label>
                <input
                  name="customer_phone"
                  defaultValue={booking.customer_phone}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Guest count</label>
                <input
                  name="guest_count"
                  type="number"
                  min="1"
                  defaultValue={booking.guest_count ?? ""}
                  className="field-input"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-latte/30 px-6 py-4">
            <h2 className="flex items-center gap-2 font-serif text-base text-espresso">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-espresso/40">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Event
            </h2>
          </div>
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Date</label>
                <input
                  name="event_date"
                  type="date"
                  defaultValue={booking.event_date}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Time</label>
                <input
                  name="event_time"
                  type="time"
                  defaultValue={booking.event_time ?? ""}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Event type</label>
                <input
                  name="event_type"
                  defaultValue={booking.event_type ?? ""}
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Location</label>
                <input
                  name="event_location"
                  defaultValue={booking.event_location}
                  className="field-input"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-latte/30 px-6 py-4">
            <h2 className="flex items-center gap-2 font-serif text-base text-espresso">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-espresso/40">
                <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Booking
            </h2>
          </div>
          <div className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Package</label>
                <input
                  value={booking.package_name}
                  disabled
                  className="field-input bg-latte/20 text-espresso/50"
                />
              </div>
              <div>
                <label className="field-label">Status</label>
                <select
                  name="status"
                  defaultValue={booking.status}
                  className="field-input"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Total price</label>
                <input
                  value={(booking.package_price_cents / 100).toFixed(2)}
                  disabled
                  className="field-input bg-latte/20 text-espresso/50"
                />
              </div>
              <div>
                <label className="field-label">Amount paid</label>
                <input
                  name="amount_paid"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(booking.amount_paid_cents / 100).toFixed(2)}
                  className="field-input"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Notes</label>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={booking.notes}
                  className="field-input resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        </div>

        {/* Save rail: follows scroll on desktop, docks to bottom on mobile */}
        <div className="sticky bottom-4 z-10 mt-5 lg:bottom-auto lg:top-24 lg:mt-0 lg:w-52 lg:shrink-0">
          <div className="card p-4 shadow-elevated lg:shadow-card">
            <button
              type="submit"
              className="btn-primary flex w-full items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
              </svg>
              Save changes
            </button>
            <p className="mt-2 hidden text-center text-[11px] text-espresso/35 lg:block">
              Status changes email the customer
            </p>
          </div>
        </div>
      </form>

      {payments.length > 0 && (
        <div className="mt-8 card overflow-hidden">
          <div className="border-b border-latte/30 px-6 py-4">
            <h2 className="font-serif text-base text-espresso">
              Payment history
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-latte/30 bg-sand/20 text-left text-espresso/50">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Provider</th>
                  <th className="px-4 py-2.5 font-medium">Method</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-latte/20">
                {payments.map((p) => (
                  <tr key={p.id} className="bg-card">
                    <td className="px-4 py-2.5 text-espresso/70">
                      {formatDate(p.created_at.split("T")[0])}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-espresso/70">
                      {p.provider}
                    </td>
                    <td className="px-4 py-2.5 text-espresso/70">
                      {p.method ?? "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-espresso">
                      {formatMoney(p.amount_cents)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={p.status as BookingStatus} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-espresso/40">
                      {p.provider_ref ? p.provider_ref.slice(0, 16) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
