"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Visible in the browser console and Vercel logs. Wire Sentry.captureException
    // here once @sentry/nextjs is installed (observability-config-hardening).
    console.error(error);
  }, [error]);

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12 text-center">
      <div className="max-w-sm">
        <div className="text-5xl">😶‍🌫️</div>
        <h1 className="mt-4 font-serif text-3xl text-stone-800">Something went sideways</h1>
        <p className="mt-2 text-sm text-stone-500">
          A hiccup on our end — your swipes and matches are safe.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-medium px-5 py-3 min-h-[44px] text-sm active:scale-[0.98] transition"
          >
            Try again
          </button>
          <Link href="/swipe" className="text-xs text-stone-500 underline">
            Back to swiping
          </Link>
        </div>
      </div>
    </main>
  );
}
