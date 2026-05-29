/**
 * db:cluster-variants — assign every name a canonical `variant_group` key so that
 * all spellings of one name (Mallory/Mallorie/Malorie) share it. Phase 2 of the
 * variant-grouping plan (docs/superpowers/plans/2026-05-29-variant-grouping.md).
 *
 * Strategy: double-metaphone buckets narrow the candidates (only phonetically-alike
 * names can be variants), then Claude partitions each bucket into true variant
 * groups — the precise judgment edit distance can't make (Mallory != Miller though
 * both code MLR). Singletons self-group with no AI call.
 *
 * Flags:
 *   --dry-run         print groupings, write nothing
 *   --refresh         re-cluster names that already have a variant_group
 *   --limit=N         only process the first N multi-name buckets (for testing)
 *   --sample=A,B,...  only process buckets containing one of these names
 *
 * Idempotent: by default only fills NULL variant_group.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const CONCURRENCY = 10;

const SYSTEM = [
  "You resolve baby-name spelling variants. You receive a list of names that all sound alike, each annotated [gender|origin] when known.",
  "Group names that are the SAME given name spelled differently — spelling or transliteration variants a parent would consider the same name. The SAME name often carries different origin labels across spellings, so group these despite the tags: Sofia/Sophia/Sophie, Catherine/Katherine/Kathryn, Mallory/Mallorie/Malorie, Aiden/Aidan/Ayden, Isabella/Izabella, Mohammed/Muhammad/Mohamed.",
  "Be conservative about MERGING DISTINCT names — when two names have a different root or meaning, keep them SEPARATE even if they sound alike. Two names are NOT variants if:",
  "- different gender (e.g. Zev m vs Ziva f);",
  "- different root/meaning (e.g. Safiyya 'pure' vs Safa 'clarity', Micah vs Mike/Michael, Mallory vs Miller, Caitlin vs Gatlin, Aiden vs Auden);",
  "- clearly unrelated traditions that merely transliterate alike (e.g. Irish Aidan vs Sanskrit Adhyan);",
  "- compound names whose first element differs (Myla-Rae vs Millie-Rae vs Miley-Rae are three different names);",
  "- a nickname/diminutive vs its long form (Katie is not a variant of Catherine; Mike is not a variant of Michael here).",
  "Origin tags are a hint, not a rule: weight spelling/sound similarity and shared meaning over differing origin labels.",
  "Output ONLY a JSON object mapping every input name (exact input casing) to the canonical (most standard / most common) spelling of its variant group.",
  "A name with no clear variant in the list maps to itself. The canonical MUST be exactly one of the input names. No prose, no markdown.",
].join(" ");

type Row = { id: number; name: string; dm: string; gender: string | null; origin: string | null };

function annotate(r: Row): string {
  const g = r.gender ? r.gender[0] : "?"; // m/f/u/?
  const o = r.origin ? r.origin : "?";
  return `${r.name} [${g}|${o}]`;
}

function arg(flag: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${flag}=`));
  return a ? a.slice(flag.length + 3) : undefined;
}
const DRY = process.argv.includes("--dry-run");
const REFRESH = process.argv.includes("--refresh");
const LIMIT = arg("limit") ? Number(arg("limit")) : undefined;
const SAMPLE = arg("sample")?.split(",").map((s) => s.trim().toLowerCase());

async function partition(
  client: Anthropic,
  batch: Row[]
): Promise<Map<string, string>> {
  // Returns lower(name) -> canonical (original casing). Falls back to self on any miss.
  const out = new Map<string, string>();
  for (const r of batch) out.set(r.name.toLowerCase(), r.name); // default: self-group

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: Math.min(8000, 300 + batch.length * 40),
    temperature: 0, // deterministic partitioning — same bucket always groups the same way
    system: SYSTEM,
    messages: [{ role: "user", content: `Names (key output by the plain name, ignore the [gender|origin] tag):\n${batch.map(annotate).join("\n")}` }],
  });
  const raw = response.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const match = raw.match(/\{[\s\S]*\}/);
  const json = JSON.parse(match ? match[0] : raw) as Record<string, unknown>;

  const inputByLower = new Map<string, string>();
  for (const r of batch) inputByLower.set(r.name.toLowerCase(), r.name);

  for (const [key, value] of Object.entries(json)) {
    const name = inputByLower.get(key.toLowerCase());
    if (!name || typeof value !== "string") continue;
    const canonical = inputByLower.get(value.trim().toLowerCase());
    if (canonical) out.set(name.toLowerCase(), canonical); // canonical must be an input name
  }
  return out;
}

async function pool<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>) {
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        await fn(items[i], i);
      }
    })
  );
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const sql = postgres(dbUrl, { ssl: "require" });
  const client = new Anthropic({ apiKey });

  try {
    const rows = (await sql`select id, name, dmetaphone(name) as dm, gender, origin from names`) as unknown as Row[];
    console.log(`names: ${rows.length}`);

    // Bucket by double-metaphone. Empty code => its own singleton group.
    const buckets = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.dm && r.dm.length ? r.dm : `__self_${r.id}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    }

    const assign = new Map<number, string>(); // name id -> variant_group key (lower)
    const llmBuckets: Row[][] = [];
    for (const list of buckets.values()) {
      if (list.length === 1) {
        assign.set(list[0].id, list[0].name.toLowerCase()); // singleton self-group
      } else {
        llmBuckets.push(list);
      }
    }

    // Optional narrowing for validation runs.
    let work = llmBuckets;
    if (SAMPLE) {
      work = work.filter((b) => b.some((r) => SAMPLE.includes(r.name.toLowerCase())));
    }
    if (LIMIT !== undefined) work = work.slice(0, LIMIT);
    console.log(
      `singletons: ${assign.size} | multi-name buckets to cluster: ${work.length}` +
        (SAMPLE || LIMIT !== undefined ? " (narrowed)" : "")
    );

    // One phonetic bucket per call: judging a bucket in isolation gives more
    // consistent partitions than mixing unrelated buckets in one prompt.
    const batches: Row[][] = work;

    const bucketByName = new Map<string, string>(); // lower(name) -> bucket key
    for (const [key, list] of buckets) for (const r of list) bucketByName.set(r.name.toLowerCase(), key);

    let done = 0;
    let failed = 0;
    const bigGroups: string[] = [];
    const groupMembers = new Map<string, string[]>(); // key -> sample names (for logging)

    await pool(batches, CONCURRENCY, async (batch) => {
      const idByLower = new Map<string, number>();
      for (const r of batch) idByLower.set(r.name.toLowerCase(), r.id);
      try {
        const mapping = await partition(client, batch);
        for (const r of batch) {
          const canonical = mapping.get(r.name.toLowerCase()) ?? r.name;
          // Guard: canonical must live in the SAME phonetic bucket (no cross-bucket merge).
          const sameBucket = bucketByName.get(canonical.toLowerCase()) === bucketByName.get(r.name.toLowerCase());
          const key = (sameBucket ? canonical : r.name).toLowerCase();
          assign.set(r.id, key);
          if (!groupMembers.has(key)) groupMembers.set(key, []);
          groupMembers.get(key)!.push(r.name);
        }
      } catch (e) {
        failed++;
        // Leave these NULL; the query-time heuristic fallback still covers them.
        console.warn(`  batch failed (${batch.length} names): ${(e as Error).message}`);
      }
      done += batch.length;
      if (done % 1000 < batch.length) console.log(`  clustered ~${done} names...`);
    });

    for (const [key, members] of groupMembers) {
      if (members.length >= 8) bigGroups.push(`${key} (${members.length}): ${members.slice(0, 12).join(", ")}`);
    }

    // Report
    const distinct = new Set(assign.values()).size;
    const multiName = [...groupMembers.values()].filter((m) => m.length > 1).length;
    console.log(`\nassigned ${assign.size} names -> ${distinct} variant groups (${multiName} multi-name groups, ${failed} failed batches)`);
    if (bigGroups.length) {
      console.log(`large groups to eyeball (>=8 members):`);
      for (const g of bigGroups.slice(0, 30)) console.log("  " + g);
    }

    if (DRY) {
      // Print a few sample groups for inspection.
      const sample = [...groupMembers.entries()].filter(([, m]) => m.length > 1).slice(0, 25);
      console.log("\nsample multi-name groups:");
      for (const [key, members] of sample) console.log(`  ${key}: ${members.join(", ")}`);
      console.log("\n(dry-run: nothing written)");
      return;
    }

    // Bulk update, grouped by key. Respect --refresh / fill-null-only.
    const byKey = new Map<string, number[]>();
    for (const [id, key] of assign) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(id);
    }
    const guard = REFRESH ? sql`` : sql`and variant_group is null`;
    let written = 0;
    for (const [key, ids] of byKey) {
      for (let i = 0; i < ids.length; i += 2000) {
        const chunk = ids.slice(i, i + 2000);
        const res = await sql`update names set variant_group = ${key} where id = any(${chunk}) ${guard}`;
        written += res.count ?? 0;
      }
    }
    console.log(`\nwrote variant_group for ${written} names.`);
    const [c] = (await sql`select count(*)::int total, count(variant_group)::int filled from names`) as unknown as Array<{ total: number; filled: number }>;
    console.log(`coverage: ${c.filled}/${c.total}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
