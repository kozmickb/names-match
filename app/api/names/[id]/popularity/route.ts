import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const { id } = await ctx.params;
  const nameId = Number(id);
  if (!Number.isInteger(nameId) || nameId <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const [row] = await db
    .select({
      id: schema.names.id,
      name: schema.names.name,
      rank: schema.names.ukRank,
      blurb: schema.names.ukBlurb,
      fetchedAt: schema.names.popularityFetchedAt,
    })
    .from(schema.names)
    .where(eq(schema.names.id, nameId))
    .limit(1);

  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  if (row.fetchedAt) {
    return Response.json({ rank: row.rank, blurb: row.blurb });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ rank: null, blurb: null });
  }

  const client = new Anthropic({ apiKey });

  // Reach the model first. If the call itself fails (rate limit, usage cap,
  // network), return WITHOUT persisting so the name is retried later — never
  // cache a blank caused by a transient outage.
  let response;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: [
        "You give UK (England & Wales) baby-name popularity context.",
        "Source frame: Office for National Statistics annual baby name rankings.",
        "Output ONLY a JSON object: {\"rank\": integer or null, \"blurb\": string or null}.",
        "rank: latest known ONS top-100 rank (integer 1-100) for the most likely gender. null if outside top 100 OR you are not confident.",
        "blurb: one short phrase, max 60 chars, describing popularity, era or trend.",
        "Good blurbs: 'Top 10 since 2018', 'Vintage revival', 'Rising in 2020s', 'Rare today', 'Traditional', 'Peaked in 1990s', 'Niche literary'.",
        "Never invent a rank. If unsure of the precise number, leave rank as null and put context in blurb.",
        "No prose, no markdown.",
      ].join(" "),
      messages: [{ role: "user", content: row.name }],
    });
  } catch {
    return Response.json({ rank: null, blurb: null, retryable: true });
  }

  // The model responded — cache its answer even if a field is null.
  let parsed: { rank: number | null; blurb: string | null } = { rank: null, blurb: null };
  try {
    const raw = response.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const match = raw.match(/\{[\s\S]*\}/);
    const json = JSON.parse(match ? match[0] : raw);
    const rankRaw = json.rank;
    const blurbRaw = json.blurb;
    parsed = {
      rank:
        typeof rankRaw === "number" && Number.isInteger(rankRaw) && rankRaw >= 1 && rankRaw <= 100
          ? rankRaw
          : null,
      blurb:
        typeof blurbRaw === "string" && blurbRaw.trim() ? blurbRaw.trim().slice(0, 80) : null,
    };
  } catch {
    parsed = { rank: null, blurb: null };
  }

  await db
    .update(schema.names)
    .set({
      ukRank: parsed.rank,
      ukBlurb: parsed.blurb,
      popularityFetchedAt: sql`now()`,
    })
    .where(eq(schema.names.id, nameId));

  return Response.json(parsed);
}
