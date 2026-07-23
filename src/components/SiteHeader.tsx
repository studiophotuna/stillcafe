import Link from "next/link";

export function SiteHeader({ minimal }: { minimal?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-latte/40 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-espresso text-sm text-cream">
            SC
          </div>
          <span className="font-serif text-lg font-semibold tracking-tight text-espresso">
            Still Caf&eacute;
          </span>
        </Link>
        {!minimal && (
          <Link href="/book" className="btn-primary px-5 py-2">
            Book Now
          </Link>
        )}
      </div>
    </header>
  );
}
