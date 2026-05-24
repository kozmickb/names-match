import { headers, cookies } from "next/headers";
import { isUserSlug } from "./user";
import { AUTH_COOKIE_NAME, isAuthRequired, verifyToken } from "./auth";
import { memberByLegacySlug, type Member } from "./members";

/**
 * Resolve the requesting member. Phase A bridge: the client still sends
 * `x-user-slug: karo|lucy`; we map it to the seed couple's member via legacy_slug.
 * Phase B replaces this with a signed session cookie carrying member_id.
 */
export async function readMember(): Promise<Member | null> {
  if (isAuthRequired()) {
    const jar = await cookies();
    const token = jar.get(AUTH_COOKIE_NAME)?.value;
    if (!verifyToken(token)) return null;
  }
  const h = await headers();
  const slug = h.get("x-user-slug");
  if (!isUserSlug(slug)) return null;
  return memberByLegacySlug(slug);
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
