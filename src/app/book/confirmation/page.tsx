import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { syncBookingPayment } from "@/lib/bookings";
import { getSiteContent } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking Confirmation",
  robots: { index: false },
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  const ref = searchParams.ref;
  const [booking, content] = await Promise.all([
    ref ? syncBookingPayment(ref).catch(() => null) : Promise.resolve(null),
    getSiteContent().catch(() => null),
  ]);

  const brandName = content?.brand_name ?? "My Business";
  const logoUrl = content?.logo_url || "/logo.png";
  const paid = booking?.status === "paid";

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Minimal header */}
      <header className="relative z-10 flex items-center justify-center px-6 py-5 sm:px-10">
        <Link href="/">
          <Image
            src={logoUrl}
            alt={brandName}
            width={40}
            height={40}
            className="rounded-full"
          />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-start px-5 py-8">
        <div className="w-full animate-rise overflow-hidden rounded-2xl border border-espresso/8 bg-card shadow-card">
          <div className="border-b border-espresso/8 px-6 py-6 text-center">
            <h1 className="font-serif text-xl text-espresso">
              {paid ? "You’re all set!" : "Thanks for booking!"}
            </h1>
            <p className="mt-2 text-sm text-espresso/45">
              {paid
                ? "Payment received — your date is locked in."
                : "We got your booking. If you just paid, give it a moment to update."}
            </p>
          </div>

          {booking ? (
            <div className="p-6">
              <div className="rounded-lg bg-sand/40 p-4 text-center">
                <span className="text-[10px] uppercase tracking-[0.15em] text-espresso/30">
                  Your reference
                </span>
                <div className="mt-1 font-mono text-xl font-bold text-espresso">
                  {booking.reference}
                </div>
              </div>

              <dl className="mt-5 divide-y divide-espresso/8 overflow-hidden rounded-lg border border-espresso/8">
                <Item label="Package" value={booking.package_name} />
                {booking.event_type && (
                  <Item label="Event" value={booking.event_type} />
                )}
                <Item label="Date" value={formatDate(booking.event_date)} />
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
                <p className="mt-5 text-center text-xs text-espresso/35">
                  We sent a copy to{" "}
                  <strong className="text-espresso/55">
                    {booking.customer_email}
                  </strong>
                  . We&apos;ll reach out to finalize everything.
                </p>
              )}
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm text-espresso/45">
                We couldn&apos;t find that booking. Double-check your reference
                or get in touch with us.
              </p>
            </div>
          )}

          <div className="border-t border-espresso/8 px-6 py-4 text-center space-x-4">
            <Link
              href="/"
              className="text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
            >
              Back to home
            </Link>
            <Link
              href={`/book/status${booking ? `?ref=${booking.reference}` : ""}`}
              className="text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
            >
              Check status
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-5 text-center text-[10px] uppercase tracking-[0.15em] text-espresso/20">
        {content?.copyright_text ?? `© ${new Date().getFullYear()} ${brandName}`}
      </footer>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 bg-card px-4 py-3 text-sm">
      <dt className="text-espresso/35">{label}</dt>
      <dd className="text-right font-medium text-espresso">{value}</dd>
    </div>
  );
}
