import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { partnerOf } from "@/lib/user";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const [last] = await db
    .select({
      id: schema.swipes.id,
      nameId: schema.swipes.nameId,
      decision: schema.swipes.decision,
    })
    .from(schema.swipes)
    .where(eq(schema.swipes.userSlug, slug))
    .orderBy(desc(schema.swipes.createdAt))
    .limit(1);

  if (!last) {
    return Response.json({ undone: false, reason: "nothing_to_undo" }, { status: 404 });
  }

  let wasMatch = false;
  if (last.decision === "like") {
    const partner = partnerOf(slug);
    const partnerLike = await db
      .select({ id: schema.swipes.id })
      .from(schema.swipes)
      .where(
        and(
          eq(schema.swipes.userSlug, partner),
          eq(schema.swipes.nameId, last.nameId),
          eq(schema.swipes.decision, "like")
        )
      )
      .limit(1);
    wasMatch = partnerLike.length > 0;
  }

  const [name] = await db
    .select({ id: schema.names.id, name: schema.names.name })
    .from(schema.names)
    .where(eq(schema.names.id, last.nameId))
    .limit(1);

  await db.delete(schema.swipes).where(eq(schema.swipes.id, last.id));

  return Response.json({
    undone: true,
    name: name ?? { id: last.nameId, name: "" },
    decision: last.decision,
    wasMatch,
  });
}
