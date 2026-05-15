import { headers } from "next/headers";
import { isUserSlug, type UserSlug } from "./user";

export async function readUserSlug(): Promise<UserSlug | null> {
  const h = await headers();
  const slug = h.get("x-user-slug");
  return isUserSlug(slug) ? slug : null;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
