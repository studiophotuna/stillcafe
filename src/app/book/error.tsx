"use client";

import Link from "next/link";

export default function BookingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5">
      <div className="w-full max-w-md text-center">
        <h1 className="font-serif text-2xl text-espresso">
          Booking unavailable
        </h1>
        <p className="mt-2 text-sm text-espresso/60">
          We couldn&apos;t load the booking page. Please try again in a moment.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
