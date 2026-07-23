import Link from "next/link";
import { getAllBookings, getAllPackages } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { StatusBadge } from "@/components/admin/StatusBadge";

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
    { label: "Paid", value: String(paid.length) },
    { label: "Pending", value: String(pendingCount) },
    { label: "Revenue", value: formatMoney(revenue) },
    {
      label: "Active packages",
      value: String(packages.filter((p) => p.is_active).length),
    },
  ];

  return (
    <div>
      <h1 className="font-serif text-2xl text-espresso">Overview</h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <div className="text-[12px] font-medium text-espresso/30">
              {s.label}
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums text-espresso">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 card overflow-hidden">
        <div className="flex items-center justify-between border-b border-latte px-5 py-4">
          <h2 className="font-serif text-lg text-espresso">
            Upcoming events
          </h2>
          <Link
            href="/admin/bookings"
            className="text-[13px] font-medium text-maroon hover:underline"
          >
            View all
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-espresso/35">
            No upcoming confirmed events yet.
          </p>
        ) : (
          <ul className="divide-y divide-latte">
            {upcoming.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between px-5 py-3.5 text-sm"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge status={b.status} />
                  <div>
                    <div className="font-medium text-espresso">
                      {b.customer_name}
                    </div>
                    <div className="text-[13px] text-espresso/35">
                      {b.package_name} · {b.event_location}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium tabular-nums text-espresso">
                    {formatDate(b.event_date)}
                  </div>
                  <div className="font-mono text-[11px] text-espresso/25">
                    {b.reference}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
