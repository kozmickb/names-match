import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12 text-center">
      <div className="max-w-sm">
        <div className="text-5xl">🍼</div>
        <h1 className="mt-4 font-serif text-3xl text-stone-800">Page not found</h1>
        <p className="mt-2 text-sm text-stone-500">
          That page wandered off. Let&rsquo;s get you back to the names.
        </p>
        <Link
          href="/swipe"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-medium px-5 py-3 min-h-[44px] text-sm active:scale-[0.98] transition"
        >
          Back to swiping
        </Link>
      </div>
    </main>
  );
}
