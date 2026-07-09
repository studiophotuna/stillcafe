import Link from "next/link";
import Image from "next/image";

const COLLAGE_IMAGES = Array.from(
  { length: 20 },
  (_, i) => `/images/brand-${(i % 15) + 1}.jpg`
);

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-maroon">
      {/* Animated photo collage background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -inset-[50%] rotate-[-12deg]">
          <div className="animate-collage grid h-full w-full grid-cols-5 grid-rows-4 gap-3 p-4">
            {COLLAGE_IMAGES.map((src, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl bg-maroon/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-maroon/70 via-maroon/80 to-maroon/90" />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-20">
        <Image
          src="/logo.png"
          alt="Still Caf&eacute;"
          width={80}
          height={80}
          className="animate-float rounded-full"
          priority
        />
        <h1 className="mt-6 text-center font-serif text-5xl font-semibold leading-[1.1] text-cream sm:text-6xl">
          Still Caf&eacute;
        </h1>
        <p className="mt-3 text-center text-xs uppercase tracking-[0.3em] text-cream/50">
          Be still. Drink coffee.
        </p>
        <p className="mx-auto mt-8 max-w-md text-center text-sm leading-relaxed text-cream/60">
          We&apos;re a small neighborhood caf&eacute; that also brings a full
          espresso bar to your event &mdash; weddings, birthdays, corporate
          gatherings. Good coffee, good vibes, no hassle on your end.
        </p>
        <Link
          href="/book"
          className="mt-10 inline-block rounded-full bg-gradient-to-r from-cream to-white px-8 py-3.5 text-sm font-semibold text-maroon shadow-glow transition hover:scale-[1.02] hover:shadow-elevated active:scale-[0.98]"
        >
          Book your event
        </Link>
        <p className="mt-16 text-xs text-cream/25">
          Serving Metro Manila &middot; Available for private events
        </p>
      </main>

      <footer className="relative z-10 py-4 text-center text-[11px] text-cream/15">
        &copy; {new Date().getFullYear()} Still Caf&eacute;
      </footer>
    </div>
  );
}
