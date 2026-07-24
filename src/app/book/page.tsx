import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { BookingWizard } from "@/components/booking/BookingWizard";
import {
  getActivePackages,
  getSettings,
  getBookedDates,
  getSiteContent,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  let brandName = "My Business";
  try {
    const content = await getSiteContent();
    brandName = content.brand_name;
  } catch {}
  return {
    title: `Book — ${brandName}`,
    description: `Reserve your date with ${brandName}.`,
  };
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: { package?: string };
}) {
  let packages: Awaited<ReturnType<typeof getActivePackages>> = [];
  let settings: Awaited<ReturnType<typeof getSettings>> | null = null;
  let bookedDates: string[] = [];
  let content: Awaited<ReturnType<typeof getSiteContent>> | null = null;
  let loadError = false;

  try {
    [packages, settings, bookedDates, content] = await Promise.all([
      getActivePackages(),
      getSettings(),
      getBookedDates(),
      getSiteContent(),
    ]);
  } catch {
    loadError = true;
  }

  const brandName = content?.brand_name ?? "My Business";
  const logoUrl = content?.logo_url || "/logo.png";

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Minimal header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-latte/20 bg-cream/90 px-6 py-4 backdrop-blur-sm sm:px-10">
        <Link
          href="/"
          className="text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
        >
          &larr; Back
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
        <Link
          href="/book/status"
          className="text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
        >
          Check Status
        </Link>
      </header>

      {/* Main content */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-6 sm:py-10">
        {loadError || !settings ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="font-serif text-lg text-espresso">
              Something went wrong
            </p>
            <p className="mt-2 text-sm text-espresso/45">
              Try refreshing, or send us a message.
            </p>
            <Link href="/" className="mt-6 text-[11px] uppercase tracking-[0.2em] text-espresso/50 hover:text-espresso">
              Go back
            </Link>
          </div>
        ) : packages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="font-serif text-lg text-espresso">
              We&apos;re still setting up
            </p>
            <p className="mt-2 text-sm text-espresso/45">
              Check back soon or reach out to us directly.
            </p>
            <Link href="/" className="mt-6 text-[11px] uppercase tracking-[0.2em] text-espresso/50 hover:text-espresso">
              Go back
            </Link>
          </div>
        ) : (
          <div className="animate-rise">
            <BookingWizard
              packages={packages}
              settings={settings}
              bookedDates={bookedDates}
              initialPackageSlug={searchParams.package}
              policies={content?.policies}
              wizardFaqs={content?.wizard_faqs}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-5 text-center text-[10px] uppercase tracking-[0.15em] text-espresso/20">
        {content?.copyright_text ?? `© ${new Date().getFullYear()} ${brandName}`}
      </footer>
    </div>
  );
}
