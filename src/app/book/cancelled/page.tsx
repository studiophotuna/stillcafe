import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

export default function CancelledPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-14">
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-latte text-3xl">
            ☕
          </div>
          <h1 className="mt-5 font-serif text-2xl font-semibold text-espresso">
            Payment cancelled
          </h1>
          <p className="mt-2 text-espresso/70">
            No worries — your booking wasn&apos;t completed and you weren&apos;t
            charged. You can try again whenever you&apos;re ready.
          </p>
          {searchParams.ref && (
            <p className="mt-3 text-sm text-espresso/50">
              Reference: <span className="font-mono">{searchParams.ref}</span>
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
      <SiteFooter />
    </div>
  );
}
