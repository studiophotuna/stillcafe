"use client";

export default function GlobalError({
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
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-espresso/60">
          We hit an unexpected error. Please try again.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-espresso/30">
            Error: {error.digest}
          </p>
        )}
        <button onClick={reset} className="btn-primary mt-6">
          Try again
        </button>
      </div>
    </div>
  );
}
