import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { getSiteContent } from "@/lib/data";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Still Cafe - Mobile Coffee Cart Booking",
  description:
    "Book a mobile coffee cart for weddings, corporate events, and celebrations.",
};

function hexToChannels(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "255 255 255";
  return `${r} ${g} ${b}`;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let content: Awaited<ReturnType<typeof getSiteContent>> | null = null;
  try {
    content = await getSiteContent();
  } catch {}

  const themeVars: Record<string, string> = {
    "--color-card": hexToChannels(content?.color_card || "#ffffff"),
  };

  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body style={themeVars}>{children}</body>
    </html>
  );
}
