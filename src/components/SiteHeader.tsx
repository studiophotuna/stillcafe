import Link from "next/link";
import Image from "next/image";

export function SiteHeader({ minimal }: { minimal?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-latte bg-cream/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Still Café"
            width={28}
            height={28}
            className="rounded-full"
          />
          <span className="text-sm font-semibold text-espresso">
            Still Café
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
