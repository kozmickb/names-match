import { config } from "dotenv";
config({ path: ".env.local" });
config();

import Anthropic from "@anthropic-ai/sdk";
import postgres from "postgres";

const NAME_RE = /^[A-Za-z][A-Za-z'-]{1,28}[A-Za-z]$/;

function normalise(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

const BATCHES: { count: number; vibe: string }[] = [
  { count: 60, vibe: "classic English and Western European feminine names" },
  { count: 60, vibe: "modern popular UK girl names of the 2010s and 2020s" },
  { count: 60, vibe: "vintage Edwardian and Victorian girl names" },
  { count: 60, vibe: "Irish, Welsh, and Scottish feminine names" },
  { count: 60, vibe: "Italian, French, Spanish feminine names" },
  { count: 60, vibe: "Greek, Roman, and biblical feminine names" },
  { count: 60, vibe: "Scandinavian and Germanic feminine names" },
  { count: 60, vibe: "Japanese, Indian, Arabic and other global feminine names" },
  { count: 60, vibe: "nature-inspired and botanical feminine names" },
  { count: 60, vibe: "literary, mythological and saintly feminine names" },
  { count: 60, vibe: "soft two-syllable feminine names ending in a vowel" },
  { count: 60, vibe: "Eastern European Slavic and Russian feminine names" },
  { count: 60, vibe: "uncommon Old English and Anglo-Saxon feminine names" },
];

async function generateBatch(client: Anthropic, count: number, vibe: string): Promise<string[]> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    system: [
      "You generate feminine first names suitable for a baby girl.",
      "Output ONLY a JSON array of name strings.",
      "Each name is a single word (hyphens allowed), properly capitalised.",
      "No surnames, no nicknames in parentheses, no diacritics, no emojis, no duplicates.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: `Generate ${count} ${vibe}. Return only a JSON array of name strings.`,
      },
    ],
  });
  const raw = response.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const match = raw.match(/\[[\s\S]*\]/);
  const parsed = JSON.parse(match ? match[0] : raw);
  if (!Array.isArray(parsed)) throw new Error("AI did not return an array");
  const out: string[] = [];
  for (const r of parsed) {
    if (typeof r !== "string") continue;
    const n = normalise(r);
    if (NAME_RE.test(n)) out.push(n);
  }
  return out;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const client = new Anthropic({ apiKey });
  const sql = postgres(url, { max: 1 });

  const collected = new Set<string>();
  let batchIndex = 0;
  for (const batch of BATCHES) {
    batchIndex++;
    process.stdout.write(`[${batchIndex}/${BATCHES.length}] ${batch.vibe} … `);
    try {
      const names = await generateBatch(client, batch.count, batch.vibe);
      let newOnes = 0;
      for (const n of names) {
        if (!collected.has(n.toLowerCase())) {
          collected.add(n.toLowerCase());
          newOnes++;
        }
      }
      console.log(`+${newOnes} (collected: ${collected.size})`);
    } catch (e) {
      console.log(`failed: ${(e as Error).message}`);
    }
  }

  console.log(`\nTotal collected: ${collected.size}`);

  const finalNames = Array.from(collected).map((lower) => {
    return lower
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("-");
  });

  const chunkSize = 200;
  let inserted = 0;
  for (let i = 0; i < finalNames.length; i += chunkSize) {
    const chunk = finalNames.slice(i, i + chunkSize).map((n) => ({ name: n }));
    const r = await sql`
      insert into names ${sql(chunk, "name")}
      on conflict (name) do nothing
      returning id
    `;
    inserted += r.length;
  }

  const [{ count }] = await sql<{ count: string }[]>`select count(*)::text as count from names`;
  console.log(`Inserted ${inserted} new rows. Total names in DB: ${count}.`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
