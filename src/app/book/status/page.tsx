"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function StatusPage() {
  const [ref, setRef] = useState("");

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link
          href="/book"
          className="text-[11px] uppercase tracking-[0.2em] text-espresso/40 transition-colors hover:text-espresso/70"
        >
          &larr; Book
        </Link>
        <Link href="/" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Image
            src="/logo.png"
            alt="Home"
            width={40}
            height={40}
            className="rounded-full"
          />
        </Link>
        <div />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 py-8">
        <h1 className="font-serif text-xl text-espresso">Check your booking</h1>
        <p className="mt-2 text-center text-sm text-espresso/45">
          Enter the reference number from your confirmation email.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ref.trim()) {
              window.location.href = `/book/confirmation?ref=${encodeURIComponent(ref.trim())}`;
            }
          }}
          className="mt-6 flex w-full gap-2"
        >
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="e.g. BK-A1B2C3"
            className="field-input flex-1"
          />
          <button
            type="submit"
            className="rounded-full bg-espresso px-5 py-3 text-xs font-semibold text-cream transition hover:bg-mocha"
          >
            Look up
          </button>
        </form>
      </main>

      <footer className="py-5 text-center text-[10px] uppercase tracking-[0.15em] text-espresso/20">
        &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
