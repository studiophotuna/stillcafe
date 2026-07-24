import Link from "next/link";
import { getAllBookings, getAllPackages, getSettings } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { StatusBadge } from "@/components/admin/StatusBadge";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const [bookings, packages, settings] = await Promise.all([
    getAllBookings(),
    getAllPackages(),
    getSettings(),
  ]);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;

  const thisMonthBookings = bookings.filter((b) => b.created_at.startsWith(thisMonth));
  const lastMonthBookings = bookings.filter((b) => b.created_at.startsWith(lastMonth));

  const paid = bookings.filter((b) => ["paid", "completed"].includes(b.status));
  const revenue = paid.reduce((sum, b) => sum + b.amount_paid_cents, 0);
  const thisMonthRevenue = thisMonthBookings
    .filter((b) => ["paid", "completed"].includes(b.status))
    .reduce((sum, b) => sum + b.amount_paid_cents, 0);

  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;

  const upcoming = bookings
    .filter(
      (b) =>
        ["paid", "confirmed"].includes(b.status) &&
        new Date(b.event_date) >= new Date(now.toDateString())
    )
    .sort(
      (a, b) =>
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    )
    .slice(0, 5);

  const recentBookings = bookings.slice(0, 5);

  const packageStats = packages.map((pkg) => {
    const count = bookings.filter(
      (b) => b.package_ids?.includes(pkg.id) || b.package_id === pkg.id
    ).length;
    return { name: pkg.name, count, active: pkg.is_active };
  }).sort((a, b) => b.count - a.count);

  const monthDiff = thisMonthBookings.length - lastMonthBookings.length;
  const monthTrend = monthDiff > 0 ? "up" : monthDiff < 0 ? "down" : "flat";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-espresso">Overview</h1>
          <p className="mt-1 text-sm text-espresso/45">
            Here&apos;s what&apos;s happening with your bookings.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/bookings" className="btn-secondary px-4 py-2 text-xs">
            All bookings
          </Link>
          <Link href="/admin/calendar" className="btn-secondary px-4 py-2 text-xs">
            Calendar
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-espresso/40">Total bookings</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-maroon/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-maroon">
                <path d="M22 12h-6l-2 3H10l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold text-espresso">{bookings.length}</div>
          <div className="mt-1 flex items-center gap-1 text-[11px]">
            {monthTrend === "up" && <span className="text-green-600">+{monthDiff}</span>}
            {monthTrend === "down" && <span className="text-red-500">{monthDiff}</span>}
            {monthTrend === "flat" && <span className="text-espresso/35">0</span>}
            <span className="text-espresso/35">vs last month</span>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-espresso/40">Needs attention</div>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${pendingCount > 0 ? "bg-amber-100" : "bg-green-100"}`}>
              {pendingCount > 0 ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-amber-600">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-green-600">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
            </div>
          </div>
          <div className={`mt-2 text-2xl font-semibold ${pendingCount > 0 ? "text-amber-600" : "text-espresso"}`}>
            {pendingCount}
          </div>
          <div className="mt-1 text-[11px] text-espresso/35">
            {pendingCount > 0 ? `${pendingCount} pending · ${confirmedCount} confirmed` : "All clear"}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-espresso/40">Revenue</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-green-600">
                <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold text-espresso">
            {formatMoney(revenue, settings.currency, settings.locale)}
          </div>
          <div className="mt-1 text-[11px] text-espresso/35">
            {formatMoney(thisMonthRevenue, settings.currency, settings.locale)} this month
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-espresso/40">Active packages</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-blue-600">
                <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-2xl font-semibold text-espresso">
            {packages.filter((p) => p.is_active).length}
          </div>
          <div className="mt-1 text-[11px] text-espresso/35">
            {packages.length} total
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-latte/30 px-5 py-4">
            <h2 className="font-serif text-base text-espresso">
              Upcoming events
            </h2>
            <Link
              href="/admin/calendar"
              className="text-xs text-mocha hover:underline"
            >
              View calendar
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-espresso/40">
              No upcoming confirmed events.
            </div>
          ) : (
            <ul className="divide-y divide-latte/20">
              {upcoming.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-sand/20"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-espresso">
                          {b.customer_name}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="mt-0.5 truncate text-xs text-espresso/45">
                        {b.package_name} &middot; {b.event_location}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-medium text-espresso">
                        {formatDate(b.event_date, settings.locale)}
                      </div>
                      <div className="text-[11px] font-mono text-espresso/35">
                        {b.reference}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-latte/30 px-5 py-4">
            <h2 className="font-serif text-base text-espresso">
              Recent bookings
            </h2>
            <Link
              href="/admin/bookings"
              className="text-xs text-mocha hover:underline"
            >
              View all
            </Link>
          </div>
          {recentBookings.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-espresso/40">
              No bookings yet.
            </div>
          ) : (
            <ul className="divide-y divide-latte/20">
              {recentBookings.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-sand/20"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-espresso">
                          {b.customer_name}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="mt-0.5 truncate text-xs text-espresso/45">
                        {b.package_name} &middot; {formatMoney(b.amount_paid_cents, settings.currency, settings.locale)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-mono text-espresso/35">
                        {b.reference}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="card overflow-hidden">
          <div className="border-b border-latte/30 px-5 py-4">
            <h2 className="font-serif text-base text-espresso">
              Package popularity
            </h2>
          </div>
          {packageStats.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-espresso/40">
              No packages yet.
            </div>
          ) : (
            <div className="p-5">
              <div className="space-y-3">
                {packageStats.map((p) => {
                  const maxCount = Math.max(1, packageStats[0]?.count ?? 1);
                  const pct = Math.round((p.count / maxCount) * 100);
                  return (
                    <div key={p.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-espresso">
                          {p.name}
                          {!p.active && (
                            <span className="ml-1.5 text-xs text-espresso/30">(inactive)</span>
                          )}
                        </span>
                        <span className="font-medium text-espresso/70">
                          {p.count} booking{p.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-latte/30 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-maroon/60 to-mocha/60 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
