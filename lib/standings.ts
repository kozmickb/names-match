import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { getCoupleMembers } from "@/lib/members";

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
type VoteRow = { winner: number; loser: number; member_id: string };

// A name competes in the boys' league unless it is clearly feminine, and in the
// girls' league unless it is clearly masculine. Unisex / untagged are wildcards.
export const boyEligible = (g: string | null) => g !== "feminine";
export const girlEligible = (g: string | null) => g !== "masculine";

/** Ranked league tables (boys/girls) for one couple, from mutual matches + head-to-head votes. */
export async function computeStandings(coupleId: string): Promise<{ boys: Standing[]; girls: Standing[] }> {
  const members = await getCoupleMembers(coupleId);
  const a = members[0];
  const b = members[1];
  if (!a || !b) return { boys: [], girls: [] };

  // Map a member id to its legacy output bucket. Seed couple => karo/lucy; any
  // future couple falls back to role so the response shape stays valid.
  const bucket = (memberId: string): "karo" | "lucy" => {
    const m = members.find((x) => x.id === memberId);
    if (m?.legacySlug === "lucy") return "lucy";
    if (m?.legacySlug === "karo") return "karo";
    return m?.role === "b" ? "lucy" : "karo";
  };

  // Matches = names liked by BOTH members of this couple.
  const matches = (await db.execute<MatchRow>(sql`
    select n.id, n.name, n.gender
    from names n
    join swipes sa on sa.name_id = n.id and sa.member_id = ${a.id} and sa.decision = 'like'
    join swipes sb on sb.name_id = n.id and sb.member_id = ${b.id} and sb.decision = 'like'
  `)) as unknown as Array<MatchRow>;

  const matchById = new Map<number, MatchRow>();
  for (const m of matches) {
    matchById.set(Number(m.id), { id: Number(m.id), name: m.name, gender: m.gender });
  }

  const votes = (await db.execute<VoteRow>(sql`
    select winner_name_id as winner, loser_name_id as loser, member_id
    from tournament_votes
    where member_id in (${a.id}, ${b.id})
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
      const who = bucket(v.member_id);
      if (who === "karo") {
        ws.karoWon++;
        ls.karoLost++;
      } else {
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
