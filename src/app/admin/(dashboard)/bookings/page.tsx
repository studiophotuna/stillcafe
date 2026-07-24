import Link from "next/link";
import { getPaginatedBookings } from "@/lib/data";
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

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: { page?: string; status?: string; q?: string };
}) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const statusFilter = searchParams.status || "all";
  const search = searchParams.q?.trim() || "";

  const { bookings, total, pageSize } = await getPaginatedBookings({
    page,
    status: statusFilter,
    search,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function buildUrl(params: Record<string, string | number>) {
    const p = new URLSearchParams();
    const merged = { status: statusFilter, q: search, page: String(page), ...params };
    for (const [k, v] of Object.entries(merged)) {
      const val = String(v);
      if (val && val !== "all" && val !== "1" && val !== "") {
        p.set(k, val);
      } else if (k === "status" && val === "all") {
        // omit
      }
    }
    const qs = p.toString();
    return `/admin/bookings${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-espresso">Bookings</h1>
          <p className="mt-1 text-sm text-espresso/45">{total} total</p>
        </div>
        <a
          href="/api/admin/export"
          className="btn-secondary flex items-center gap-1.5 px-4 py-2 text-xs"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </a>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {["all", ...STATUSES].map((s) => (
            <a
              key={s}
              href={buildUrl({ status: s, page: 1 })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                statusFilter === s
                  ? "bg-espresso text-cream"
                  : "bg-latte/30 text-espresso/50 hover:bg-latte/50 hover:text-espresso/70"
              }`}
            >
              {s}
            </a>
          ))}
        </div>

        <form action="/admin/bookings" method="get" className="flex gap-2">
          {statusFilter !== "all" && (
            <input type="hidden" name="status" value={statusFilter} />
          )}
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-espresso/30">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              name="q"
              type="search"
              placeholder="Search name, email, or ref..."
              defaultValue={search}
              className="field-input py-1.5 pl-9 text-sm w-56"
            />
          </div>
          <button type="submit" className="btn-secondary py-1.5 px-3 text-sm">
            Search
          </button>
        </form>
      </div>

      {bookings.length === 0 ? (
        <div className="mt-6 card px-8 py-12 text-center">
          <div className="text-3xl text-espresso/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto h-12 w-12">
              <path d="M22 12h-6l-2 3H10l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
          </div>
          <p className="mt-3 text-sm text-espresso/45">
            {search || statusFilter !== "all"
              ? "No bookings match your filters."
              : "No bookings yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-hidden rounded-xl border border-latte/40">
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-latte/40 bg-sand/30 text-left">
                    <th className="px-4 py-3 font-medium text-espresso/50">Customer</th>
                    <th className="px-4 py-3 font-medium text-espresso/50">Package</th>
                    <th className="px-4 py-3 font-medium text-espresso/50">Event</th>
                    <th className="px-4 py-3 font-medium text-espresso/50">Paid</th>
                    <th className="px-4 py-3 font-medium text-espresso/50">Status</th>
                    <th className="px-4 py-3 font-medium text-espresso/50"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-latte/20">
                  {bookings.map((b) => (
                    <tr key={b.id} className="bg-card transition-colors hover:bg-sand/10">
                      <td className="px-4 py-3">
                        <Link href={`/admin/bookings/${b.id}`} className="font-medium text-espresso hover:text-mocha">
                          {b.customer_name}
                        </Link>
                        <div className="mt-0.5 text-xs text-espresso/40 font-mono">{b.reference}</div>
                      </td>
                      <td className="px-4 py-3 text-espresso/70">{b.package_name}</td>
                      <td className="px-4 py-3">
                        <div className="text-espresso/70">{formatDate(b.event_date)}</div>
                        <div className="text-xs text-espresso/40">{b.event_location}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-espresso/70">{formatMoney(b.amount_paid_cents)}</div>
                        <div className="text-xs text-espresso/35">of {formatMoney(b.package_price_cents)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="px-4 py-3">
                        <form action={updateBookingStatus} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={b.id} />
                          <select
                            name="status"
                            defaultValue={b.status}
                            className="field-input py-1 text-xs w-28"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s} className="capitalize">
                                {s}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn-secondary px-2 py-1 text-xs">
                            Update
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-latte/20 lg:hidden">
              {bookings.map((b) => (
                <div key={b.id} className="bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/bookings/${b.id}`}
                          className="font-medium text-espresso hover:text-mocha"
                        >
                          {b.customer_name}
                        </Link>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="mt-0.5 text-xs text-espresso/40 font-mono">{b.reference}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-espresso/70">{formatMoney(b.amount_paid_cents)}</div>
                      <div className="text-xs text-espresso/35">of {formatMoney(b.package_price_cents)}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-espresso/60">
                    {b.package_name} &middot; {formatDate(b.event_date)}
                    {b.event_time ? ` at ${b.event_time}` : ""}
                  </div>
                  <div className="mt-0.5 text-sm text-espresso/50">
                    {b.event_location}
                    {b.guest_count ? ` · ${b.guest_count} guests` : ""}
                  </div>
                  {b.notes && (
                    <div className="mt-2 rounded-lg bg-sand/30 px-3 py-2 text-xs text-espresso/60">
                      {b.notes}
                    </div>
                  )}
                  <form action={updateBookingStatus} className="mt-3 flex items-center gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <select
                      name="status"
                      defaultValue={b.status}
                      className="field-input flex-1 py-1.5 text-xs"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s} className="capitalize">
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn-secondary px-3 py-1.5 text-xs">
                      Update
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-3">
              {page > 1 ? (
                <a
                  href={buildUrl({ page: page - 1 })}
                  className="btn-secondary px-4 py-1.5 text-sm"
                >
                  Previous
                </a>
              ) : (
                <span className="btn-secondary px-4 py-1.5 text-sm opacity-30 pointer-events-none">
                  Previous
                </span>
              )}
              <span className="text-sm text-espresso/50">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <a
                  href={buildUrl({ page: page + 1 })}
                  className="btn-secondary px-4 py-1.5 text-sm"
                >
                  Next
                </a>
              ) : (
                <span className="btn-secondary px-4 py-1.5 text-sm opacity-30 pointer-events-none">
                  Next
                </span>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
