import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getBookingByReference, getSiteContent } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { resolveCopy } from "@/lib/copy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check Booking Status",
  robots: { index: false },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800" },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-800" },
  paid: { label: "Paid", color: "bg-green-100 text-green-800" },
  completed: { label: "Completed", color: "bg-sand text-espresso" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800" },
};

function Shell({
  logoUrl,
  brandName,
  copyright,
  children,
}: {
  logoUrl: string;
  brandName: string;
  copyright: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link
          href="/book"
          className="text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
        >
          &larr; Book
        </Link>
        <Link href="/" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Image
            src={logoUrl}
            alt={brandName}
            width={40}
            height={40}
            className="rounded-full"
          />
        </Link>
        <div />
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-5 py-8">
        {children}
      </main>

      <footer className="py-5 text-center text-[10px] uppercase tracking-[0.15em] text-espresso/20">
        {copyright}
      </footer>
    </div>
  );
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  const ref = searchParams.ref?.trim().toUpperCase();
  const content = await getSiteContent();
  const brandName = content.brand_name;
  const logoUrl = content.logo_url || "/logo.png";
  const copyright =
    content.copyright_text ?? `© ${new Date().getFullYear()} ${brandName}`;
  const copy = resolveCopy(content.copy);

  if (!ref) {
    return (
      <Shell logoUrl={logoUrl} brandName={brandName} copyright={copyright}>
        <div className="card w-full max-w-md animate-rise p-8">
          <h1 className="font-serif text-xl text-espresso">
            {copy.status_title}
          </h1>
          <p className="mt-2 text-sm text-espresso/45">
            {copy.status_intro}
          </p>
          <form className="mt-6">
            <input
              name="ref"
              type="text"
              placeholder="e.g. BK-A3X9P2"
              required
              className="field-input text-center font-mono text-lg uppercase tracking-wider"
            />
            <button type="submit" className="btn-primary mt-4 w-full">
              Look up
            </button>
          </form>
        </div>
        <Link
          href="/book"
          className="mt-6 text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
        >
          Make a new booking
        </Link>
      </Shell>
    );
  }

  const booking = await getBookingByReference(ref);

  if (!booking) {
    return (
      <Shell logoUrl={logoUrl} brandName={brandName} copyright={copyright}>
        <div className="card w-full max-w-md animate-rise p-8 text-center">
          <h1 className="font-serif text-xl text-espresso">
            Booking not found
          </h1>
          <p className="mt-2 text-sm text-espresso/45">
            No booking matches reference{" "}
            <span className="font-mono text-espresso/70">{ref}</span>.
            Double-check and try again.
          </p>
          <Link href="/book/status" className="btn-secondary mt-6 inline-block">
            Try again
          </Link>
        </div>
      </Shell>
    );
  }

  const statusInfo = STATUS_LABELS[booking.status] ?? STATUS_LABELS.pending;

  return (
    <Shell logoUrl={logoUrl} brandName={brandName} copyright={copyright}>
      <div className="card w-full animate-rise overflow-hidden">
        <div className="flex items-center justify-between border-b border-latte/30 px-6 py-5">
          <h1 className="font-serif text-xl text-espresso">
            Booking details
          </h1>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="p-6">
          <dl className="space-y-3 text-sm">
            <Row label="Reference" value={booking.reference} mono />
            <Row label="Package" value={booking.package_name} />
            <Row label="Event date" value={formatDate(booking.event_date)} />
            {booking.event_time && <Row label="Time" value={booking.event_time} />}
            <Row label="Location" value={booking.event_location} />
            {booking.event_type && <Row label="Event type" value={booking.event_type} />}
            {booking.guest_count && <Row label="Guests" value={String(booking.guest_count)} />}
            <Row label="Name" value={booking.customer_name} />
            <div className="space-y-3 border-t border-latte/40 pt-3">
              <Row label="Total" value={formatMoney(booking.package_price_cents)} />
              <Row label="Deposit due" value={formatMoney(booking.amount_due_cents)} />
              <Row label="Amount paid" value={formatMoney(booking.amount_paid_cents)} />
            </div>
          </dl>

          {booking.status === "pending" && (
            <p className="mt-6 rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Your booking is pending payment. Complete the deposit to confirm your date.
            </p>
          )}
          {booking.status === "confirmed" && (
            <p className="mt-6 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Your date is confirmed. The remaining balance is due on or before the event day.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-6">
        <Link
          href="/book/status"
          className="text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
        >
          Look up another
        </Link>
        <Link
          href="/"
          className="text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
        >
          Back to home
        </Link>
      </div>
    </Shell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-espresso/45">{label}</dt>
      <dd className={`text-right font-medium text-espresso ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
