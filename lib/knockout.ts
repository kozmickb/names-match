import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export type NameRef = { id: number; name: string };
export type BracketMatch = {
  id: number;
  round: number;
  slot: number;
  a: NameRef | null;
  b: NameRef | null;
  winner: NameRef | null;
  ready: boolean; // both names present, no winner yet
};
export type KnockoutMeta = {
  id: number;
  gender: string;
  size: number;
  status: string;
  champion: NameRef | null;
};
export type Bracket = {
  knockout: KnockoutMeta;
  rounds: { round: number; matches: BracketMatch[] }[];
};

type KoSqlRow = {
  id: number;
  gender: string;
  size: number;
  status: string;
  champion_id: number | null;
  champion_name: string | null;
};
type MatchSqlRow = {
  id: number;
  round: number;
  slot: number;
  a_id: number | null;
  a_name: string | null;
  b_id: number | null;
  b_name: string | null;
  w_id: number | null;
  w_name: string | null;
};

export async function fetchKnockout(gender: string): Promise<KnockoutMeta | null> {
  const rows = (await db.execute<KoSqlRow>(sql`
    select k.id, k.gender, k.size, k.status,
           k.champion_name_id as champion_id, nc.name as champion_name
    from knockouts k
    left join names nc on nc.id = k.champion_name_id
    where k.gender = ${gender}
    limit 1
  `)) as unknown as Array<KoSqlRow>;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    gender: r.gender,
    size: Number(r.size),
    status: r.status,
    champion: r.champion_id ? { id: Number(r.champion_id), name: r.champion_name! } : null,
  };
}

export async function buildBracket(gender: string): Promise<Bracket | null> {
  const knockout = await fetchKnockout(gender);
  if (!knockout) return null;

  const ms = (await db.execute<MatchSqlRow>(sql`
    select m.id, m.round, m.slot,
           m.name_a_id as a_id, na.name as a_name,
           m.name_b_id as b_id, nb.name as b_name,
           m.winner_name_id as w_id, nw.name as w_name
    from knockout_matches m
    left join names na on na.id = m.name_a_id
    left join names nb on nb.id = m.name_b_id
    left join names nw on nw.id = m.winner_name_id
    where m.knockout_id = ${knockout.id}
    order by m.round, m.slot
  `)) as unknown as Array<MatchSqlRow>;

  const byRound = new Map<number, BracketMatch[]>();
  for (const m of ms) {
    const a = m.a_id ? { id: Number(m.a_id), name: m.a_name! } : null;
    const b = m.b_id ? { id: Number(m.b_id), name: m.b_name! } : null;
    const winner = m.w_id ? { id: Number(m.w_id), name: m.w_name! } : null;
    const round = Number(m.round);
    const match: BracketMatch = {
      id: Number(m.id),
      round,
      slot: Number(m.slot),
      a,
      b,
      winner,
      ready: !!a && !!b && !winner,
    };
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round)!.push(match);
  }

  const rounds = Array.from(byRound.entries())
    .sort((x, y) => x[0] - y[0])
    .map(([round, matches]) => ({ round, matches }));

  return { knockout, rounds };
}
