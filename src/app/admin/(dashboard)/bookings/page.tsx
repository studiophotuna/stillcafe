import { getAllBookings } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { updateBookingStatus } from "@/app/admin/actions";
import type { BookingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "paid",
  "completed",
  "cancelled",
];

export default async function BookingsPage() {
  const bookings = await getAllBookings();

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold text-espresso">
        Bookings
      </h1>
      <p className="mt-1 text-sm text-espresso/60">
        {bookings.length} total
      </p>

      {bookings.length === 0 ? (
        <div className="mt-6 card p-8 text-center text-espresso/60">
          No bookings yet.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {bookings.map((b) => (
            <div key={b.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-serif text-lg font-semibold text-espresso">
                      {b.customer_name}
                    </h3>
                    <StatusBadge status={b.status} />
                    <span className="font-mono text-xs text-espresso/50">
                      {b.reference}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-espresso/70">
                    {b.package_name} · {formatDate(b.event_date)}
                    {b.event_time ? ` at ${b.event_time}` : ""}
                    {b.event_type ? ` · ${b.event_type}` : ""}
                  </div>
                  <div className="mt-1 text-sm text-espresso/60">
                    📍 {b.event_location}
                    {b.guest_count ? ` · ${b.guest_count} guests` : ""}
                  </div>
                  <div className="mt-1 text-sm text-espresso/60">
                    ✉ {b.customer_email} · ☎ {b.customer_phone}
                  </div>
                  {b.notes && (
                    <div className="mt-2 rounded-lg bg-latte/40 px-3 py-2 text-sm text-espresso/70">
                      {b.notes}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-sm text-espresso/60">
                    Paid {formatMoney(b.amount_paid_cents)} /{" "}
                    {formatMoney(b.package_price_cents)}
                  </div>
                  <form action={updateBookingStatus} className="mt-3">
                    <input type="hidden" name="id" value={b.id} />
                    <select
                      name="status"
                      defaultValue={b.status}
                      className="field-input py-2 text-sm"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s} className="capitalize">
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="btn-secondary mt-2 w-full py-2 text-sm"
                    >
                      Update status
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
