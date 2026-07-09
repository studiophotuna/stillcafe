import Link from "next/link";
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
      <header className="border-b border-latte/30 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-espresso text-[10px] font-bold text-cream">
              SC
            </div>
            <span className="font-serif text-base font-semibold text-espresso">
              Still Caf&eacute;
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs text-espresso/40 hover:text-espresso/70"
          >
            &larr; Back
          </Link>
        </div>
      </header>

      <div className="bg-espresso">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:py-12">
          <p className="text-[10px] uppercase tracking-[0.2em] text-cream/25">
            Still Caf&eacute; &middot; Event Booking
          </p>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-cream sm:text-3xl">
            Let&apos;s get your event booked
          </h1>
          <p className="mt-2 max-w-md text-sm text-cream/40">
            Pick a date, choose your setup, and we&apos;ll handle the rest.
            Takes about 5 minutes.
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:py-10">
        {loadError || !settings ? (
          <div className="card mx-auto max-w-lg p-10 text-center">
            <p className="text-lg font-medium text-espresso">
              Something went wrong on our end.
            </p>
            <p className="mt-2 text-sm text-espresso/50">
              Try refreshing, or send us a message and we&apos;ll sort it out.
            </p>
            <Link href="/" className="btn-secondary mt-6">
              Go back
            </Link>
          </div>
        ) : packages.length === 0 ? (
          <div className="card mx-auto max-w-lg p-10 text-center">
            <p className="text-lg font-medium text-espresso">
              We&apos;re still setting up our packages.
            </p>
            <p className="mt-2 text-sm text-espresso/50">
              Check back soon or reach out to us directly.
            </p>
            <Link href="/" className="btn-secondary mt-6">
              Go back
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
            <div className="order-2 lg:order-1 lg:col-span-1 lg:sticky lg:top-20">
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

      <footer className="border-t border-latte/20 px-5 py-5 text-center text-xs text-espresso/25">
        &copy; {new Date().getFullYear()} Still Caf&eacute;
      </footer>
    </div>
  );
}
