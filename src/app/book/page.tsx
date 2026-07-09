import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { getActivePackages, getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: { package?: string };
}) {
  let packages: Awaited<ReturnType<typeof getActivePackages>> = [];
  let settings: Awaited<ReturnType<typeof getSettings>> | null = null;
  let loadError = false;

  try {
    [packages, settings] = await Promise.all([
      getActivePackages(),
      getSettings(),
    ]);
  } catch {
    loadError = true;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-semibold text-espresso">
            Book an Event
          </h1>
          <p className="mt-2 text-espresso/70">
            Reserve Still Café&apos;s coffee cart for your special day.
          </p>
        </div>

        {loadError || !settings ? (
          <div className="card p-8 text-center text-espresso/70">
            <p>We couldn&apos;t start the booking flow right now.</p>
            <p className="mt-1 text-sm text-espresso/50">
              Please try again later or contact us directly.
            </p>
          </div>
        ) : packages.length === 0 ? (
          <div className="card p-8 text-center text-espresso/70">
            <p>No packages are available for booking yet.</p>
            <Link href="/" className="btn-secondary mt-4">
              Back home
            </Link>
          </div>
        ) : (
          <BookingFlow
            packages={packages}
            settings={settings}
            initialPackageSlug={searchParams.package}
          />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
