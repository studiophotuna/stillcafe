import Link from "next/link";
import Image from "next/image";
import { getSiteContent } from "@/lib/data";

export async function SiteHeader({ minimal }: { minimal?: boolean }) {
  let brandName = "My Business";
  let logoUrl: string | null = null;
  let ctaText = "Book Now";
  try {
    const content = await getSiteContent();
    brandName = content.brand_name;
    logoUrl = content.logo_url;
    ctaText = content.cta_text || "Book Now";
  } catch {}

  return (
    <header className="sticky top-0 z-40 border-b border-latte/30 bg-cream/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={brandName}
              width={30}
              height={30}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-espresso text-[11px] text-cream">
              {brandName.charAt(0)}
            </div>
          )}
          <span className="font-serif text-base text-espresso">
            {brandName}
          </span>
        </Link>
        {!minimal && (
          <Link href="/book" className="btn-primary px-5 py-2">
            {ctaText}
          </Link>
        )}
      </div>
    </header>
  );
}
