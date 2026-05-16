"use client";

import { useUser } from "@/components/user-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion } from "framer-motion";
import type { UserSlug } from "@/lib/user";

const tileMeta: { slug: UserSlug; label: string; gradient: string }[] = [
  {
    slug: "karo",
    label: "Karo",
    gradient: "from-amber-200 via-amber-100 to-rose-100",
  },
  {
    slug: "lucy",
    label: "Lucy",
    gradient: "from-rose-200 via-rose-100 to-amber-100",
  },
];

export default function OnboardingPage() {
  const { user, ready, setUser, profiles } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace("/swipe");
  }, [ready, user, router]);

  if (!ready) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="h-8 w-32 rounded-full bg-stone-200 animate-pulse" />
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-5xl mb-3">🍼</div>
          <h1 className="font-serif text-4xl tracking-tight text-stone-800">Who is swiping?</h1>
          <p className="mt-3 text-stone-600">Pick once. You can switch in Settings.</p>
        </motion.div>

        <div className="mt-10 grid grid-cols-2 gap-4">
          {tileMeta.map((t, i) => (
            <motion.button
              key={t.slug}
              type="button"
              onClick={() => {
                setUser(t.slug);
                router.replace("/swipe");
              }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
              whileTap={{ scale: 0.96 }}
              whileHover={{ y: -2 }}
              className={`group relative overflow-hidden rounded-3xl border border-stone-200/70 bg-gradient-to-br ${t.gradient} aspect-[3/4] flex flex-col items-center justify-center shadow-sm`}
            >
              <span className="text-6xl">{profiles[t.slug].emoji}</span>
              <span className="mt-3 font-serif text-2xl text-stone-800">{t.label}</span>
            </motion.button>
          ))}
        </div>

        <p className="mt-10 text-xs text-stone-500">Names Match. Built for two.</p>
      </div>
    </main>
  );
}
