"use client";

import { useUser } from "@/components/user-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BottomNav } from "@/components/bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-32 rounded-full bg-stone-200 animate-pulse" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      <BottomNav />
    </div>
  );
}
