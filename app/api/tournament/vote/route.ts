import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { and, eq, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Mirror of the pairing rule: never record a clearly masculine name being
// pitched against a clearly feminine one. Unisex / untagged act as wildcards.
function sameGenderAllowed(a: string | null, b: string | null): boolean {
  return !(
    (a === "masculine" && b === "feminine") ||
    (a === "feminine" && b === "masculine")
  );
}

export async function POST(req: Request) {
  const member = await readMember();
  if (!member) return unauthorized();

  let body: { winnerId?: unknown; loserId?: unknown };
  try {
    body = (await req.json()) as { winnerId?: unknown; loserId?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const winnerId = Number(body.winnerId);
  const loserId = Number(body.loserId);
  if (
    !Number.isInteger(winnerId) ||
    !Number.isInteger(loserId) ||
    winnerId <= 0 ||
    loserId <= 0 ||
    winnerId === loserId
  ) {
    return Response.json({ error: "invalid ids" }, { status: 400 });
  }

  type GenderRow = { id: number; gender: string | null };
  const genders = (await db.execute<GenderRow>(sql`
    select id, gender from names where id in (${winnerId}, ${loserId})
  `)) as unknown as Array<GenderRow>;
  const winnerGender = genders.find((g) => Number(g.id) === winnerId)?.gender ?? null;
  const loserGender = genders.find((g) => Number(g.id) === loserId)?.gender ?? null;
  if (!sameGenderAllowed(winnerGender, loserGender)) {
    return Response.json({ error: "cross-gender matchup not allowed" }, { status: 400 });
  }

  // One vote per unordered pair per user: clear any prior result for this pair
  // (either direction) so re-challenging a duel cleanly flips the outcome
  // instead of recording a contradictory second vote.
  await db.transaction(async (tx) => {
    await tx.delete(schema.tournamentVotes).where(
      and(
        eq(schema.tournamentVotes.memberId, member.id),
        or(
          and(
            eq(schema.tournamentVotes.winnerNameId, winnerId),
            eq(schema.tournamentVotes.loserNameId, loserId)
          ),
          and(
            eq(schema.tournamentVotes.winnerNameId, loserId),
            eq(schema.tournamentVotes.loserNameId, winnerId)
          )
        )
      )
    );
    await tx
      .insert(schema.tournamentVotes)
      .values({ memberId: member.id, winnerNameId: winnerId, loserNameId: loserId });
  });

  return Response.json({ ok: true });
}
