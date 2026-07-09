import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
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
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="text-xl">☕</span>
              <span className="font-serif text-lg font-semibold text-espresso">
                Still Café Admin
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <AdminNav />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
