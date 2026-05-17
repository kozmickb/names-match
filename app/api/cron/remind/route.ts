import { db, schema } from "@/db/client";
import { sendPushTo } from "@/lib/push";
import { displayName, type UserSlug } from "@/lib/user";
import { and, desc, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STALE_HOURS = 24;

export async function GET() {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const h = await headers();
    const auth = h.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const [{ totalNames }] = await db
    .select({ totalNames: sql<number>`count(*)::int` })
    .from(schema.names);

  const results: Array<{ user: UserSlug; sent: number; skipped: boolean; reason?: string }> = [];

  for (const user of ["karo", "lucy"] as const) {
    const [last] = await db
      .select({ createdAt: schema.swipes.createdAt })
      .from(schema.swipes)
      .where(eq(schema.swipes.userSlug, user))
      .orderBy(desc(schema.swipes.createdAt))
      .limit(1);

    const lastTime = last ? new Date(last.createdAt).getTime() : 0;
    const hoursSince = lastTime ? (Date.now() - lastTime) / 1000 / 3600 : Infinity;

    if (hoursSince < STALE_HOURS) {
      results.push({ user, sent: 0, skipped: true, reason: "recent_activity" });
      continue;
    }

    const [{ swiped }] = await db
      .select({ swiped: sql<number>`count(*)::int` })
      .from(schema.swipes)
      .where(eq(schema.swipes.userSlug, user));

    const remaining = totalNames - swiped;
    if (remaining <= 0) {
      results.push({ user, sent: 0, skipped: true, reason: "all_swiped" });
      continue;
    }

    const partnerName = displayName(user === "karo" ? "lucy" : "karo");
    const { sent } = await sendPushTo(user, {
      title: "Your deck is waiting",
      body: `${remaining.toLocaleString()} names left to swipe. ${partnerName} might have already moved.`,
      url: "/swipe",
      tag: "remind",
    });
    results.push({ user, sent, skipped: false });
  }

  return Response.json({ ok: true, results });
}
