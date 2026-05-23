import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export type Standing = {
  id: number;
  name: string;
  gender: string | null;
  played: number;
  won: number;
  lost: number;
  points: number;
  winRate: number;
  karoWon: number;
  karoLost: number;
  lucyWon: number;
  lucyLost: number;
};

type MatchRow = { id: number; name: string; gender: string | null };
type VoteRow = { winner: number; loser: number; user_slug: string };

// A name competes in the boys' league unless it is clearly feminine, and in the
// girls' league unless it is clearly masculine. Unisex / untagged are wildcards.
export const boyEligible = (g: string | null) => g !== "feminine";
export const girlEligible = (g: string | null) => g !== "masculine";

/** Ranked league tables (boys/girls) built from mutual matches + head-to-head votes. */
export async function computeStandings(): Promise<{ boys: Standing[]; girls: Standing[] }> {
  const matches = (await db.execute<MatchRow>(sql`
    select n.id, n.name, n.gender
    from names n
    join swipes sk on sk.name_id = n.id and sk.user_slug = 'karo' and sk.decision = 'like'
    join swipes sl on sl.name_id = n.id and sl.user_slug = 'lucy' and sl.decision = 'like'
  `)) as unknown as Array<MatchRow>;

  const matchById = new Map<number, MatchRow>();
  for (const m of matches) {
    matchById.set(Number(m.id), { id: Number(m.id), name: m.name, gender: m.gender });
  }

  const votes = (await db.execute<VoteRow>(sql`
    select winner_name_id as winner, loser_name_id as loser, user_slug
    from tournament_votes
  `)) as unknown as Array<VoteRow>;

  function buildLeague(eligible: (g: string | null) => boolean): Standing[] {
    const table = new Map<number, Standing>();
    for (const m of matches) {
      if (!eligible(m.gender)) continue;
      table.set(Number(m.id), {
        id: Number(m.id),
        name: m.name,
        gender: m.gender,
        played: 0,
        won: 0,
        lost: 0,
        points: 0,
        winRate: 0,
        karoWon: 0,
        karoLost: 0,
        lucyWon: 0,
        lucyLost: 0,
      });
    }

    for (const v of votes) {
      const w = Number(v.winner);
      const l = Number(v.loser);
      const wm = matchById.get(w);
      const lm = matchById.get(l);
      if (!wm || !lm) continue;
      if (!eligible(wm.gender) || !eligible(lm.gender)) continue;

      const ws = table.get(w)!;
      const ls = table.get(l)!;
      ws.won++;
      ws.played++;
      ws.points += 3;
      ls.lost++;
      ls.played++;
      if (v.user_slug === "karo") {
        ws.karoWon++;
        ls.karoLost++;
      } else if (v.user_slug === "lucy") {
        ws.lucyWon++;
        ls.lucyLost++;
      }
    }

    const rows = Array.from(table.values());
    for (const r of rows) r.winRate = r.played ? r.won / r.played : 0;
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.won - b.lost - (a.won - a.lost) ||
        b.winRate - a.winRate ||
        b.played - a.played ||
        a.name.localeCompare(b.name)
    );
    return rows;
  }

  return { boys: buildLeague(boyEligible), girls: buildLeague(girlEligible) };
}
