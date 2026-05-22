import { config } from "dotenv";
config({ path: ".env.local" });
config();

import Anthropic from "@anthropic-ai/sdk";
import postgres from "postgres";
import { enrichNames } from "../lib/enrich";

// Names handed to enrichNames per round; it internally chunks at 40/call.
const ROUND = 200;
// Cutoff for the API-outage window that blanked names via the old
// negative-cache-on-error bug. Rows fetched on/after this with empty values
// are reset so they re-enrich.
const OUTAGE_CUTOFF = "2026-05-18";

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const dbUrl = process.env.DATABASE_URL;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const sql = postgres(dbUrl, { ssl: "require" });
  const client = new Anthropic({ apiKey });

  try {
    // 1. Reset rows blanked during the outage so they are picked up below.
    const resetMeta = await sql`
      update names set meta_fetched_at = null
      where meta_fetched_at >= ${OUTAGE_CUTOFF} and meaning is null and origin is null`;
    const resetPop = await sql`
      update names set popularity_fetched_at = null
      where popularity_fetched_at >= ${OUTAGE_CUTOFF} and uk_rank is null and uk_blurb is null`;
    console.log(`reset blanked rows -> meta: ${resetMeta.count}, popularity: ${resetPop.count}`);

    // 2. Everything still missing either side of enrichment.
    const rows = await sql<{ id: number; name: string }[]>`
      select id, name from names
      where meta_fetched_at is null or popularity_fetched_at is null
      order by id`;
    console.log(`names needing enrichment: ${rows.length}`);
    if (rows.length === 0) {
      console.log("nothing to do.");
      return;
    }

    let updated = 0;
    for (let i = 0; i < rows.length; i += ROUND) {
      const batch = rows.slice(i, i + ROUND);
      const facts = await enrichNames(client, batch.map((r) => r.name));
      await sql.begin(async (tx) => {
        for (const r of batch) {
          const e = facts.get(r.name);
          if (!e) continue; // model omitted it — leave for a later run
          // COALESCE keeps any existing non-null value; only fills gaps.
          await tx`
            update names set
              origin = coalesce(${e.origin}, origin),
              meaning = coalesce(${e.meaning}, meaning),
              meta_fetched_at = now(),
              uk_rank = coalesce(${e.rank}, uk_rank),
              uk_blurb = coalesce(${e.blurb}, uk_blurb),
              popularity_fetched_at = now()
            where id = ${r.id}`;
          updated++;
        }
      });
      console.log(`  enriched ${Math.min(i + ROUND, rows.length)}/${rows.length}`);
    }

    console.log(`done. updated ${updated} names.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
