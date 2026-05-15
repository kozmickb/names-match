import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { and, eq, sql } from "drizzle-orm";
import { partnerOf } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET() {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const [{ totalNames }] = await db
    .select({ totalNames: sql<number>`count(*)::int` })
    .from(schema.names);

  const [{ swipedByMe }] = await db
    .select({ swipedByMe: sql<number>`count(*)::int` })
    .from(schema.swipes)
    .where(eq(schema.swipes.userSlug, slug));

  const [{ likedByMe }] = await db
    .select({ likedByMe: sql<number>`count(*)::int` })
    .from(schema.swipes)
    .where(and(eq(schema.swipes.userSlug, slug), eq(schema.swipes.decision, "like")));

  const partner = partnerOf(slug);
  const matchRows = (await db.execute<{ total_matches: number }>(sql`
    select count(*)::int as total_matches
    from swipes s1
    join swipes s2 on s1.name_id = s2.name_id
    where s1.user_slug = ${slug} and s1.decision = 'like'
      and s2.user_slug = ${partner} and s2.decision = 'like'
  `)) as unknown as Array<{ total_matches: number }>;
  const totalMatches = matchRows[0]?.total_matches ?? 0;

  return Response.json({ totalNames, swipedByMe, likedByMe, totalMatches });
}
