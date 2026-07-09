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
      <header className="sticky top-0 z-50 border-b border-latte/20 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Still Caf&eacute;"
              width={32}
              height={32}
              className="rounded-full"
            />
            <span className="font-serif text-base font-semibold text-espresso">
              Still Caf&eacute;
            </span>
          </Link>
          <Link
            href="/"
            className="rounded-full bg-sand/60 px-4 py-1.5 text-xs font-medium text-espresso/50 transition hover:bg-sand hover:text-espresso"
          >
            &larr; Back
          </Link>
        </div>
      </header>

      <div className="relative overflow-hidden bg-gradient-to-br from-maroon via-[#6b2520] to-mocha">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-caramel blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-amber blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 py-12 sm:py-16">
          <p className="text-[10px] uppercase tracking-[0.25em] text-cream/30">
            Still Caf&eacute; &middot; Event Booking
          </p>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-cream sm:text-4xl">
            Let&apos;s get your event booked
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-cream/50">
            Pick a date, choose your setup, and we&apos;ll handle the rest.
            Takes about 5 minutes.
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:py-10">
        {loadError || !settings ? (
          <div className="glass mx-auto max-w-lg rounded-3xl p-10 text-center">
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
          <div className="glass mx-auto max-w-lg rounded-3xl p-10 text-center">
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

      <footer className="border-t border-latte/20 px-5 py-5 text-center text-xs text-espresso/25">
        &copy; {new Date().getFullYear()} Still Caf&eacute;
      </footer>
    </div>
  );
}
