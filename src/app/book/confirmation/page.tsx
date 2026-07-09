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
      <header className="border-b border-latte/30 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center px-5 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-maroon text-[10px] font-bold text-cream">
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
          <div
            className={`px-6 py-6 text-center ${paid ? "bg-sage/10" : "bg-sand/50"}`}
          >
            <h1 className="font-serif text-xl font-semibold text-espresso">
              {paid ? "You're all set!" : "Thanks for booking!"}
            </h1>
            <p className="mt-2 text-sm text-espresso/50">
              {paid
                ? "Payment received — your date is locked in."
                : "We got your booking. If you just paid, give it a moment to update."}
            </p>
          </div>

          {booking ? (
            <div className="p-6">
              <div className="rounded-xl bg-sand/40 p-4 text-center">
                <span className="text-[11px] text-espresso/30">
                  Your reference
                </span>
                <div className="mt-1 font-mono text-xl font-bold text-espresso">
                  {booking.reference}
                </div>
              </div>

              <dl className="mt-5 divide-y divide-latte/30 overflow-hidden rounded-xl border border-latte/30">
                <Item label="Package" value={booking.package_name} />
                {booking.event_type && (
                  <Item label="Event" value={booking.event_type} />
                )}
                <Item
                  label="Date"
                  value={formatDate(booking.event_date)}
                />
                <Item label="Location" value={booking.event_location} />
                {booking.guest_count && (
                  <Item label="Guests" value={String(booking.guest_count)} />
                )}
                <Item
                  label="Paid"
                  value={formatMoney(booking.amount_paid_cents)}
                />
                {booking.amount_paid_cents < booking.package_price_cents && (
                  <Item
                    label="Remaining"
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

              {booking.customer_email && (
                <p className="mt-5 text-center text-xs text-espresso/40">
                  We sent a copy to{" "}
                  <strong className="text-espresso/60">
                    {booking.customer_email}
                  </strong>
                  . We&apos;ll reach out to finalize everything.
                </p>
              )}
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm text-espresso/50">
                We couldn&apos;t find that booking. Double-check your reference
                or get in touch with us.
              </p>
            </div>
          )}

          <div className="border-t border-latte/30 px-6 py-4 text-center">
            <Link href="/" className="btn-primary px-8">
              Back to home
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-latte/20 px-5 py-5 text-center text-xs text-espresso/25">
        &copy; {new Date().getFullYear()} Still Caf&eacute;
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
