import { db, schema } from "@/db/client";
import { and, eq, gte, sql } from "drizzle-orm";

// Per-user, per-kind cap over a rolling 24h window. Override with AI_DAILY_LIMIT.
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 50;

export type LimitResult = { ok: boolean; remaining: number; limit: number };

/**
 * Count a user's calls of a given kind in the last 24h; if under the cap,
 * record this attempt and allow it. Guards the budget against runaway/abuse —
 * the dominant cost risk at scale, since per-call cost is otherwise tiny.
 */
export async function enforceAiLimit(
  memberId: string,
  kind: "generate" | "suggest"
): Promise<LimitResult> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.aiCalls)
    .where(
      and(
        eq(schema.aiCalls.memberId, memberId),
        eq(schema.aiCalls.kind, kind),
        gte(schema.aiCalls.createdAt, sql`now() - interval '24 hours'`)
      )
    );

  if (count >= DAILY_LIMIT) {
    return { ok: false, remaining: 0, limit: DAILY_LIMIT };
  }

  await db.insert(schema.aiCalls).values({ memberId, kind });
  return { ok: true, remaining: DAILY_LIMIT - count - 1, limit: DAILY_LIMIT };
}
