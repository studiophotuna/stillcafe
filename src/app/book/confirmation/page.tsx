import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getBookingByReference } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  const ref = searchParams.ref;
  const booking = ref ? await getBookingByReference(ref).catch(() => null) : null;

  const paid = booking?.status === "paid";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-14">
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sage/20 text-3xl">
            {paid ? "✓" : "☕"}
          </div>
          <h1 className="mt-5 font-serif text-2xl font-semibold text-espresso">
            {paid ? "Booking confirmed!" : "Thank you for your booking!"}
          </h1>
          <p className="mt-2 text-espresso/70">
            {paid
              ? "Your payment was received and your date is reserved."
              : "We've received your booking. If you've just paid, your confirmation will update shortly."}
          </p>

          {booking ? (
            <div className="mt-7 text-left">
              <div className="rounded-xl bg-latte/50 px-5 py-4 text-center">
                <div className="text-xs uppercase tracking-wide text-espresso/50">
                  Booking reference
                </div>
                <div className="mt-1 font-mono text-xl font-semibold text-espresso">
                  {booking.reference}
                </div>
              </div>

              <dl className="mt-5 divide-y divide-latte overflow-hidden rounded-xl border border-latte">
                <Item label="Package" value={booking.package_name} />
                <Item label="Event date" value={formatDate(booking.event_date)} />
                <Item label="Location" value={booking.event_location} />
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

              <p className="mt-5 text-center text-sm text-espresso/60">
                A copy of your booking has been sent to{" "}
                <strong>{booking.customer_email}</strong>. We&apos;ll be in
                touch to finalize the details.
              </p>
            </div>
          ) : (
            <p className="mt-6 text-sm text-espresso/60">
              We couldn&apos;t find that booking reference.
            </p>
          )}

          <Link href="/" className="btn-primary mt-8">
            Back to home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 bg-white px-5 py-3 text-sm">
      <dt className="text-espresso/60">{label}</dt>
      <dd className="text-right font-medium text-espresso">{value}</dd>
    </div>
  );
}
