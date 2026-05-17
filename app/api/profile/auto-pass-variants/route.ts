import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  let body: { enabled?: unknown };
  try {
    body = (await req.json()) as { enabled?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "enabled must be boolean" }, { status: 400 });
  }

  await db
    .insert(schema.userProfiles)
    .values({ userSlug: slug, autoPassVariants: body.enabled })
    .onConflictDoUpdate({
      target: schema.userProfiles.userSlug,
      set: { autoPassVariants: body.enabled, updatedAt: sql`now()` },
    });

  return Response.json({ ok: true, autoPassVariants: body.enabled });
}

export async function GET() {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const [row] = await db
    .select({ enabled: schema.userProfiles.autoPassVariants })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userSlug, slug))
    .limit(1);

  return Response.json({ autoPassVariants: !!row?.enabled });
}
