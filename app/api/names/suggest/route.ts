import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { enrichAndPersist } from "@/lib/enrich-persist";
import { enforceAiLimit } from "@/lib/rate-limit";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NAME_RE = /^[A-Za-z][A-Za-z'-]{1,28}[A-Za-z]$/;

function normalise(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

export async function POST(req: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI is not configured" }, { status: 503 });
  }

  const limit = await enforceAiLimit(slug, "suggest");
  if (!limit.ok) {
    return Response.json(
      { error: `Daily suggest limit reached (${limit.limit}/day). Try again tomorrow.` },
      { status: 429 }
    );
  }

  let body: { count?: unknown; gender?: unknown };
  try {
    body = (await req.json()) as { count?: unknown; gender?: unknown };
  } catch {
    body = {};
  }
  const count = Math.min(Math.max(Math.floor(Number(body.count) || 30), 5), 60);
  const genderRaw = typeof body.gender === "string" ? body.gender.toLowerCase() : "any";
  const gender: "masculine" | "feminine" | "unisex" | "any" =
    genderRaw === "masculine" || genderRaw === "feminine" || genderRaw === "unisex"
      ? (genderRaw as "masculine" | "feminine" | "unisex")
      : "any";

  const likedRows = await db
    .select({ name: schema.names.name })
    .from(schema.swipes)
    .innerJoin(schema.names, eq(schema.names.id, schema.swipes.nameId))
    .where(and(eq(schema.swipes.userSlug, slug), eq(schema.swipes.decision, "like")))
    .orderBy(desc(schema.swipes.createdAt))
    .limit(40);

  if (likedRows.length === 0) {
    return Response.json(
      { error: "Like a few names first so the AI knows your taste." },
      { status: 400 }
    );
  }

  const liked = likedRows.map((r) => r.name);
  const client = new Anthropic({ apiKey });

  const genderHint =
    gender === "any"
      ? "Match the gender lean of the liked names."
      : `Generate ${gender} first names.`;

  const systemPrompt = [
    "You suggest first names that fit a couple's taste, based on a list they have already liked.",
    "Study the vibe — origins, eras, syllable count, softness vs hardness, common phonetic features.",
    "Then output ONLY a JSON array of name strings (15-60 entries).",
    "No prose, no markdown, no comments. No surnames, no nicknames in parentheses, no diacritics, no emojis.",
    "Each name is a single word (hyphens allowed), properly capitalised, suitable for a child.",
    "Do NOT repeat any of the names already in the user's liked list.",
    genderHint,
  ].join(" ");

  const userMessage = `Liked names (newest first):\n${liked.join(", ")}\n\nReturn ${count} new names in the same vibe as a JSON array.`;

  let raw: string;
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    raw = response.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: `AI call failed: ${msg}` }, { status: 502 });
  }

  let parsed: unknown;
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    return Response.json({ error: "AI returned unparseable output." }, { status: 502 });
  }

  if (!Array.isArray(parsed)) {
    return Response.json({ error: "AI did not return a list." }, { status: 502 });
  }

  const seen = new Set<string>();
  const likedLower = new Set(liked.map((n) => n.toLowerCase()));
  const cleaned: string[] = [];
  for (const raw of parsed) {
    if (typeof raw !== "string") continue;
    const n = normalise(raw);
    if (!NAME_RE.test(n)) continue;
    if (seen.has(n)) continue;
    if (likedLower.has(n.toLowerCase())) continue;
    seen.add(n);
    cleaned.push(n);
  }

  if (cleaned.length === 0) {
    return Response.json({ error: "AI returned no usable names." }, { status: 502 });
  }

  const insertedGender = gender === "any" ? null : (gender as "masculine" | "feminine" | "unisex");
  const inserted = await db
    .insert(schema.names)
    .values(
      cleaned.map((name) => (insertedGender ? { name, gender: insertedGender } : { name }))
    )
    .onConflictDoNothing({ target: schema.names.name })
    .returning({ id: schema.names.id, name: schema.names.name });

  // Pre-enrich the new names in one batched call so swiping stays cache-only.
  await enrichAndPersist(client, inserted);

  return Response.json({
    requested: count,
    generated: cleaned.length,
    added: inserted.length,
    duplicates: cleaned.length - inserted.length,
    seedSampleSize: liked.length,
    names: inserted,
  });
}
