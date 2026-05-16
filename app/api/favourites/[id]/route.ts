import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const { id } = await ctx.params;
  const nameId = Number(id);
  if (!Number.isInteger(nameId) || nameId <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  let body: { favourite?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (typeof body.favourite !== "boolean") {
    return Response.json({ error: "favourite must be boolean" }, { status: 400 });
  }

  const result = await db
    .update(schema.swipes)
    .set({ favourite: body.favourite })
    .where(
      and(
        eq(schema.swipes.userSlug, slug),
        eq(schema.swipes.nameId, nameId),
        eq(schema.swipes.decision, "like")
      )
    )
    .returning({ id: schema.swipes.id });

  if (result.length === 0) {
    return Response.json({ error: "you have not liked this name" }, { status: 404 });
  }

  return Response.json({ ok: true, favourite: body.favourite });
}
