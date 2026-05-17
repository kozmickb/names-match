import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

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
