export type UserSlug = "karo" | "lucy";

export const USERS: UserSlug[] = ["karo", "lucy"];

export function isUserSlug(value: unknown): value is UserSlug {
  return value === "karo" || value === "lucy";
}

// Legacy helpers retained for the Phase A frontend (still on the karo/lucy
// identity via the legacy_slug bridge). Removed in Phase B when the client
// switches to member display names.
export function partnerOf(slug: UserSlug): UserSlug {
  return slug === "karo" ? "lucy" : "karo";
}

export function displayName(slug: UserSlug): string {
  return slug === "karo" ? "Karo" : "Lucy";
}
