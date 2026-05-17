import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 30), 1), 100);

  const [state] = await db
    .select({ seed: schema.appState.shuffleSeed })
    .from(schema.appState)
    .where(eq(schema.appState.id, 1))
    .limit(1);
  const seed = Number(state?.seed ?? 0);
  const shuffled = seed !== 0;

  const [profile] = await db
    .select({ autoPass: schema.userProfiles.autoPassVariants })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userSlug, slug))
    .limit(1);
  const autoPass = !!profile?.autoPass;

  const orderClause = shuffled
    ? sql`hashtext(n.id::text || ':' || ${seed}::text)`
    : sql`n.id`;

  const variantsFilter = autoPass
    ? sql`and not exists (
        select 1 from swipes sv
        join names nv on nv.id = sv.name_id
        where sv.user_slug = ${slug}
          and abs(length(nv.name) - length(n.name)) <= 1
          and levenshtein(lower(nv.name), lower(n.name)) <= 1
      )`
    : sql``;

  const rows = (await db.execute<{ id: number; name: string }>(sql`
    select n.id, n.name
    from names n
    where not exists (
      select 1 from swipes s
      where s.name_id = n.id and s.user_slug = ${slug}
    )
    ${variantsFilter}
    order by ${orderClause} asc
    limit ${limit}
  `)) as unknown as Array<{ id: number; name: string }>;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.names);

  return Response.json({
    names: rows.map((r) => ({ id: Number(r.id), name: r.name })),
    total,
    shuffled,
    autoPassVariants: autoPass,
  });
}
