import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { buildBracket } from "@/lib/knockout";
import { roundsCount } from "@/lib/bracket";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Decide a knockout tie together (one shared pick), advance the winner into the
// next round, and crown the champion when the final is decided.
export async function POST(req: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  let body: { matchId?: unknown; winnerId?: unknown };
  try {
    body = (await req.json()) as { matchId?: unknown; winnerId?: unknown };
  } catch {
    body = {};
  }
  const matchId = Number(body.matchId);
  const winnerId = Number(body.winnerId);
  if (!Number.isInteger(matchId) || !Number.isInteger(winnerId)) {
    return Response.json({ error: "invalid ids" }, { status: 400 });
  }

  const [m] = await db
    .select()
    .from(schema.knockoutMatches)
    .where(eq(schema.knockoutMatches.id, matchId))
    .limit(1);
  if (!m) return Response.json({ error: "match not found" }, { status: 404 });
  if (m.nameAId == null || m.nameBId == null) {
    return Response.json({ error: "match not ready" }, { status: 400 });
  }
  if (winnerId !== m.nameAId && winnerId !== m.nameBId) {
    return Response.json({ error: "winner not in match" }, { status: 400 });
  }

  const [ko] = await db
    .select()
    .from(schema.knockouts)
    .where(eq(schema.knockouts.id, m.knockoutId))
    .limit(1);
  if (!ko) return Response.json({ error: "knockout not found" }, { status: 404 });

  const totalRounds = roundsCount(ko.size);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.knockoutMatches)
      .set({ winnerNameId: winnerId })
      .where(eq(schema.knockoutMatches.id, matchId));

    if (m.round >= totalRounds) {
      await tx
        .update(schema.knockouts)
        .set({ championNameId: winnerId, status: "complete" })
        .where(eq(schema.knockouts.id, ko.id));
    } else {
      // Feed the winner into the parent match (slot/2), side by parity.
      const parentSlot = Math.floor(m.slot / 2);
      const side =
        m.slot % 2 === 0 ? { nameAId: winnerId } : { nameBId: winnerId };
      await tx
        .update(schema.knockoutMatches)
        .set(side)
        .where(
          and(
            eq(schema.knockoutMatches.knockoutId, ko.id),
            eq(schema.knockoutMatches.round, m.round + 1),
            eq(schema.knockoutMatches.slot, parentSlot)
          )
        );
    }
  });

  const bracket = await buildBracket(ko.gender);
  return Response.json({ bracket });
}
