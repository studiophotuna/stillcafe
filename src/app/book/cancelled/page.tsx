import Link from "next/link";
import Image from "next/image";
import { getSiteContent } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CancelledPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  let content: Awaited<ReturnType<typeof getSiteContent>> | null = null;
  try {
    content = await getSiteContent();
  } catch {}

  const brandName = content?.brand_name ?? "My Business";
  const logoUrl = content?.logo_url || "/logo.png";

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Minimal header */}
      <header className="relative z-10 flex items-center justify-center px-6 py-5 sm:px-10">
        <Link href="/">
          <Image
            src={logoUrl}
            alt={brandName}
            width={40}
            height={40}
            className="rounded-full"
          />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 items-start px-5 py-8">
        <div className="w-full animate-rise overflow-hidden rounded-2xl border border-espresso/8 bg-card p-8 text-center shadow-card">
          <h1 className="font-serif text-xl text-espresso">
            Payment cancelled
          </h1>
          <p className="mt-2 text-sm text-espresso/45">
            No worries — you weren&apos;t charged. You can start a new
            booking whenever you&apos;re ready.
          </p>
          {searchParams.ref && (
            <p className="mt-3 text-xs text-espresso/25">
              Ref: <span className="font-mono">{searchParams.ref}</span>
            </p>
          )}
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/book"
              className="rounded-full bg-espresso px-6 py-2.5 text-xs font-semibold text-cream transition hover:bg-mocha"
            >
              Try again
            </Link>
            <Link
              href="/"
              className="rounded-full border border-espresso/15 px-6 py-2.5 text-xs font-medium text-espresso/50 transition hover:border-espresso/30 hover:text-espresso"
            >
              Back home
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-5 text-center text-[10px] uppercase tracking-[0.15em] text-espresso/20">
        {content?.copyright_text ?? `© ${new Date().getFullYear()} ${brandName}`}
      </footer>
    </div>
  );
}
