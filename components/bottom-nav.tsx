"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Heart, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch, useUser } from "@/components/user-provider";

const tabs = [
  { href: "/swipe", label: "Swipe", icon: Layers },
  { href: "/matches", label: "Matches", icon: Heart, withCount: true },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user, ready } = useUser();
  const [matchCount, setMatchCount] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await apiFetch("/api/stats");
        if (!r.ok) return;
        const j = (await r.json()) as { totalMatches: number };
        if (!cancelled) setMatchCount(j.totalMatches);
      } catch {}
    };
    tick();
    const id = window.setInterval(tick, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, user, pathname]);

  if (!ready || !user) return null;

  return (
    <nav
      className="sticky bottom-0 left-0 right-0 z-30 border-t border-stone-200/70 bg-amber-50/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto max-w-md grid grid-cols-3">
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href === "/swipe" && pathname === "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] text-xs ${
                active ? "text-rose-600" : "text-stone-500"
              }`}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                {t.withCount && matchCount && matchCount > 0 ? (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-medium text-white flex items-center justify-center">
                    {matchCount}
                  </span>
                ) : null}
              </div>
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
