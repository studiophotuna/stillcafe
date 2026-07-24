import type { Metadata } from "next";
import { getSiteContent } from "@/lib/data";
import {
  DEFAULT_BODY_FONT,
  DEFAULT_DISPLAY_FONT,
  googleFontLinks,
  sanitizeBodyFont,
  sanitizeDisplayFont,
} from "@/lib/fonts";
import "./globals.css";

function hexToChannels(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export async function generateMetadata(): Promise<Metadata> {
  let brandName = "My Business";
  try {
    const content = await getSiteContent();
    brandName = content.brand_name;
  } catch {}
  return {
    title: `${brandName} — Event Booking`,
    description: `Book ${brandName} for your next event. Easy online booking with secure payment.`,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let vars: Record<string, string> = {};
  let displayFont = DEFAULT_DISPLAY_FONT;
  let bodyFont = DEFAULT_BODY_FONT;
  let fontSize = 16;
  let fontWeight = 400;
  try {
    const content = await getSiteContent();
    displayFont = sanitizeDisplayFont(content.font_display);
    bodyFont = sanitizeBodyFont(content.font_body);
    fontSize = Math.min(18, Math.max(14, content.font_size_base || 16));
    fontWeight = Math.min(500, Math.max(300, content.font_weight_body || 400));
    vars = {
      "--color-primary": hexToChannels(content.color_primary),
      "--color-accent": hexToChannels(content.color_accent),
      "--color-page-bg": hexToChannels(content.color_page_bg),
      "--color-text": hexToChannels(content.color_text),
      "--color-surface": hexToChannels(content.color_surface),
      "--color-border": hexToChannels(content.color_border),
      "--color-highlight": hexToChannels(content.color_highlight),
      "--color-card": hexToChannels(content.color_card || "#ffffff"),
    };
  } catch {}

  const style = {
    ...vars,
    "--font-display": `'${displayFont}', Georgia, serif`,
    "--font-body": `'${bodyFont}', ui-sans-serif, system-ui, sans-serif`,
    fontSize: `${fontSize}px`,
  } as React.CSSProperties;

  return (
    <html lang="en" style={style}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {googleFontLinks(displayFont, bodyFont).map((href) => (
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body
        style={{
          fontFamily: "var(--font-body)",
          fontWeight,
        }}
      >
        {children}
      </body>
    </html>
  );
}
