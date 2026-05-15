import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 30), 1), 100);

  const rows = await db
    .select({ id: schema.names.id, name: schema.names.name })
    .from(schema.names)
    .where(
      notInArray(
        schema.names.id,
        db
          .select({ id: schema.swipes.nameId })
          .from(schema.swipes)
          .where(eq(schema.swipes.userSlug, slug))
      )
    )
    .orderBy(asc(schema.names.id))
    .limit(limit);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.names);

  return Response.json({ names: rows, total });
}
