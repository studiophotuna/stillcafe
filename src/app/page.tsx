import Link from "next/link";
import Image from "next/image";
import { getSiteContent } from "@/lib/data";

export const dynamic = "force-dynamic";

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1 0-5.78c.27 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 1 0 6.34 6.34V9.44a8.16 8.16 0 0 0 3.76.92V6.91a4.85 4.85 0 0 1-.01-.22z" />
    </svg>
  );
}

export default async function HomePage() {
  const content = await getSiteContent();

  const bgImage =
    content.bg_mode === "static" && content.bg_static_image
      ? content.bg_static_image
      : content.bg_images.length > 0
        ? content.bg_images[0]
        : "/images/brand-1.jpg";

  const overlayStyle = {
    backgroundColor: content.bg_overlay_color,
    opacity: content.bg_overlay_opacity / 100,
  };

  const hasSocials =
    content.social_instagram || content.social_facebook || content.social_tiktok;

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Background image */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bgImage}
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0" style={overlayStyle} />
      </div>

      {/* Top navigation bar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10 sm:py-7">
        {/* Left: nav links */}
        <div className="flex items-center gap-6 sm:gap-8">
          <Link
            href="#about"
            className="text-[11px] uppercase tracking-[0.2em] text-cream/70 transition-colors hover:text-cream"
          >
            About
          </Link>
          <Link
            href="#faq"
            className="text-[11px] uppercase tracking-[0.2em] text-cream/70 transition-colors hover:text-cream"
          >
            FAQ
          </Link>
        </div>

        {/* Right: social icons + book now */}
        <div className="flex items-center gap-4 sm:gap-5">
          {content.social_instagram && (
            <a
              href={content.social_instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cream/60 transition-colors hover:text-cream"
              aria-label="Instagram"
            >
              <InstagramIcon />
            </a>
          )}
          {content.social_facebook && (
            <a
              href={content.social_facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cream/60 transition-colors hover:text-cream"
              aria-label="Facebook"
            >
              <FacebookIcon />
            </a>
          )}
          {content.social_tiktok && (
            <a
              href={content.social_tiktok}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cream/60 transition-colors hover:text-cream"
              aria-label="TikTok"
            >
              <TikTokIcon />
            </a>
          )}
          {hasSocials && (
            <div className="h-4 w-px bg-cream/20" />
          )}
          <Link
            href="/book"
            className="text-[11px] uppercase tracking-[0.2em] text-cream/70 transition-colors hover:text-cream"
          >
            Book Now
          </Link>
        </div>
      </nav>

      {/* Center: logo + tagline */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center">
          <Image
            src={content.logo_url || "/logo.png"}
            alt={content.brand_name}
            width={180}
            height={180}
            className="rounded-full"
            priority
          />
          <p className="mt-6 text-center text-[11px] uppercase tracking-[0.3em] text-cream/50">
            {content.tagline}
          </p>
        </div>
      </main>

      {/* Bottom: copyright */}
      <footer className="relative z-10 py-5 text-center text-[10px] uppercase tracking-[0.15em] text-cream/25">
        {content.copyright_text}
      </footer>
    </div>
  );
}
