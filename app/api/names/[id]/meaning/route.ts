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
      origin: schema.names.origin,
      meaning: schema.names.meaning,
      metaFetchedAt: schema.names.metaFetchedAt,
    })
    .from(schema.names)
    .where(eq(schema.names.id, nameId))
    .limit(1);

  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  if (row.metaFetchedAt) {
    return Response.json({ origin: row.origin, meaning: row.meaning });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ origin: null, meaning: null });
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
        "You give the origin and meaning of a first name in a single compact JSON object.",
        'Schema: {"origin": string|null, "meaning": string|null}.',
        "Origin is 1-3 words like 'Welsh', 'Old Norse', 'Hebrew', 'Latin'.",
        "Meaning is a short phrase, lowercase, no surrounding quotes (e.g. pure of heart, son of the right hand, dark warrior).",
        "If you genuinely do not know, set the field to null. Never invent.",
        "Respond with only the JSON object — no prose, no markdown.",
      ].join(" "),
      messages: [{ role: "user", content: row.name }],
    });
  } catch {
    return Response.json({ origin: null, meaning: null, retryable: true });
  }

  // The model responded — cache its answer even if a field is null.
  let parsed: { origin: string | null; meaning: string | null } = { origin: null, meaning: null };
  try {
    const raw = response.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const match = raw.match(/\{[\s\S]*\}/);
    const json = JSON.parse(match ? match[0] : raw);
    parsed = {
      origin: typeof json.origin === "string" && json.origin.trim() ? json.origin.trim().slice(0, 60) : null,
      meaning:
        typeof json.meaning === "string" && json.meaning.trim() ? json.meaning.trim().slice(0, 120) : null,
    };
  } catch {
    parsed = { origin: null, meaning: null };
  }

  await db
    .update(schema.names)
    .set({
      origin: parsed.origin,
      meaning: parsed.meaning,
      metaFetchedAt: sql`now()`,
    })
    .where(eq(schema.names.id, nameId));

  return Response.json(parsed);
}
