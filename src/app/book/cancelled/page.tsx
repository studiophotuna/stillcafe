import Link from "next/link";

export const dynamic = "force-dynamic";

export default function CancelledPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="border-b border-latte/30 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center px-5 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-espresso text-[10px] font-bold text-cream">
              SC
            </div>
            <span className="font-serif text-base font-semibold text-espresso">
              Still Caf&eacute;
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 items-start px-5 py-12">
        <div className="card w-full p-8 text-center">
          <h1 className="font-serif text-xl font-semibold text-espresso">
            Payment cancelled
          </h1>
          <p className="mt-2 text-sm text-espresso/50">
            No worries &mdash; you weren&apos;t charged. You can start a new
            booking whenever you&apos;re ready.
          </p>
          {searchParams.ref && (
            <p className="mt-3 text-xs text-espresso/30">
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

      <footer className="border-t border-latte/20 px-5 py-5 text-center text-xs text-espresso/25">
        &copy; {new Date().getFullYear()} Still Caf&eacute;
      </footer>
    </div>
  );
}
