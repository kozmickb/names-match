import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  await db.delete(schema.swipes).where(eq(schema.swipes.userSlug, slug));
  return Response.json({ ok: true });
}
