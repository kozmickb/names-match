"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { isUserSlug, type UserSlug } from "@/lib/user";

const STORAGE_KEY = "names-match.user";
const SURNAME_KEY = "names-match.surname";
const SURNAME_DEFAULT = "Bonas";

export const DEFAULT_EMOJI: Record<UserSlug, string> = {
  karo: "🧔🏻",
  lucy: "👩🏼",
};

export type ProfileMap = Record<UserSlug, { emoji: string }>;

type Ctx = {
  user: UserSlug | null;
  ready: boolean;
  setUser: (u: UserSlug | null) => void;
  surname: string;
  setSurname: (s: string) => void;
  profiles: ProfileMap;
  setOwnEmoji: (emoji: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
};

const UserCtx = createContext<Ctx>({
  user: null,
  ready: false,
  setUser: () => {},
  surname: SURNAME_DEFAULT,
  setSurname: () => {},
  profiles: { karo: { emoji: DEFAULT_EMOJI.karo }, lucy: { emoji: DEFAULT_EMOJI.lucy } },
  setOwnEmoji: async () => {},
  refreshProfiles: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserSlug | null>(null);
  const [surname, setSurnameState] = useState<string>(SURNAME_DEFAULT);
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<ProfileMap>({
    karo: { emoji: DEFAULT_EMOJI.karo },
    lucy: { emoji: DEFAULT_EMOJI.lucy },
  });

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (isUserSlug(v)) setUserState(v);
      const s = window.localStorage.getItem(SURNAME_KEY);
      if (s !== null) setSurnameState(s);
    } catch {}
    setReady(true);
  }, []);

  const refreshProfiles = useCallback(async () => {
    try {
      const r = await fetch("/api/profile", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as ProfileMap;
      setProfiles(j);
    } catch {}
  }, []);

  useEffect(() => {
    refreshProfiles();
    const id = window.setInterval(refreshProfiles, 30000);
    return () => window.clearInterval(id);
  }, [refreshProfiles]);

  const setUser = useCallback((u: UserSlug | null) => {
    setUserState(u);
    try {
      if (u) window.localStorage.setItem(STORAGE_KEY, u);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const setSurname = useCallback((s: string) => {
    const trimmed = s.trim().slice(0, 40);
    setSurnameState(trimmed);
    try {
      window.localStorage.setItem(SURNAME_KEY, trimmed);
    } catch {}
  }, []);

  const setOwnEmoji = useCallback(
    async (emoji: string) => {
      if (!user) return;
      const trimmed = emoji.trim().slice(0, 16);
      if (!trimmed) return;
      setProfiles((p) => ({ ...p, [user]: { emoji: trimmed } }));
      try {
        const slug = window.localStorage.getItem(STORAGE_KEY) ?? user;
        const r = await fetch("/api/profile", {
          method: "POST",
          headers: { "content-type": "application/json", "x-user-slug": slug },
          body: JSON.stringify({ emoji: trimmed }),
        });
        if (!r.ok) throw new Error();
      } catch {
        refreshProfiles();
        throw new Error("save failed");
      }
    },
    [user, refreshProfiles]
  );

  return (
    <UserCtx.Provider
      value={{ user, ready, setUser, surname, setSurname, profiles, setOwnEmoji, refreshProfiles }}
    >
      {children}
    </UserCtx.Provider>
  );
}

export function useUser() {
  return useContext(UserCtx);
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  let slug: string | null = null;
  try {
    slug = window.localStorage.getItem(STORAGE_KEY);
  } catch {}
  const headers = new Headers(init.headers);
  if (slug) headers.set("x-user-slug", slug);
  if (!headers.has("content-type") && init.body && typeof init.body === "string") {
    headers.set("content-type", "application/json");
  }
  return fetch(input, { ...init, headers, cache: "no-store", credentials: "same-origin" });
}
