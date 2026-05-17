import { config } from "dotenv";
config({ path: ".env.local" });
config();

import Anthropic from "@anthropic-ai/sdk";
import postgres from "postgres";

const BATCH_SIZE = 60;

type Verdict = "masculine" | "feminine" | "unisex";

async function classifyBatch(client: Anthropic, names: string[]): Promise<Record<string, Verdict>> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3500,
    system: [
      "You classify first names by typical gender association in the UK.",
      'Output ONLY a JSON object: {"NAME": "masculine"|"feminine"|"unisex", ...}.',
      "Use 'unisex' only for names that are genuinely common for both genders in the UK (e.g. Alex, Sam, Charlie, Robin, Riley).",
      "When in doubt, choose the more common single gender, not unisex.",
      "Return the same casing for keys as given in the input.",
      "No prose, no markdown, no extra fields.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: `Classify these ${names.length} names:\n${names.join(", ")}`,
      },
    ],
  });
  const raw = response.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no json object in response");
  const parsed = JSON.parse(match[0]) as Record<string, string>;
  const out: Record<string, Verdict> = {};
  for (const [k, v] of Object.entries(parsed)) {
    const norm = v.trim().toLowerCase();
    if (norm === "masculine" || norm === "feminine" || norm === "unisex") {
      out[k] = norm;
    }
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

  const targets = await sql<{ id: number; name: string }[]>`
    select id, name from names where gender is null order by id
  `;
  console.log(`Untagged names: ${targets.length}`);

  let tagged = 0;
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const slice = targets.slice(i, i + BATCH_SIZE);
    process.stdout.write(`Batch ${Math.floor(i / BATCH_SIZE) + 1} (${slice.length} names) … `);
    try {
      const verdicts = await classifyBatch(client, slice.map((r) => r.name));
      const updates: { id: number; gender: Verdict }[] = [];
      for (const r of slice) {
        const v = verdicts[r.name] ?? verdicts[r.name.toLowerCase()] ?? verdicts[r.name.toUpperCase()];
        if (v) updates.push({ id: Number(r.id), gender: v });
      }
      if (updates.length > 0) {
        await sql.begin(async (tx) => {
          for (const u of updates) {
            await tx`update names set gender = ${u.gender} where id = ${u.id}`;
          }
        });
      }
      tagged += updates.length;
      console.log(`tagged ${updates.length}`);
    } catch (e) {
      console.log(`failed: ${(e as Error).message}`);
    }
  }

  const stats = await sql<{ gender: string | null; c: string }[]>`
    select gender, count(*)::text as c from names group by gender order by gender
  `;
  console.log(`\nTotal tagged this run: ${tagged}`);
  console.log("Distribution:");
  for (const s of stats) console.log(`  ${s.gender ?? "(null)"}: ${s.c}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
