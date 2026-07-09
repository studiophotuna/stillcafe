import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-latte bg-cream">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-espresso/70 sm:flex-row">
        <div className="flex items-center gap-2">
          <span>☕</span>
          <span className="font-serif font-semibold">Still Café</span>
          <span className="text-espresso/40">·</span>
          <span>Mobile coffee cart</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/book" className="hover:text-mocha">
            Book an Event
          </Link>
          <Link href="/admin" className="hover:text-mocha">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
