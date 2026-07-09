import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PackageCard } from "@/components/PackageCard";
import { getActivePackages } from "@/lib/data";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "1",
    title: "Choose your package",
    body: "Pick the coffee-cart experience that fits your event and guest count.",
  },
  {
    n: "2",
    title: "Tell us about your event",
    body: "Share your date, location, and a few details so we can prepare.",
  },
  {
    n: "3",
    title: "Reserve with a deposit",
    body: "Secure your date online via GCash or card. We handle the rest.",
  },
];

export default async function HomePage() {
  let packages = [] as Awaited<ReturnType<typeof getActivePackages>>;
  let loadError = false;
  try {
    packages = await getActivePackages();
  } catch {
    loadError = true;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:py-24 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-latte/70 px-3 py-1 text-xs font-medium text-mocha">
              ☕ Mobile coffee cart · Metro Manila
            </span>
            <h1 className="mt-5 font-serif text-4xl font-semibold leading-tight text-espresso sm:text-5xl">
              Handcrafted coffee, served fresh at your event.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-espresso/75">
              Still Café brings a beautiful espresso bar and a friendly barista
              to weddings, corporate events, and celebrations. Book your date in
              minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/book" className="btn-primary px-7 py-3.5 text-base">
                Book an Event
              </Link>
              <Link
                href="#packages"
                className="btn-secondary px-7 py-3.5 text-base"
              >
                View packages
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="card flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-latte to-cream text-8xl">
              ☕
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-latte bg-white/60">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-center font-serif text-3xl font-semibold text-espresso">
            How it works
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-mocha text-cream">
                  {s.n}
                </div>
                <h3 className="mt-4 font-serif text-lg font-semibold text-espresso">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-espresso/70">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="mx-auto w-full max-w-6xl px-5 py-16">
        <div className="flex flex-col items-center text-center">
          <h2 className="font-serif text-3xl font-semibold text-espresso">
            Our packages
          </h2>
          <p className="mt-3 max-w-xl text-espresso/70">
            Every package includes setup, teardown, and unlimited smiles. Choose
            one to start your booking.
          </p>
        </div>

        {loadError ? (
          <div className="mt-10 card p-8 text-center text-espresso/70">
            <p>We couldn&apos;t load packages right now.</p>
            <p className="mt-1 text-sm text-espresso/50">
              Make sure your Supabase environment variables are configured.
            </p>
          </div>
        ) : packages.length === 0 ? (
          <div className="mt-10 card p-8 text-center text-espresso/70">
            No packages available yet. Please check back soon.
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                href={`/book?package=${pkg.slug}`}
              />
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="bg-mocha">
        <div className="mx-auto max-w-6xl px-5 py-14 text-center">
          <h2 className="font-serif text-3xl font-semibold text-cream">
            Ready to book your date?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-cream/80">
            Tell us about your event and reserve your coffee cart in a few
            minutes.
          </p>
          <Link
            href="/book"
            className="btn mt-7 bg-cream px-8 py-3.5 text-base text-mocha hover:bg-latte"
          >
            Book an Event
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
