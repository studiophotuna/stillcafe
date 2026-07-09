import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-espresso">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
        <p className="text-sm text-cream/40">Manila&apos;s mobile coffee cart</p>
        <h1 className="mt-4 text-center font-serif text-5xl font-semibold leading-[1.1] text-cream sm:text-6xl">
          Still Caf&eacute;
        </h1>
        <p className="mx-auto mt-6 max-w-md text-center text-base leading-relaxed text-cream/60">
          We set up a full espresso bar at your wedding, birthday, or corporate
          event &mdash; good coffee, good vibes, no hassle on your end.
        </p>
        <Link
          href="/book"
          className="mt-10 inline-block rounded-full bg-cream px-8 py-3.5 text-sm font-semibold text-espresso transition hover:bg-white"
        >
          Book your date
        </Link>
        <p className="mt-16 text-xs text-cream/25">
          Serving Metro Manila &middot; Available for private events
        </p>
      </main>
      <footer className="py-4 text-center text-[11px] text-cream/20">
        &copy; {new Date().getFullYear()} Still Caf&eacute;
      </footer>
    </div>
  );
}
