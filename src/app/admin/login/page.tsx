import { Suspense } from "react";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl">☕</div>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-espresso">
            Still Café Admin
          </h1>
          <p className="mt-1 text-sm text-espresso/60">
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
