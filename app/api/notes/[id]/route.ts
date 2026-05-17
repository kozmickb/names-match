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

  let body: { note?: unknown };
  try {
    body = (await req.json()) as { note?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const noteRaw = typeof body.note === "string" ? body.note.trim() : "";
  const note = noteRaw.length === 0 ? null : noteRaw.slice(0, 400);

  const result = await db
    .update(schema.swipes)
    .set({ note })
    .where(and(eq(schema.swipes.userSlug, slug), eq(schema.swipes.nameId, nameId)))
    .returning({ id: schema.swipes.id });

  if (result.length === 0) {
    return Response.json({ error: "you have not swiped this name" }, { status: 404 });
  }

  return Response.json({ ok: true, note });
}
