import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5">
      <div className="w-full max-w-md text-center">
        <h1 className="font-serif text-2xl text-espresso">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-espresso/60">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link href="/" className="btn-primary mt-6 inline-block">
          Back to home
        </Link>
      </div>
    </div>
  );
}
