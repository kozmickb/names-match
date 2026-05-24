import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const member = await readMember();
  if (!member) return unauthorized();

  const { id } = await ctx.params;
  const nameId = Number(id);
  if (!Number.isInteger(nameId) || nameId <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  await db
    .delete(schema.swipes)
    .where(and(eq(schema.swipes.memberId, member.id), eq(schema.swipes.nameId, nameId)));

  return Response.json({ ok: true });
}
