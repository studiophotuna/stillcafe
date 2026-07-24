import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "@/components/admin/LoginForm";
import { ADMIN_THEME } from "@/lib/admin-theme";
import { getSiteContent } from "@/lib/data";

export const revalidate = 300;

export default async function AdminLoginPage() {
  let brandName = "My Business";
  let logoUrl: string | null = null;
  try {
    const content = await getSiteContent();
    brandName = content.brand_name;
    logoUrl = content.logo_url;
  } catch {}

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-cream px-5"
      style={ADMIN_THEME as React.CSSProperties}
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={brandName}
              width={56}
              height={56}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-espresso text-lg font-bold text-cream">
              {brandName.charAt(0)}
            </div>
          )}
          <h1 className="mt-3 font-serif text-2xl text-espresso">
            {brandName}
          </h1>
          <p className="mt-1 text-sm text-espresso/45">
            Sign in to manage your bookings.
          </p>
        </div>
        <div className="card overflow-hidden p-6">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
