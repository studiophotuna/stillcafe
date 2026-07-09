"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/packages", label: "Packages" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {LINKS.map((l) => {
        const active =
          l.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              active
                ? "bg-mocha text-cream"
                : "text-espresso/70 hover:bg-latte/60"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
