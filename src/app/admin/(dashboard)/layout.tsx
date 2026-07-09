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
      <header className="border-b border-latte/40 bg-white shadow-soft">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-espresso text-[10px] font-bold text-cream">
              SC
            </div>
            <span className="font-serif text-base font-semibold text-espresso">
              Still Caf&eacute;
            </span>
            <span className="rounded-md bg-sand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-espresso/40">
              Admin
            </span>
          </Link>
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
