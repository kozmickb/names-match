import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { isUserSlug } from "@/lib/user";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({ legacySlug: schema.members.legacySlug, emoji: schema.userProfiles.emoji })
    .from(schema.userProfiles)
    .innerJoin(schema.members, eq(schema.members.id, schema.userProfiles.memberId));

  const out: { karo: { emoji: string }; lucy: { emoji: string } } = {
    karo: { emoji: "🧔🏻" },
    lucy: { emoji: "👩🏼" },
  };
  for (const r of rows) {
    if (r.legacySlug === "karo" || r.legacySlug === "lucy") out[r.legacySlug].emoji = r.emoji;
  }
  return Response.json(out);
}

export async function POST(req: Request) {
  const member = await readMember();
  if (!member) return unauthorized();

  let body: { emoji?: unknown };
  try {
    body = (await req.json()) as { emoji?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (typeof body.emoji !== "string") {
    return Response.json({ error: "emoji must be a string" }, { status: 400 });
  }
  const emoji = body.emoji.trim().slice(0, 16);
  if (emoji.length === 0) {
    return Response.json({ error: "emoji cannot be empty" }, { status: 400 });
  }

  await db
    .insert(schema.userProfiles)
    .values({ userSlug: isUserSlug(member.legacySlug) ? member.legacySlug : null, memberId: member.id, emoji })
    .onConflictDoUpdate({
      target: schema.userProfiles.memberId,
      set: { emoji, updatedAt: sql`now()` },
    });

  return Response.json({ ok: true, emoji });
}
