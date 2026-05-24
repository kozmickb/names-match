import { db } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const member = await readMember();
  if (!member) return unauthorized();

  const { id } = await ctx.params;
  const nameId = Number(id);
  if (!Number.isInteger(nameId) || nameId <= 0) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }

  const rows = (await db.execute<{ id: number; name: string }>(sql`
    with target as (
      select id, name from names where id = ${nameId}
    )
    select n.id, n.name
    from names n, target t
    where n.id <> t.id
      and abs(length(n.name) - length(t.name)) <= 1
      and levenshtein(lower(n.name), lower(t.name)) <= 1
    order by n.name
    limit 5
  `)) as unknown as Array<{ id: number; name: string }>;

  return Response.json({
    variants: rows.map((r) => ({ id: Number(r.id), name: r.name })),
  });
}
