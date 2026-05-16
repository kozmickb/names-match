import { db } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const rows = (await db.execute<{
    id: number;
    name: string;
    matched_at: string | Date;
    my_favourite: boolean;
    partner_favourite: boolean;
  }>(sql`
    select
      n.id,
      n.name,
      greatest(sk.created_at, sl.created_at) as matched_at,
      case when ${slug} = 'karo' then sk.favourite else sl.favourite end as my_favourite,
      case when ${slug} = 'karo' then sl.favourite else sk.favourite end as partner_favourite
    from names n
    join swipes sk on sk.name_id = n.id and sk.user_slug = 'karo' and sk.decision = 'like'
    join swipes sl on sl.name_id = n.id and sl.user_slug = 'lucy' and sl.decision = 'like'
    order by
      (case when ${slug} = 'karo' then sk.favourite else sl.favourite end) desc,
      matched_at desc
  `)) as unknown as Array<{
    id: number;
    name: string;
    matched_at: string | Date;
    my_favourite: boolean;
    partner_favourite: boolean;
  }>;

  const matches = rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    matchedAt: new Date(r.matched_at).toISOString(),
    myFavourite: !!r.my_favourite,
    partnerFavourite: !!r.partner_favourite,
  }));

  return Response.json({ matches });
}
