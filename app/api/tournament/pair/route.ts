import { db } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type MatchRow = { id: number; name: string; gender: string | null };

// Boys are only pitched against boys and girls against girls: a clearly
// masculine name must never face a clearly feminine one. Unisex / untagged
// names act as wildcards since they can legitimately be either.
function sameGenderAllowed(a: string | null, b: string | null): boolean {
  return !(
    (a === "masculine" && b === "feminine") ||
    (a === "feminine" && b === "masculine")
  );
}

export async function GET() {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const matches = (await db.execute<MatchRow>(sql`
    select n.id, n.name, n.gender
    from names n
    join swipes sk on sk.name_id = n.id and sk.user_slug = 'karo' and sk.decision = 'like'
    join swipes sl on sl.name_id = n.id and sl.user_slug = 'lucy' and sl.decision = 'like'
  `)) as unknown as Array<MatchRow>;

  if (matches.length < 2) {
    return Response.json({ pair: null, reason: "not_enough_matches", totalMatches: matches.length });
  }

  type CompareRow = { a: number; b: number };
  const compared = (await db.execute<CompareRow>(sql`
    select least(winner_name_id, loser_name_id) as a, greatest(winner_name_id, loser_name_id) as b
    from tournament_votes
    where user_slug = ${slug}
  `)) as unknown as Array<CompareRow>;
  const seenKey = new Set(compared.map((r) => `${r.a}|${r.b}`));

  const matchById = new Map<number, MatchRow>();
  for (const m of matches) matchById.set(Number(m.id), { id: Number(m.id), name: m.name, gender: m.gender });

  const ids = matches.map((m) => Number(m.id));
  const candidates: Array<{ a: number; b: number }> = [];
  // Only gender-allowed pairs count towards progress, so the bar can reach 100%.
  let totalPairs = 0;
  let donePairs = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const ga = matchById.get(ids[i])!.gender;
      const gb = matchById.get(ids[j])!.gender;
      if (!sameGenderAllowed(ga, gb)) continue;
      totalPairs++;
      const key = `${ids[i]}|${ids[j]}`;
      if (seenKey.has(key)) donePairs++;
      else candidates.push({ a: ids[i], b: ids[j] });
    }
  }

  if (candidates.length === 0) {
    return Response.json({
      pair: null,
      reason: "complete",
      totalMatches: matches.length,
      totalPairs,
      donePairs,
    });
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const a = matchById.get(pick.a)!;
  const b = matchById.get(pick.b)!;
  if (Math.random() < 0.5) {
    return Response.json({
      pair: { left: a, right: b },
      totalMatches: matches.length,
      totalPairs,
      donePairs,
    });
  }
  return Response.json({
    pair: { left: b, right: a },
    totalMatches: matches.length,
    totalPairs,
    donePairs,
  });
}
