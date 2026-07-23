import Link from "next/link";
import Image from "next/image";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { BookingSidebar } from "@/components/booking/BookingSidebar";
import { getActivePackages, getSettings, getBookedDates } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: { package?: string };
}) {
  let packages: Awaited<ReturnType<typeof getActivePackages>> = [];
  let settings: Awaited<ReturnType<typeof getSettings>> | null = null;
  let bookedDates: string[] = [];
  let loadError = false;

  try {
    [packages, settings, bookedDates] = await Promise.all([
      getActivePackages(),
      getSettings(),
      getBookedDates(),
    ]);
  } catch {
    loadError = true;
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-50 border-b border-latte bg-cream/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
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
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-espresso/40 transition hover:bg-sand hover:text-espresso/70"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </Link>
        </div>
      </header>

      <div className="border-b border-latte bg-white">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-espresso/25">
            Event Booking
          </p>
          <h1 className="mt-2 font-serif text-3xl text-espresso sm:text-4xl">
            Let&apos;s get your event booked
          </h1>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-espresso/40">
            Pick a date, choose your setup, and we&apos;ll handle the rest.
            Takes about 5 minutes.
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:py-10">
        {loadError || !settings ? (
          <div className="card mx-auto max-w-md p-10 text-center">
            <p className="text-lg font-medium text-espresso">
              Something went wrong on our end.
            </p>
            <p className="mt-2 text-sm text-espresso/40">
              Try refreshing, or send us a message and we&apos;ll sort it out.
            </p>
            <Link href="/" className="btn-secondary mt-6">
              Go back
            </Link>
          </div>
        ) : packages.length === 0 ? (
          <div className="card mx-auto max-w-md p-10 text-center">
            <p className="text-lg font-medium text-espresso">
              We&apos;re still setting up our packages.
            </p>
            <p className="mt-2 text-sm text-espresso/40">
              Check back soon or reach out to us directly.
            </p>
            <Link href="/" className="btn-secondary mt-6">
              Go back
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
            <div className="order-2 lg:order-1 lg:col-span-1 lg:sticky lg:top-24">
              <BookingSidebar settings={settings} />
            </div>
            <div className="order-1 lg:order-2 lg:col-span-2">
              <BookingWizard
                packages={packages}
                settings={settings}
                bookedDates={bookedDates}
                initialPackageSlug={searchParams.package}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-latte px-5 py-5 text-center text-[11px] text-espresso/20">
        &copy; {new Date().getFullYear()} Still Café
      </footer>
    </div>
  );
}
