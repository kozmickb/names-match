import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { enrichNames } from "@/lib/enrich";
import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * One request for everything the swipe card needs (origin/meaning, spelling
 * variants, popularity), replacing 3 separate GETs per card. The catalog is fully
 * enriched, so this is pure DB reads in the common case; the lazy enrich-on-read
 * fallback is preserved (one model call now fills meaning AND popularity together).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const member = await readMember();
  if (!member) return unauthorized();

  const { id } = await ctx.params;
  const nameId = Number(id);
  if (!Number.isInteger(nameId) || nameId <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: schema.names.id,
      name: schema.names.name,
      origin: schema.names.origin,
      meaning: schema.names.meaning,
      metaFetchedAt: schema.names.metaFetchedAt,
      rank: schema.names.ukRank,
      blurb: schema.names.ukBlurb,
      popularityFetchedAt: schema.names.popularityFetchedAt,
      variantGroup: schema.names.variantGroup,
    })
    .from(schema.names)
    .where(eq(schema.names.id, nameId))
    .limit(1);

  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  // Same spelling-variant rule as the deck filter / variants route: curated
  // variant_group key, with a phonetic heuristic fallback for ungrouped names.
  const variants = (await db.execute<{ id: number; name: string }>(sql`
    select n.id, n.name
    from names n
    where n.id <> ${nameId}
      and (
        (${row.variantGroup}::text is not null and n.variant_group = ${row.variantGroup})
        or (
          (${row.variantGroup}::text is null or n.variant_group is null)
          and dmetaphone(n.name) = dmetaphone(${row.name})
          and dmetaphone(${row.name}) <> ''
          and levenshtein(lower(n.name), lower(${row.name})) <= 2
        )
      )
    order by n.name
    limit 5
  `)) as unknown as Array<{ id: number; name: string }>;

  let origin = row.origin;
  let meaning = row.meaning;
  let rank = row.rank;
  let blurb = row.blurb;

  // Lazy enrich-on-read fallback for any name not yet enriched (dead path today —
  // the catalog is fully enriched and new names enrich at creation). One call
  // fills both meaning and popularity; persist only on success.
  if ((!row.metaFetchedAt || !row.popularityFetchedAt) && process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const facts = await enrichNames(client, [row.name]);
      const e = facts.get(row.name);
      if (e) {
        origin = e.origin;
        meaning = e.meaning;
        rank = e.rank;
        blurb = e.blurb;
        await db
          .update(schema.names)
          .set({
            origin: e.origin,
            meaning: e.meaning,
            metaFetchedAt: sql`now()`,
            ukRank: e.rank,
            ukBlurb: e.blurb,
            popularityFetchedAt: sql`now()`,
          })
          .where(eq(schema.names.id, nameId));
      }
    } catch {
      // best-effort — return cached/null so the name is retried later
    }
  }

  return Response.json({
    meta: { origin, meaning },
    variants: variants.map((v) => ({ id: Number(v.id), name: v.name })),
    popularity: { rank, blurb },
  });
}
