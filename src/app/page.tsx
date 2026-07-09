import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-espresso">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
        <p className="text-[10px] uppercase tracking-[0.25em] text-cream/25">
          Est. 2025 &middot; Las Pi&ntilde;as City
        </p>
        <h1 className="mt-5 text-center font-serif text-5xl font-semibold leading-[1.1] text-cream sm:text-6xl">
          Still Caf&eacute;
        </h1>
        <p className="mt-3 text-center font-serif text-lg italic text-amber/60">
          Be still, drink coffee.
        </p>
        <p className="mx-auto mt-6 max-w-md text-center text-sm leading-relaxed text-cream/45">
          We&apos;re a small neighborhood caf&eacute; that also brings a full
          espresso bar to your event &mdash; weddings, birthdays, corporate
          gatherings. Good coffee, good vibes, no hassle on your end.
        </p>
        <Link
          href="/book"
          className="mt-10 inline-block rounded-full bg-cream px-8 py-3.5 text-sm font-semibold text-espresso transition hover:bg-white"
        >
          Book your event
        </Link>
        <p className="mt-16 text-xs text-cream/20">
          Serving Metro Manila &middot; Available for private events
        </p>
      </main>
      <footer className="py-4 text-center text-[11px] text-cream/15">
        &copy; {new Date().getFullYear()} Still Caf&eacute;
      </footer>
    </div>
  );
}
