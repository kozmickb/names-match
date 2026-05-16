import { db } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { partnerOf } from "@/lib/user";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const partner = partnerOf(slug);

  const myLikes = (await db.execute<{ id: number; name: string; liked_at: string | Date }>(sql`
    select n.id, n.name, s.created_at as liked_at
    from swipes s
    join names n on n.id = s.name_id
    where s.user_slug = ${slug} and s.decision = 'like'
      and not exists (
        select 1 from swipes p
        where p.user_slug = ${partner} and p.name_id = n.id and p.decision = 'like'
      )
    order by s.created_at desc
  `)) as unknown as Array<{ id: number; name: string; liked_at: string | Date }>;

  const partnerPending = (await db.execute<{ id: number; name: string; liked_at: string | Date }>(sql`
    select n.id, n.name, s.created_at as liked_at
    from swipes s
    join names n on n.id = s.name_id
    where s.user_slug = ${partner} and s.decision = 'like'
      and not exists (
        select 1 from swipes me
        where me.user_slug = ${slug} and me.name_id = n.id
      )
    order by s.created_at desc
  `)) as unknown as Array<{ id: number; name: string; liked_at: string | Date }>;

  return Response.json({
    mine: myLikes.map((r) => ({
      id: Number(r.id),
      name: r.name,
      likedAt: new Date(r.liked_at).toISOString(),
    })),
    awaitingMe: partnerPending.map((r) => ({
      id: Number(r.id),
      name: r.name,
      likedAt: new Date(r.liked_at).toISOString(),
    })),
  });
}
