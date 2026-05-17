import { headers, cookies } from "next/headers";
import { isUserSlug, type UserSlug } from "./user";
import { AUTH_COOKIE_NAME, isAuthRequired, verifyToken } from "./auth";

export async function readUserSlug(): Promise<UserSlug | null> {
  if (isAuthRequired()) {
    const jar = await cookies();
    const token = jar.get(AUTH_COOKIE_NAME)?.value;
    if (!verifyToken(token)) return null;
  }
  const h = await headers();
  const slug = h.get("x-user-slug");
  return isUserSlug(slug) ? slug : null;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
