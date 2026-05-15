import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { partnerOf } from "@/lib/user";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  let body: { nameId?: unknown; decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const nameId = Number(body.nameId);
  const decision = body.decision;
  if (!Number.isInteger(nameId) || nameId <= 0) {
    return Response.json({ error: "invalid nameId" }, { status: 400 });
  }
  if (decision !== "like" && decision !== "pass") {
    return Response.json({ error: "invalid decision" }, { status: 400 });
  }

  await db
    .insert(schema.swipes)
    .values({ userSlug: slug, nameId, decision })
    .onConflictDoNothing({ target: [schema.swipes.userSlug, schema.swipes.nameId] });

  if (decision !== "like") {
    return Response.json({ isMatch: false });
  }

  const partner = partnerOf(slug);
  const partnerLike = await db
    .select({ id: schema.swipes.id })
    .from(schema.swipes)
    .where(
      and(
        eq(schema.swipes.userSlug, partner),
        eq(schema.swipes.nameId, nameId),
        eq(schema.swipes.decision, "like")
      )
    )
    .limit(1);

  if (partnerLike.length === 0) {
    return Response.json({ isMatch: false });
  }

  const [nameRow] = await db
    .select({ id: schema.names.id, name: schema.names.name })
    .from(schema.names)
    .where(eq(schema.names.id, nameId))
    .limit(1);

  return Response.json({ isMatch: true, name: nameRow ?? { id: nameId, name: "" } });
}
