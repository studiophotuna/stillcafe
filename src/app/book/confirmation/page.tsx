import Link from "next/link";
import Image from "next/image";
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
      <header className="border-b border-latte bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Still Café"
              width={28}
              height={28}
              className="rounded-full"
            />
            <span className="text-sm font-semibold text-espresso">
              Still Café
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 items-start px-5 py-12">
        <div className="card w-full overflow-hidden">
          <div
            className={`border-b border-latte px-6 py-6 text-center ${
              paid ? "bg-emerald-50/50" : "bg-sand/50"
            }`}
          >
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg">
              {paid ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 10l3.5 3.5L15 7" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="7" stroke="#d4a853" strokeWidth="1.5"/>
                  <path d="M10 7v3.5M10 13h.01" stroke="#d4a853" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
            </div>
            <h1 className="font-serif text-xl text-espresso">
              {paid ? "You're all set!" : "Thanks for booking!"}
            </h1>
            <p className="mt-1.5 text-[13px] text-espresso/40">
              {paid
                ? "Payment received — your date is locked in."
                : "We got your booking. If you just paid, give it a moment to update."}
            </p>
          </div>

          {booking ? (
            <div className="p-6">
              <div className="rounded-lg bg-sand/60 p-4 text-center">
                <span className="text-[11px] font-medium text-espresso/25">
                  Your reference
                </span>
                <div className="mt-1 font-mono text-xl font-bold tracking-wide text-espresso">
                  {booking.reference}
                </div>
              </div>

              <dl className="mt-5 divide-y divide-latte overflow-hidden rounded-lg border border-latte">
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
                <p className="mt-5 text-center text-[12px] text-espresso/30">
                  We sent a copy to{" "}
                  <strong className="text-espresso/50">
                    {booking.customer_email}
                  </strong>
                  . We&apos;ll reach out to finalize everything.
                </p>
              )}
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm text-espresso/40">
                We couldn&apos;t find that booking. Double-check your reference
                or get in touch with us.
              </p>
            </div>
          )}

          <div className="border-t border-latte px-6 py-4 text-center">
            <Link href="/" className="btn-primary px-8">
              Back to home
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-latte px-5 py-5 text-center text-[11px] text-espresso/20">
        &copy; {new Date().getFullYear()} Still Café
      </footer>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 bg-white px-4 py-3 text-[13px]">
      <dt className="text-espresso/30">{label}</dt>
      <dd className="text-right font-medium text-espresso">{value}</dd>
    </div>
  );
}
