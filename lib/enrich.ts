import type Anthropic from "@anthropic-ai/sdk";

export type Enrichment = {
  origin: string | null;
  meaning: string | null;
  rank: number | null;
  blurb: string | null;
};

const MODEL = "claude-haiku-4-5-20251001";
const BATCH_SIZE = 40;

const SYSTEM = [
  "You are a baby-name reference. For EACH first name given, return its origin, meaning, UK popularity rank, and a popularity blurb.",
  'Output ONLY a JSON object mapping each input name (exact casing) to {"origin": string|null, "meaning": string|null, "rank": integer|null, "blurb": string|null}.',
  "origin: 1-3 words like 'Welsh', 'Old Norse', 'Hebrew', 'Latin'. null if genuinely unknown — never invent.",
  "meaning: short lowercase phrase, no surrounding quotes (e.g. pure of heart, son of the right hand, dark warrior). null if unknown.",
  "rank: latest ONS England & Wales top-100 rank (integer 1-100) for the most likely gender, else null. Never invent a number.",
  "blurb: one short phrase, max 60 chars, on popularity/era/trend (e.g. 'Top 10 since 2018', 'Vintage revival', 'Rare today', 'Traditional'). null if nothing useful.",
  "No prose, no markdown, no extra keys.",
].join(" ");

function clean(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function cleanRank(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
}

async function enrichChunk(
  client: Anthropic,
  names: string[]
): Promise<Map<string, Enrichment>> {
  const result = new Map<string, Enrichment>();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: Math.min(8000, 200 + names.length * 60),
    system: SYSTEM,
    messages: [{ role: "user", content: `Names: ${names.join(", ")}` }],
  });

  const raw = response.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const match = raw.match(/\{[\s\S]*\}/);
  const json = JSON.parse(match ? match[0] : raw) as Record<string, unknown>;

  // Map the model's keys back to our input names case-insensitively.
  const byLower = new Map<string, string>();
  for (const n of names) byLower.set(n.toLowerCase(), n);

  for (const [key, value] of Object.entries(json)) {
    const original = byLower.get(key.toLowerCase());
    if (!original || typeof value !== "object" || value === null) continue;
    const v = value as Record<string, unknown>;
    result.set(original, {
      origin: clean(v.origin, 60),
      meaning: clean(v.meaning, 120),
      rank: cleanRank(v.rank),
      blurb: clean(v.blurb, 80),
    });
  }

  return result;
}

/**
 * Enrich many names in batched calls (~40/call). Returns a map keyed by the
 * exact input name. Names the model omits are simply absent from the map.
 * A failed chunk is skipped (its names stay unenriched and can be retried),
 * never poisoned with blanks.
 */
export async function enrichNames(
  client: Anthropic,
  names: string[]
): Promise<Map<string, Enrichment>> {
  const merged = new Map<string, Enrichment>();
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const chunk = names.slice(i, i + BATCH_SIZE);
    try {
      const part = await enrichChunk(client, chunk);
      for (const [k, v] of part) merged.set(k, v);
    } catch {
      // Skip this chunk — leave its names unenriched for a later retry.
    }
  }
  return merged;
}
