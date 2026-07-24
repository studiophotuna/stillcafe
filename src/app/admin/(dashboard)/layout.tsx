import Link from "next/link";
import Image from "next/image";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminAutoRefresh } from "@/components/admin/AdminAutoRefresh";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { ADMIN_THEME } from "@/lib/admin-theme";
import { getSiteContent } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let brandName = "My Business";
  let logoUrl: string | null = null;
  try {
    const content = await getSiteContent();
    brandName = content.brand_name;
    logoUrl = content.logo_url;
  } catch {}

  const brand = (
    <Link href="/admin" className="flex items-center gap-2.5">
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={brandName}
          width={30}
          height={30}
          className="rounded-lg"
        />
      ) : (
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-maroon text-xs font-bold text-cream">
          {brandName.charAt(0)}
        </div>
      )}
      <span className="truncate text-sm font-semibold text-espresso">
        {brandName}
      </span>
    </Link>
  );

  const viewSite = (
    <Link
      href="/"
      target="_blank"
      className="flex items-center gap-1.5 text-xs text-espresso/40 transition-colors hover:text-maroon"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      View site
    </Link>
  );

  return (
    <div
      className="min-h-screen bg-cream lg:flex"
      style={ADMIN_THEME as React.CSSProperties}
    >
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-latte bg-card lg:flex">
        <div className="flex items-center justify-between border-b border-latte px-5 py-4">
          {brand}
          <span className="rounded-md bg-maroon/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-maroon">
            Admin
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <AdminNav vertical />
        </div>
        <div className="space-y-3 border-t border-latte px-5 py-4">
          {viewSite}
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-latte bg-card/95 backdrop-blur-sm lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          {brand}
          <div className="flex items-center gap-3">
            {viewSite}
            <SignOutButton />
          </div>
        </div>
        <div className="overflow-x-auto border-t border-latte/60 px-2 py-1.5">
          <AdminNav />
        </div>
      </header>

      <AdminAutoRefresh />
      <div className="min-w-0 flex-1 lg:pl-60">
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      </div>
    </div>
  );
}
