import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-espresso">
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Still Café"
            width={36}
            height={36}
            className="rounded-full"
            priority
          />
          <span className="text-sm font-medium tracking-wide text-cream/70">
            Still Café
          </span>
        </div>
        <Link
          href="/book"
          className="rounded-lg bg-cream/10 px-4 py-2 text-sm font-medium text-cream/80 backdrop-blur-sm transition hover:bg-cream/20 hover:text-cream"
        >
          Book now
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-20">
        <div className="animate-fade-in text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-cream/30">
            Mobile espresso bar for events
          </p>

          <h1 className="mt-5 font-serif text-5xl leading-[1.1] text-cream sm:text-7xl">
            Be still.
            <br />
            Drink coffee.
          </h1>

          <p className="mx-auto mt-6 max-w-sm text-[15px] leading-relaxed text-cream/45">
            We bring a full espresso bar to your event — weddings,
            birthdays, corporate gatherings. Good coffee, good vibes,
            no hassle on your end.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/book"
              className="inline-flex items-center gap-2 rounded-lg bg-cream px-7 py-3 text-sm font-semibold text-espresso transition hover:bg-white active:scale-[0.98]"
            >
              Book your event
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-40">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <span className="text-[13px] text-cream/25">
              Takes about 5 minutes
            </span>
          </div>
        </div>

        <div className="animate-slide-up-delay mt-20 flex items-center gap-8 text-center sm:gap-12">
          <div>
            <div className="text-2xl font-semibold text-cream/80">500+</div>
            <div className="mt-1 text-[11px] text-cream/25">Events served</div>
          </div>
          <div className="h-8 w-px bg-cream/10" />
          <div>
            <div className="text-2xl font-semibold text-cream/80">4.9</div>
            <div className="mt-1 text-[11px] text-cream/25">Client rating</div>
          </div>
          <div className="h-8 w-px bg-cream/10" />
          <div>
            <div className="text-2xl font-semibold text-cream/80">Metro Manila</div>
            <div className="mt-1 text-[11px] text-cream/25">Service area</div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-6 py-5 text-center text-[11px] text-cream/15">
        &copy; {new Date().getFullYear()} Still Café. All rights reserved.
      </footer>
    </div>
  );
}
