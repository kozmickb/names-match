import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID = new Set(["all", "masculine", "feminine", "unisex"]);

export async function GET() {
  const member = await readMember();
  if (!member) return unauthorized();

  const [row] = await db
    .select({ filter: schema.userProfiles.genderFilter })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.memberId, member.id))
    .limit(1);

  return Response.json({ genderFilter: row?.filter ?? "all" });
}

export async function POST(req: Request) {
  const member = await readMember();
  if (!member) return unauthorized();

  let body: { filter?: unknown };
  try {
    body = (await req.json()) as { filter?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (typeof body.filter !== "string" || !VALID.has(body.filter)) {
    return Response.json({ error: "invalid filter" }, { status: 400 });
  }

  await db
    .insert(schema.userProfiles)
    .values({ userSlug: member.legacySlug as "karo" | "lucy", memberId: member.id, genderFilter: body.filter })
    .onConflictDoUpdate({
      target: schema.userProfiles.memberId,
      set: { genderFilter: body.filter, updatedAt: sql`now()` },
    });

  return Response.json({ ok: true, genderFilter: body.filter });
}
