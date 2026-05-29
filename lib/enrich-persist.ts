import type Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { eq, sql } from "drizzle-orm";
import { enrichNames } from "@/lib/enrich";

/**
 * Batch-enrich freshly inserted names and persist origin/meaning/rank/blurb.
 * Best-effort: any failure is swallowed so the on-swipe fallback can fill gaps.
 */
/**
 * Assign new names a variant_group by adopting the nearest existing curated group
 * (same double-metaphone, levenshtein <= 2), else self-group. Keeps newly generated
 * names in sync with the clustered catalog without an extra LLM call. Best-effort.
 */
export async function assignVariantGroups(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await db.execute(sql`
      update names n set variant_group = coalesce(
        (select e.variant_group from names e
          where e.id <> n.id and e.variant_group is not null
            and dmetaphone(e.name) = dmetaphone(n.name) and dmetaphone(n.name) <> ''
            and levenshtein(lower(e.name), lower(n.name)) <= 2
          order by levenshtein(lower(e.name), lower(n.name)) asc
          limit 1),
        lower(n.name)
      )
      where n.id = any(${ids}) and n.variant_group is null
    `);
  } catch {
    // best-effort; the query-time heuristic fallback still covers null groups
  }
}

export async function enrichAndPersist(
  client: Anthropic,
  rows: Array<{ id: number; name: string }>
): Promise<void> {
  if (rows.length === 0) return;
  await assignVariantGroups(rows.map((r) => r.id));
  try {
    const facts = await enrichNames(client, rows.map((r) => r.name));
    await Promise.all(
      rows.map((r) => {
        const e = facts.get(r.name);
        if (!e) return Promise.resolve();
        return db
          .update(schema.names)
          .set({
            origin: e.origin,
            meaning: e.meaning,
            metaFetchedAt: sql`now()`,
            ukRank: e.rank,
            ukBlurb: e.blurb,
            popularityFetchedAt: sql`now()`,
          })
          .where(eq(schema.names.id, r.id));
      })
    );
  } catch {
    // best-effort
  }
}
