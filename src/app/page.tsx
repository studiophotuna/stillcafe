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
import { StatusDrawer } from "@/components/booking/StatusDrawer";
import { resolveCopy } from "@/lib/copy";
import { resolveTextSizes, textSizeVars } from "@/lib/text-sizes";
import { resolveTextStyles, textStyleVars } from "@/lib/text-styles";

export const dynamic = "force-dynamic";

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-[1.35em] w-[1.35em]">
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

  const copy = resolveCopy(content.copy);

  // Landing base font size drives all landing text via em units. clamp keeps
  // it readable on phones (scales with viewport) and capped on desktop.
  const landingSize = Math.min(48, Math.max(12, content.font_size_landing || 22));
  const sizes = resolveTextSizes(content.text_sizes);
  const styles = resolveTextStyles(content.text_sizes);
  const landingFontStyle = {
    fontSize: `clamp(15px, 4.2vw, ${landingSize}px)`,
    ...textSizeVars(sizes),
    ...textStyleVars(styles),
  } as React.CSSProperties;

  const bookNowCls =
    "rounded-full border border-espresso px-[1.4em] py-[0.6em] text-[length:var(--size-links)] uppercase tracking-[0.2em] text-espresso backdrop-blur-sm transition-all hover:bg-espresso hover:text-cream";

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={landingFontStyle}
    >
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
      </div>

      {/* Top bar: links · logo · socials + book now */}
      <nav className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-4 pt-4 sm:gap-4 sm:px-10 sm:pt-5">
        {/* Left: admin-managed nav pages */}
        <div className="pt-2">
          <NavPagesMenu pages={content.nav_pages} />
        </div>

        {/* Center: logo at the very top, tagline right under it */}
        <div className="animate-fade-in flex flex-col items-center">
          {/* Plain img so any uploaded logo keeps its natural aspect ratio
              (height is sized; width follows the ratio). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.logo_url || "/logo.png"}
            alt={content.brand_name}
            className="w-auto object-contain"
            style={{ height: "var(--size-logo)" }}
          />
          <p
            className="mt-3 max-w-[16em] text-center text-[length:var(--size-tagline)] uppercase leading-relaxed tracking-[0.3em] text-espresso"
            style={{ fontWeight: "var(--weight-tagline)", fontStyle: "var(--italic-tagline)" }}
          >
            {content.tagline}
          </p>
        </div>

        {/* Right: social icons + book now */}
        <div className="flex items-center justify-end gap-3 pt-1 sm:gap-5">
          {content.social_instagram && (
            <a
              href={content.social_instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-espresso transition-all hover:scale-110"
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
              className="text-espresso transition-all hover:scale-110"
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
              className="text-espresso transition-all hover:scale-110"
              aria-label="TikTok"
            >
              <TikTokIcon />
            </a>
          )}
          {hasSocials && <div className="hidden h-[1.2em] w-px bg-espresso/25 sm:block" />}
          <BookNowTrigger
            className={bookNowCls}
            style={{ fontWeight: "var(--weight-links)", fontStyle: "var(--italic-links)" }}
          >
            {copy.nav_book_now}
          </BookNowTrigger>
        </div>
      </nav>

      {/* Open space: let the background photo breathe */}
      <main className="relative z-10 flex-1" />

      {/* Bottom: copyright */}
      <footer
        className="relative z-10 py-5 text-center text-[length:var(--size-copyright)] uppercase tracking-[0.15em] text-espresso"
        style={{ fontWeight: "var(--weight-copyright)", fontStyle: "var(--italic-copyright)" }}
      >
        {content.copyright_text}
      </footer>

      {/* Right slide-over booking panel */}
      <BookingDrawer
        packages={packages}
        settings={settings}
        bookedDates={bookedDates}
        policies={content.policies}
        wizardFaqs={content.wizard_faqs}
        copy={copy}
      />

      <StatusDrawer title={copy.status_title} intro={copy.status_intro} />
    </div>
  );
}
