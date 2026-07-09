import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-latte/70 bg-cream/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">☕</span>
          <span className="font-serif text-xl font-semibold tracking-tight text-espresso">
            Still Café
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-espresso/80">
          <Link href="/#packages" className="hidden hover:text-mocha sm:inline">
            Packages
          </Link>
          <Link href="/#how" className="hidden hover:text-mocha sm:inline">
            How it works
          </Link>
          <Link href="/book" className="btn-primary px-5 py-2.5">
            Book an Event
          </Link>
        </nav>
      </div>
    </header>
  );
}
