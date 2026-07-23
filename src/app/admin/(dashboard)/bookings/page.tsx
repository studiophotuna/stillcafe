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
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl text-espresso">Bookings</h1>
        <span className="text-[13px] text-espresso/30">
          {bookings.length} total
        </span>
      </div>

      {bookings.length === 0 ? (
        <div className="mt-6 card px-8 py-12 text-center text-sm text-espresso/35">
          No bookings yet.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-espresso">
                      {b.customer_name}
                    </h3>
                    <StatusBadge status={b.status} />
                    <span className="font-mono text-[11px] text-espresso/25">
                      {b.reference}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[13px] text-espresso/50">
                    {b.package_name} · {formatDate(b.event_date)}
                    {b.event_time ? ` at ${b.event_time}` : ""}
                    {b.event_type ? ` · ${b.event_type}` : ""}
                  </div>
                  <div className="mt-1 text-[13px] text-espresso/40">
                    {b.event_location}
                    {b.guest_count ? ` · ${b.guest_count} guests` : ""}
                  </div>
                  <div className="mt-1 text-[13px] text-espresso/35">
                    {b.customer_email} · {b.customer_phone}
                  </div>
                  {b.notes && (
                    <div className="mt-2 rounded-lg bg-sand/60 px-3 py-2 text-[13px] text-espresso/50">
                      {b.notes}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-[13px] tabular-nums text-espresso/40">
                    Paid {formatMoney(b.amount_paid_cents)} /{" "}
                    {formatMoney(b.package_price_cents)}
                  </div>
                  <form action={updateBookingStatus} className="mt-3">
                    <input type="hidden" name="id" value={b.id} />
                    <select
                      name="status"
                      defaultValue={b.status}
                      className="field-input py-2 text-[13px]"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s} className="capitalize">
                          {s}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="btn-secondary mt-2 w-full py-2 text-[13px]"
                    >
                      Update
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
