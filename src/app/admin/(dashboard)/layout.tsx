import Link from "next/link";
import Image from "next/image";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminAutoRefresh } from "@/components/admin/AdminAutoRefresh";
import { SignOutButton } from "@/components/admin/SignOutButton";

export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-latte bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/admin" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Still Café"
              width={28}
              height={28}
              className="rounded-full"
            />
            <span className="text-sm font-semibold text-espresso">
              Still Café
            </span>
            <span className="rounded bg-espresso/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-espresso/35">
              Admin
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <AdminNav />
            <div className="hidden h-5 w-px bg-latte sm:block" />
            <SignOutButton />
          </div>
        </div>
      </header>
      <AdminAutoRefresh />
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
