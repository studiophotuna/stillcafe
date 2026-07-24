import Link from "next/link";
import { getBookingsForMonth } from "@/lib/data";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { Booking } from "@/lib/types";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string };
}) {
  const now = new Date();
  const year = Number(searchParams.year) || now.getFullYear();
  const month = Math.min(12, Math.max(1, Number(searchParams.month) || now.getMonth() + 1));

  const bookings = await getBookingsForMonth(year, month);

  const byDate = new Map<string, Booking[]>();
  for (const b of bookings) {
    const arr = byDate.get(b.event_date) ?? [];
    arr.push(b);
    byDate.set(b.event_date, arr);
  }

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 border-amber-200",
    confirmed: "bg-blue-50 border-blue-200",
    paid: "bg-green-50 border-green-200",
    completed: "bg-sand/50 border-latte",
    cancelled: "bg-red-50 border-red-200",
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-espresso">Calendar</h1>
          <p className="mt-1 text-sm text-espresso/45">
            {bookings.length} booking{bookings.length !== 1 ? "s" : ""} in {MONTHS[month - 1]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/calendar?month=${prevMonth}&year=${prevYear}`}
            className="btn-secondary flex h-8 w-8 items-center justify-center rounded-lg p-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <span className="min-w-[140px] text-center text-sm font-medium text-espresso">
            {MONTHS[month - 1]} {year}
          </span>
          <Link
            href={`/admin/calendar?month=${nextMonth}&year=${nextYear}`}
            className="btn-secondary flex h-8 w-8 items-center justify-center rounded-lg p-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-latte/40 bg-card">
        <div className="grid grid-cols-7 border-b border-latte/40 bg-sand/30">
          {DAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-espresso/40"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`e${i}`} className="min-h-[90px] border-t border-r border-latte/20 bg-latte/5" />;
            }
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayBookings = byDate.get(dateStr) ?? [];
            const isToday = dateStr === todayStr;
            const isPast = dateStr < todayStr;

            return (
              <div
                key={dateStr}
                className={`min-h-[90px] border-t border-r border-latte/20 p-1.5 transition-colors ${
                  isToday ? "bg-maroon/5" : isPast ? "bg-latte/5" : ""
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`text-xs font-medium ${
                      isToday
                        ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-maroon text-cream"
                        : isPast
                          ? "text-espresso/30"
                          : "text-espresso/60"
                    }`}
                  >
                    {day}
                  </span>
                  {dayBookings.length > 0 && (
                    <span className="text-[10px] text-espresso/30">{dayBookings.length}</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayBookings.slice(0, 3).map((b) => (
                    <Link
                      key={b.id}
                      href={`/admin/bookings/${b.id}`}
                      className={`block truncate rounded border px-1.5 py-0.5 text-[10px] text-espresso/70 transition-opacity hover:opacity-80 ${statusColors[b.status] ?? "bg-sand/30 border-latte"}`}
                      title={`${b.customer_name} — ${b.package_name}`}
                    >
                      {b.customer_name}
                    </Link>
                  ))}
                  {dayBookings.length > 3 && (
                    <div className="text-[10px] text-espresso/35 pl-1">
                      +{dayBookings.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-espresso/40">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded border bg-amber-100 border-amber-200" /> Pending
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded border bg-blue-50 border-blue-200" /> Confirmed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded border bg-green-50 border-green-200" /> Paid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded border bg-sand/50 border-latte" /> Completed
        </span>
      </div>
    </div>
  );
}
