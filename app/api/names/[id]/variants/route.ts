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

  // Same rule as the deck's auto-pass variant filter (see app/api/names/route.ts)
  // so the "Also spelled" list matches exactly what rejecting this name hides:
  // the curated variant_group key, with a phonetic heuristic fallback for names
  // not yet grouped.
  const rows = (await db.execute<{ id: number; name: string }>(sql`
    with target as (
      select id, name, variant_group from names where id = ${nameId}
    )
    select n.id, n.name
    from names n, target t
    where n.id <> t.id
      and (
        (t.variant_group is not null and n.variant_group = t.variant_group)
        or (
          (t.variant_group is null or n.variant_group is null)
          and dmetaphone(n.name) = dmetaphone(t.name)
          and dmetaphone(t.name) <> ''
          and levenshtein(lower(n.name), lower(t.name)) <= 2
        )
      )
    order by n.name
    limit 5
  `)) as unknown as Array<{ id: number; name: string }>;

  return Response.json({
    variants: rows.map((r) => ({ id: Number(r.id), name: r.name })),
  });
}
