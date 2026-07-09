import Link from "next/link";
import { syncBookingPayment } from "@/lib/bookings";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  const ref = searchParams.ref;
  const booking = ref ? await syncBookingPayment(ref).catch(() => null) : null;

  const paid = booking?.status === "paid";

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Minimal header */}
      <header className="border-b border-latte/40 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-espresso text-[10px] font-bold text-cream">
              SC
            </div>
            <span className="font-serif text-base font-semibold text-espresso">
              Still Caf&eacute;
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 items-start px-5 py-12">
        <div className="card w-full overflow-hidden">
          {/* Status header */}
          <div
            className={`px-6 py-6 text-center ${paid ? "bg-sage/10" : "bg-sand/60"}`}
          >
            <div
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${
                paid
                  ? "bg-sage/20 text-sage"
                  : "bg-espresso/10 text-espresso/40"
              }`}
            >
              {paid ? "✓" : "..."}
            </div>
            <h1 className="mt-4 font-serif text-xl font-semibold text-espresso">
              {paid ? "Booking confirmed!" : "Thank you for your booking!"}
            </h1>
            <p className="mt-1.5 text-sm text-espresso/50">
              {paid
                ? "Your payment was received and your date is reserved."
                : "We've received your booking. If you've just paid, your confirmation will update shortly."}
            </p>
          </div>

          {booking ? (
            <div className="p-6">
              {/* Reference */}
              <div className="rounded-xl bg-sand/50 p-4 text-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-espresso/30">
                  Booking reference
                </span>
                <div className="mt-1 font-mono text-xl font-bold text-espresso">
                  {booking.reference}
                </div>
              </div>

              {/* Details */}
              <dl className="mt-5 divide-y divide-latte/40 overflow-hidden rounded-xl border border-latte/40">
                <Item label="Package" value={booking.package_name} />
                {booking.event_type && (
                  <Item label="Event type" value={booking.event_type} />
                )}
                <Item
                  label="Event date"
                  value={formatDate(booking.event_date)}
                />
                <Item label="Location" value={booking.event_location} />
                {booking.guest_count && (
                  <Item label="Guests" value={String(booking.guest_count)} />
                )}
                <Item
                  label="Amount paid"
                  value={formatMoney(booking.amount_paid_cents)}
                />
                {booking.amount_paid_cents < booking.package_price_cents && (
                  <Item
                    label="Balance"
                    value={formatMoney(
                      booking.package_price_cents - booking.amount_paid_cents
                    )}
                  />
                )}
                <Item
                  label="Status"
                  value={
                    booking.status.charAt(0).toUpperCase() +
                    booking.status.slice(1)
                  }
                />
              </dl>

              <p className="mt-5 text-center text-xs text-espresso/40">
                A copy of your booking has been sent to{" "}
                <strong className="text-espresso/60">
                  {booking.customer_email}
                </strong>
                . We&apos;ll be in touch to finalize the details.
              </p>
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm text-espresso/50">
                We couldn&apos;t find that booking reference.
              </p>
            </div>
          )}

          <div className="border-t border-latte/40 px-6 py-4 text-center">
            <Link href="/" className="btn-primary px-8">
              Back to home
            </Link>
          </div>
        </div>
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-latte/30 px-5 py-5 text-center text-xs text-espresso/30">
        Still Caf&eacute; &middot; Mobile Coffee Cart &middot; &copy;{" "}
        {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 bg-white px-4 py-3 text-sm">
      <dt className="text-espresso/40">{label}</dt>
      <dd className="text-right font-medium text-espresso">{value}</dd>
    </div>
  );
}
