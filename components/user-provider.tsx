"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { isUserSlug, type UserSlug } from "@/lib/user";

const STORAGE_KEY = "names-match.user";

type Ctx = {
  user: UserSlug | null;
  ready: boolean;
  setUser: (u: UserSlug | null) => void;
};

const UserCtx = createContext<Ctx>({ user: null, ready: false, setUser: () => {} });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserSlug | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (isUserSlug(v)) setUserState(v);
    } catch {}
    setReady(true);
  }, []);

  const setUser = useCallback((u: UserSlug | null) => {
    setUserState(u);
    try {
      if (u) window.localStorage.setItem(STORAGE_KEY, u);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return <UserCtx.Provider value={{ user, ready, setUser }}>{children}</UserCtx.Provider>;
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
  return fetch(input, { ...init, headers, cache: "no-store" });
}
