import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { sql } from "drizzle-orm";

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
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

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

  await db
    .insert(schema.tournamentVotes)
    .values({ userSlug: slug, winnerNameId: winnerId, loserNameId: loserId })
    .onConflictDoNothing({
      target: [
        schema.tournamentVotes.userSlug,
        schema.tournamentVotes.winnerNameId,
        schema.tournamentVotes.loserNameId,
      ],
    });

  return Response.json({ ok: true });
}
