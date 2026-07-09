import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
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
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-3xl font-bold leading-tight text-espresso sm:text-5xl">
            Book Still Café for your event
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-espresso/70">
            Complete our simplified booking wizard to review pricing, check
            real-time availability, and secure your event details.
          </p>
        </div>

        {loadError || !settings ? (
          <div className="card mx-auto max-w-lg p-8 text-center text-espresso/70">
            <p>We couldn&apos;t start the booking flow right now.</p>
            <p className="mt-1 text-sm text-espresso/50">
              Please try again later or contact us directly.
            </p>
          </div>
        ) : packages.length === 0 ? (
          <div className="card mx-auto max-w-lg p-8 text-center text-espresso/70">
            <p>No packages are available for booking yet.</p>
            <Link href="/" className="btn-secondary mt-4">
              Back home
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <BookingSidebar settings={settings} />
            </div>
            <div className="lg:col-span-2">
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
      <SiteFooter />
    </div>
  );
}
