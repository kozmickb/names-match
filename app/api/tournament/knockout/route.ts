import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { computeStandings } from "@/lib/standings";
import { bracketSize, seedOrder, roundsCount } from "@/lib/bracket";
import { buildBracket } from "@/lib/knockout";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function parseGender(v: unknown): "boys" | "girls" | null {
  return v === "boys" || v === "girls" ? v : null;
}

export async function GET(req: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();
  const gender = parseGender(new URL(req.url).searchParams.get("gender"));
  if (!gender) return Response.json({ error: "gender required" }, { status: 400 });
  const bracket = await buildBracket(gender);
  return Response.json({ bracket });
}

// Start (or restart) the knockout for a league, seeding the top names from the
// current standings into a fresh bracket.
export async function POST(req: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  let body: { gender?: unknown };
  try {
    body = (await req.json()) as { gender?: unknown };
  } catch {
    body = {};
  }
  const gender = parseGender(body.gender);
  if (!gender) return Response.json({ error: "gender required" }, { status: 400 });

  const standings = await computeStandings();
  const rows = standings[gender];
  const size = bracketSize(rows.length);
  if (size < 2) {
    return Response.json({ error: "not_enough", needed: 2, have: rows.length }, { status: 400 });
  }

  const seeds = rows.slice(0, size); // index 0 == seed 1 (top of the table)
  const order = seedOrder(size); // seed numbers in bracket position order
  const totalRounds = roundsCount(size);

  const ko = await db.transaction(async (tx) => {
    await tx.delete(schema.knockouts).where(eq(schema.knockouts.gender, gender));
    const [created] = await tx
      .insert(schema.knockouts)
      .values({ gender, size, status: "active" })
      .returning({ id: schema.knockouts.id });

    const matches: Array<{
      knockoutId: number;
      round: number;
      slot: number;
      nameAId: number | null;
      nameBId: number | null;
    }> = [];

    // Round 1: consecutive seed-order pairs.
    for (let i = 0; i < order.length; i += 2) {
      matches.push({
        knockoutId: created.id,
        round: 1,
        slot: i / 2,
        nameAId: seeds[order[i] - 1].id,
        nameBId: seeds[order[i + 1] - 1].id,
      });
    }
    // Later rounds: empty slots, filled as winners advance.
    for (let round = 2; round <= totalRounds; round++) {
      const count = size / Math.pow(2, round);
      for (let slot = 0; slot < count; slot++) {
        matches.push({ knockoutId: created.id, round, slot, nameAId: null, nameBId: null });
      }
    }
    await tx.insert(schema.knockoutMatches).values(matches);
    return created;
  });

  const bracket = await buildBracket(gender);
  return Response.json({ bracket, knockoutId: ko.id });
}
