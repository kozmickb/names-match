"use client";

import { useUser } from "@/components/user-provider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useUser();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (ready && !user) {
      router.replace("/");
      return;
    }
  }, [ready, user, router]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth", { cache: "no-store", credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { required: boolean; authed: boolean }) => {
        if (cancelled) return;
        if (j.required && !j.authed) {
          router.replace("/");
          return;
        }
        setAuthed(true);
      })
      .catch(() => setAuthed(true))
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready || !authChecked) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-32 rounded-full bg-stone-200 animate-pulse" />
      </div>
    );
  }

  if (!user || !authed) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      <BottomNav />
    </div>
  );
}
