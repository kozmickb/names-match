import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { isUserSlug } from "@/lib/user";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const member = await readMember();
  if (!member) return unauthorized();

  let body: { enabled?: unknown };
  try {
    body = (await req.json()) as { enabled?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "enabled must be boolean" }, { status: 400 });
  }

  await db
    .insert(schema.userProfiles)
    .values({ userSlug: isUserSlug(member.legacySlug) ? member.legacySlug : null, memberId: member.id, autoPassVariants: body.enabled })
    .onConflictDoUpdate({
      target: schema.userProfiles.memberId,
      set: { autoPassVariants: body.enabled, updatedAt: sql`now()` },
    });

  return Response.json({ ok: true, autoPassVariants: body.enabled });
}

export async function GET() {
  const member = await readMember();
  if (!member) return unauthorized();

  const [row] = await db
    .select({ enabled: schema.userProfiles.autoPassVariants })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.memberId, member.id))
    .limit(1);

  return Response.json({ autoPassVariants: !!row?.enabled });
}
