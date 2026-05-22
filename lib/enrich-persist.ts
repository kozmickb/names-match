import type Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { eq, sql } from "drizzle-orm";
import { enrichNames } from "@/lib/enrich";

/**
 * Batch-enrich freshly inserted names and persist origin/meaning/rank/blurb.
 * Best-effort: any failure is swallowed so the on-swipe fallback can fill gaps.
 */
export async function enrichAndPersist(
  client: Anthropic,
  rows: Array<{ id: number; name: string }>
): Promise<void> {
  if (rows.length === 0) return;
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
