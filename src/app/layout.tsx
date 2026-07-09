import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Still Café — Mobile Coffee Cart Booking",
  description:
    "Book Still Café's mobile coffee cart for weddings, corporate events, and celebrations. Handcrafted espresso, served fresh at your event.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
