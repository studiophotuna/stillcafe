import Image from "next/image";
import {
  getActivePackages,
  getBookedDates,
  getSettings,
  getSiteContent,
} from "@/lib/data";
import {
  BookingDrawer,
  BookNowTrigger,
} from "@/components/booking/BookingDrawer";
import { NavPagesMenu } from "@/components/landing/NavPagesMenu";
import { BackgroundCarousel } from "@/components/landing/BackgroundCarousel";

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

  // Booking data for the slide-over panel; the page still renders if it fails.
  let packages: Awaited<ReturnType<typeof getActivePackages>> = [];
  let settings: Awaited<ReturnType<typeof getSettings>> | null = null;
  let bookedDates: string[] = [];
  try {
    [packages, settings, bookedDates] = await Promise.all([
      getActivePackages(),
      getSettings(),
      getBookedDates(),
    ]);
  } catch {}

  const carouselImages =
    content.bg_mode === "carousel" && content.bg_images.length > 0
      ? content.bg_images
      : [];
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

  const bookNowCls =
    "rounded-full border border-cream/40 px-5 py-2 text-[11px] uppercase tracking-[0.2em] text-cream/90 backdrop-blur-sm transition-all hover:border-cream hover:bg-cream hover:text-espresso";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Background image / carousel */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {carouselImages.length > 1 ? (
          <BackgroundCarousel images={carouselImages} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgImage}
            alt=""
            className="h-full w-full scale-105 object-cover"
          />
        )}
        <div className="absolute inset-0" style={overlayStyle} />
        {/* Scrims keep nav and footer readable over any photo */}
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/35 to-transparent" />
      </div>

      {/* Top bar: links · logo · socials + book now */}
      <nav className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-start gap-4 px-6 pt-4 sm:px-10 sm:pt-5">
        {/* Left: admin-managed nav pages */}
        <div className="pt-2">
          <NavPagesMenu pages={content.nav_pages} />
        </div>

        {/* Center: logo at the very top, tagline right under it */}
        <div className="animate-fade-in flex flex-col items-center">
          <Image
            src={content.logo_url || "/logo.png"}
            alt={content.brand_name}
            width={120}
            height={120}
            className="h-20 w-20 object-contain sm:h-28 sm:w-28"
            priority
          />
          <p className="mt-3 max-w-xs text-center text-[10px] uppercase tracking-[0.3em] text-cream/60 sm:text-[11px]">
            {content.tagline}
          </p>
        </div>

        {/* Right: social icons + book now */}
        <div className="flex items-center justify-end gap-4 pt-1 sm:gap-5">
          {content.social_instagram && (
            <a
              href={content.social_instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cream/60 transition-all hover:scale-110 hover:text-cream"
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
              className="text-cream/60 transition-all hover:scale-110 hover:text-cream"
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
              className="text-cream/60 transition-all hover:scale-110 hover:text-cream"
              aria-label="TikTok"
            >
              <TikTokIcon />
            </a>
          )}
          {hasSocials && <div className="hidden h-4 w-px bg-cream/20 sm:block" />}
          <BookNowTrigger className={bookNowCls}>Book Now</BookNowTrigger>
        </div>
      </nav>

      {/* Open space: let the background photo breathe */}
      <main className="relative z-10 flex-1" />

      {/* Bottom: copyright */}
      <footer className="relative z-10 py-5 text-center text-[10px] uppercase tracking-[0.15em] text-cream/30">
        {content.copyright_text}
      </footer>

      {/* Right slide-over booking panel */}
      <BookingDrawer
        packages={packages}
        settings={settings}
        bookedDates={bookedDates}
        policies={content.policies}
        wizardFaqs={content.wizard_faqs}
      />
    </div>
  );
}
