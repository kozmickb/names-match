import { db } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  name: string;
  karo_wins: number;
  karo_losses: number;
  lucy_wins: number;
  lucy_losses: number;
};

export async function GET() {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const rows = (await db.execute<Row>(sql`
    with matches as (
      select n.id, n.name
      from names n
      join swipes sk on sk.name_id = n.id and sk.user_slug = 'karo' and sk.decision = 'like'
      join swipes sl on sl.name_id = n.id and sl.user_slug = 'lucy' and sl.decision = 'like'
    ),
    karo_wins as (
      select winner_name_id as id, count(*)::int as c
      from tournament_votes where user_slug = 'karo' group by 1
    ),
    karo_losses as (
      select loser_name_id as id, count(*)::int as c
      from tournament_votes where user_slug = 'karo' group by 1
    ),
    lucy_wins as (
      select winner_name_id as id, count(*)::int as c
      from tournament_votes where user_slug = 'lucy' group by 1
    ),
    lucy_losses as (
      select loser_name_id as id, count(*)::int as c
      from tournament_votes where user_slug = 'lucy' group by 1
    )
    select
      m.id, m.name,
      coalesce(kw.c, 0) as karo_wins,
      coalesce(kl.c, 0) as karo_losses,
      coalesce(lw.c, 0) as lucy_wins,
      coalesce(ll.c, 0) as lucy_losses
    from matches m
    left join karo_wins kw on kw.id = m.id
    left join karo_losses kl on kl.id = m.id
    left join lucy_wins lw on lw.id = m.id
    left join lucy_losses ll on ll.id = m.id
  `)) as unknown as Array<Row>;

  const items = rows.map((r) => {
    const karoSeen = r.karo_wins + r.karo_losses;
    const lucySeen = r.lucy_wins + r.lucy_losses;
    const karoRate = karoSeen ? r.karo_wins / karoSeen : null;
    const lucyRate = lucySeen ? r.lucy_wins / lucySeen : null;
    const rates = [karoRate, lucyRate].filter((x): x is number => x !== null);
    const combined = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    return {
      id: Number(r.id),
      name: r.name,
      karoRate,
      lucyRate,
      combined,
      totalVotes: karoSeen + lucySeen,
    };
  });

  items.sort((a, b) => b.combined - a.combined || b.totalVotes - a.totalVotes);

  return Response.json({ ranking: items });
}
