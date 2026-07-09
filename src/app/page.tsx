import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero — full-screen booking-focused landing */}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 py-20">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-espresso via-mocha to-clay" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(192,132,87,0.3)_0%,_transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(212,168,83,0.15)_0%,_transparent_50%)]" />

        {/* Content */}
        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-cream/10 bg-cream/10 backdrop-blur-sm">
            <span className="font-serif text-2xl font-bold text-cream">SC</span>
          </div>

          <h1 className="font-serif text-4xl font-semibold leading-tight text-cream sm:text-5xl lg:text-6xl">
            Still Caf&eacute;
          </h1>
          <p className="mx-auto mt-2 text-lg font-light tracking-wide text-cream/50">
            Mobile Coffee Cart
          </p>

          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-cream/70 sm:text-lg">
            Handcrafted espresso, served fresh at your event. We bring a
            beautiful coffee bar and a friendly barista to weddings, corporate
            events, and celebrations.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/book"
              className="btn bg-cream px-10 py-4 text-base font-bold text-espresso shadow-glow transition-all hover:bg-white hover:shadow-elevated active:scale-[0.98]"
            >
              Book Your Event
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="mx-auto mt-14 flex max-w-md flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-cream/40">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-1 rounded-full bg-caramel/60" />
              Metro Manila
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-1 rounded-full bg-caramel/60" />
              Weddings &amp; Events
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-1 rounded-full bg-caramel/60" />
              Online Booking
            </span>
          </div>
        </div>
      </div>

      {/* Minimal footer */}
      <div className="border-t border-espresso/10 bg-espresso px-5 py-4 text-center text-xs text-cream/30">
        Still Caf&eacute; &middot; Mobile Coffee Cart &middot; &copy;{" "}
        {new Date().getFullYear()}
      </div>
    </div>
  );
}
