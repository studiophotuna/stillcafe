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
      {/* Minimal branded bar — no navigation links */}
      <header className="border-b border-latte/40 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-espresso text-[10px] font-bold text-cream">
              SC
            </div>
            <span className="font-serif text-base font-semibold text-espresso">
              Still Caf&eacute;
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs font-medium text-espresso/40 transition-colors hover:text-espresso/70"
          >
            &larr; Back
          </Link>
        </div>
      </header>

      {/* Page hero */}
      <div className="relative overflow-hidden bg-espresso">
        <div className="absolute inset-0 bg-gradient-to-r from-espresso via-mocha/80 to-clay/60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(192,132,87,0.2)_0%,_transparent_60%)]" />
        <div className="relative z-10 mx-auto max-w-7xl px-5 py-10 text-center sm:py-14">
          <h1 className="font-serif text-2xl font-semibold text-cream sm:text-3xl">
            Book Your Event
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-cream/50">
            Complete the form below to check availability, choose your package,
            and reserve your date with a secure deposit.
          </p>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:py-10">
        {loadError || !settings ? (
          <div className="card mx-auto max-w-lg p-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-latte/50 text-xl">
              !
            </div>
            <p className="font-medium text-espresso">
              We couldn&apos;t start the booking flow right now.
            </p>
            <p className="mt-2 text-sm text-espresso/50">
              Please try again later or contact us directly.
            </p>
            <Link href="/" className="btn-secondary mt-6">
              Go back
            </Link>
          </div>
        ) : packages.length === 0 ? (
          <div className="card mx-auto max-w-lg p-10 text-center">
            <p className="font-medium text-espresso">
              No packages are available for booking yet.
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

      {/* Minimal footer */}
      <footer className="border-t border-latte/30 px-5 py-5 text-center text-xs text-espresso/30">
        Still Caf&eacute; &middot; Mobile Coffee Cart &middot; &copy;{" "}
        {new Date().getFullYear()}
      </footer>
    </div>
  );
}
