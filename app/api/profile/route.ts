import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({ slug: schema.userProfiles.userSlug, emoji: schema.userProfiles.emoji })
    .from(schema.userProfiles);

  const out: { karo: { emoji: string }; lucy: { emoji: string } } = {
    karo: { emoji: "🧔🏻" },
    lucy: { emoji: "👩🏼" },
  };
  for (const r of rows) {
    if (r.slug === "karo" || r.slug === "lucy") out[r.slug].emoji = r.emoji;
  }
  return Response.json(out);
}

export async function POST(req: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

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
    .values({ userSlug: slug, emoji })
    .onConflictDoUpdate({
      target: schema.userProfiles.userSlug,
      set: { emoji, updatedAt: sql`now()` },
    });

  return Response.json({ ok: true, emoji });
}
