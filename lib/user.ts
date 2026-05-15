export type UserSlug = "karo" | "lucy";

export const USERS: UserSlug[] = ["karo", "lucy"];

export function isUserSlug(value: unknown): value is UserSlug {
  return value === "karo" || value === "lucy";
}

export function partnerOf(slug: UserSlug): UserSlug {
  return slug === "karo" ? "lucy" : "karo";
}

export function displayName(slug: UserSlug): string {
  return slug === "karo" ? "Karo" : "Lucy";
}
