import Link from "next/link";
import { getAllBookings, getAllPackages } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const [bookings, packages] = await Promise.all([
    getAllBookings(),
    getAllPackages(),
  ]);

  const paid = bookings.filter((b) => b.status === "paid");
  const upcoming = bookings
    .filter(
      (b) =>
        ["paid", "confirmed"].includes(b.status) &&
        new Date(b.event_date) >= new Date(new Date().toDateString())
    )
    .sort(
      (a, b) =>
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    )
    .slice(0, 5);

  const revenue = paid.reduce((sum, b) => sum + b.amount_paid_cents, 0);
  const pendingCount = bookings.filter((b) => b.status === "pending").length;

  const stats = [
    { label: "Total bookings", value: String(bookings.length) },
    { label: "Paid bookings", value: String(paid.length) },
    { label: "Pending", value: String(pendingCount) },
    { label: "Collected", value: formatMoney(revenue) },
    { label: "Active packages", value: String(packages.filter((p) => p.is_active).length) },
  ];

  return (
    <div>
      <h1 className="font-serif text-2xl font-semibold text-espresso">
        Overview
      </h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <div className="text-sm text-espresso/60">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold text-espresso">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-espresso">
            Upcoming events
          </h2>
          <Link
            href="/admin/bookings"
            className="text-sm text-mocha hover:underline"
          >
            View all bookings →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-espresso/60">
            No upcoming confirmed events yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-latte">
            {upcoming.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <div>
                  <div className="font-medium text-espresso">
                    {b.customer_name} · {b.package_name}
                  </div>
                  <div className="text-espresso/60">{b.event_location}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-espresso">
                    {formatDate(b.event_date)}
                  </div>
                  <div className="text-espresso/50">{b.reference}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
