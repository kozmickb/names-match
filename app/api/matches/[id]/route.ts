import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const { id } = await ctx.params;
  const nameId = Number(id);
  if (!Number.isInteger(nameId) || nameId <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  await db
    .delete(schema.swipes)
    .where(and(eq(schema.swipes.userSlug, slug), eq(schema.swipes.nameId, nameId)));

  return Response.json({ ok: true });
}
