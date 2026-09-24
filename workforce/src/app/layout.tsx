import type { Metadata } from "next";
import "./industry.css";
import "./workload.css";

export const metadata: Metadata = {
  title: "Workforce Management",
  description: "DSV BSS workforce management: calendar and workload.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@400;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
