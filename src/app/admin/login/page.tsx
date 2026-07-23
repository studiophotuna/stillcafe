import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image
            src="/logo.png"
            alt="Still Café"
            width={48}
            height={48}
            className="mx-auto rounded-full"
          />
          <h1 className="mt-4 font-serif text-2xl text-espresso">
            Admin
          </h1>
          <p className="mt-1 text-[13px] text-espresso/35">
            Sign in to manage packages and bookings.
          </p>
        </div>
        <div className="card p-6">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
