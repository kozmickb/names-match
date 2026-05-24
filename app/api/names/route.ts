import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { ORIGIN_GROUP_KEYS } from "@/lib/origin-groups";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const member = await readMember();
  if (!member) return unauthorized();

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 30), 1), 100);

  const [state] = await db
    .select({
      seed: schema.coupleState.shuffleSeed,
      excludedOriginGroups: schema.coupleState.excludedOriginGroups,
    })
    .from(schema.coupleState)
    .where(eq(schema.coupleState.coupleId, member.coupleId))
    .limit(1);
  const seed = Number(state?.seed ?? 0);
  const shuffled = seed !== 0;

  // Shared "house rules": origin groups excluded from the deck (allowlist-validated).
  const excludedGroups = (state?.excludedOriginGroups ?? []).filter((g) => ORIGIN_GROUP_KEYS.has(g));
  const originFilter = excludedGroups.length
    ? sql.raw(`and n.origin_group not in (${excludedGroups.map((g) => `'${g}'`).join(",")})`)
    : sql``;

  const [profile] = await db
    .select({
      autoPass: schema.userProfiles.autoPassVariants,
      genderFilter: schema.userProfiles.genderFilter,
    })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.memberId, member.id))
    .limit(1);
  const autoPass = !!profile?.autoPass;
  const filter = profile?.genderFilter ?? "all";

  const orderClause = shuffled
    ? sql`hashtext(n.id::text || ':' || ${seed}::text)`
    : sql`n.id`;

  const variantsFilter = autoPass
    ? sql`and not exists (
        select 1 from swipes sv
        join names nv on nv.id = sv.name_id
        where sv.member_id = ${member.id}
          and abs(length(nv.name) - length(n.name)) <= 1
          and levenshtein(lower(nv.name), lower(n.name)) <= 1
      )`
    : sql``;

  const genderFilter =
    filter === "masculine"
      ? sql`and (n.gender = 'masculine' or n.gender = 'unisex' or n.gender is null)`
      : filter === "feminine"
      ? sql`and (n.gender = 'feminine' or n.gender = 'unisex' or n.gender is null)`
      : filter === "unisex"
      ? sql`and n.gender = 'unisex'`
      : sql``;

  const rows = (await db.execute<{ id: number; name: string }>(sql`
    select n.id, n.name
    from names n
    where not exists (
      select 1 from swipes s
      where s.name_id = n.id and s.member_id = ${member.id}
    )
    ${variantsFilter}
    ${genderFilter}
    ${originFilter}
    order by ${orderClause} asc
    limit ${limit}
  `)) as unknown as Array<{ id: number; name: string }>;

  // Total pool size under the active gender + origin filters.
  const [totalRow] = (await db.execute<{ total: number }>(sql`
    select count(*)::int as total
    from names n
    where true
    ${genderFilter}
    ${originFilter}
  `)) as unknown as Array<{ total: number }>;

  return Response.json({
    names: rows.map((r) => ({ id: Number(r.id), name: r.name })),
    total: Number(totalRow?.total ?? 0),
    shuffled,
    autoPassVariants: autoPass,
    genderFilter: filter,
    excludedOriginGroups: excludedGroups,
  });
}
