import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default function CancelledPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="border-b border-latte bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-5 py-3">
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
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 items-start px-5 py-12">
        <div className="card w-full p-8 text-center">
          <h1 className="font-serif text-xl text-espresso">
            Payment cancelled
          </h1>
          <p className="mt-2 text-[14px] text-espresso/40">
            No worries — you weren&apos;t charged. You can start a new
            booking whenever you&apos;re ready.
          </p>
          {searchParams.ref && (
            <p className="mt-3 text-[12px] text-espresso/25">
              Ref: <span className="font-mono">{searchParams.ref}</span>
            </p>
          )}
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/book" className="btn-primary">
              Try again
            </Link>
            <Link href="/" className="btn-secondary">
              Back home
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-latte px-5 py-5 text-center text-[11px] text-espresso/20">
        &copy; {new Date().getFullYear()} Still Café
      </footer>
    </div>
  );
}
