import { db, schema } from "@/db/client";
import { sendPushTo } from "@/lib/push";
import { getCoupleMembers } from "@/lib/members";
import { desc, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STALE_HOURS = 24;

export async function GET() {
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed in production: this endpoint enumerates members and fires push, so
  // it must never be reachable unauthenticated. Vercel attaches the Bearer
  // automatically once CRON_SECRET is set in the project env (until then,
  // scheduled reminders are paused by design rather than left wide open).
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    return Response.json({ error: "cron not configured" }, { status: 503 });
  }
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

  const allMembers = await db
    .select({
      id: schema.members.id,
      coupleId: schema.members.coupleId,
      displayName: schema.members.displayName,
    })
    .from(schema.members);

  const results: Array<{ memberId: string; sent: number; skipped: boolean; reason?: string }> = [];

  for (const m of allMembers) {
    const [last] = await db
      .select({ createdAt: schema.swipes.createdAt })
      .from(schema.swipes)
      .where(eq(schema.swipes.memberId, m.id))
      .orderBy(desc(schema.swipes.createdAt))
      .limit(1);

    const lastTime = last ? new Date(last.createdAt).getTime() : 0;
    const hoursSince = lastTime ? (Date.now() - lastTime) / 1000 / 3600 : Infinity;

    if (hoursSince < STALE_HOURS) {
      results.push({ memberId: m.id, sent: 0, skipped: true, reason: "recent_activity" });
      continue;
    }

    const [{ swiped }] = await db
      .select({ swiped: sql<number>`count(*)::int` })
      .from(schema.swipes)
      .where(eq(schema.swipes.memberId, m.id));

    const remaining = totalNames - swiped;
    if (remaining <= 0) {
      results.push({ memberId: m.id, sent: 0, skipped: true, reason: "all_swiped" });
      continue;
    }

    const members = await getCoupleMembers(m.coupleId);
    const partner = members.find((x) => x.id !== m.id);
    const partnerName = partner?.displayName ?? "Your partner";
    const { sent } = await sendPushTo(m.id, {
      title: "Your deck is waiting",
      body: `${remaining.toLocaleString()} names left to swipe. ${partnerName} might have already moved.`,
      url: "/swipe",
      tag: "remind",
    });
    results.push({ memberId: m.id, sent, skipped: false });
  }

  return Response.json({ ok: true, results });
}
