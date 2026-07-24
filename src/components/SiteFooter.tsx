import Link from "next/link";
import { getSiteContent } from "@/lib/data";

export async function SiteFooter() {
  let brandName = "My Business";
  let footerTagline = "";
  let copyrightText = "";
  let logoUrl: string | null = null;
  try {
    const content = await getSiteContent();
    brandName = content.brand_name;
    footerTagline = content.footer_tagline || "";
    copyrightText = content.copyright_text || "";
    logoUrl = content.logo_url;
  } catch {}

  const displayCopyright =
    copyrightText || `© ${new Date().getFullYear()} ${brandName}`;

  return (
    <footer className="border-t border-latte/30 bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 text-xs text-espresso/40">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={brandName}
              className="h-5 w-5 rounded-full"
            />
          ) : (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-espresso/10 text-[8px] font-bold text-espresso/60">
              {brandName.charAt(0)}
            </div>
          )}
          <span>
            {brandName}
            {footerTagline ? ` · ${footerTagline}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/book/status" className="hover:text-espresso/70">
            Check booking
          </Link>
          <span>{displayCopyright}</span>
        </div>
      </div>
    </footer>
  );
}
