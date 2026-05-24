import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { ORIGIN_GROUPS, ORIGIN_GROUP_KEYS } from "@/lib/origin-groups";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function readExcluded(coupleId: string): Promise<string[]> {
  const [state] = await db
    .select({ excluded: schema.coupleState.excludedOriginGroups })
    .from(schema.coupleState)
    .where(eq(schema.coupleState.coupleId, coupleId))
    .limit(1);
  return (state?.excluded ?? []).filter((g) => ORIGIN_GROUP_KEYS.has(g));
}

export async function GET() {
  const member = await readMember();
  if (!member) return unauthorized();

  const counts = (await db.execute<{ origin_group: string | null; c: number }>(sql`
    select origin_group, count(*)::int as c from names group by origin_group
  `)) as unknown as Array<{ origin_group: string | null; c: number }>;
  const countByKey = new Map<string, number>();
  for (const r of counts) countByKey.set(r.origin_group ?? "other", Number(r.c));

  const excluded = await readExcluded(member.coupleId);
  const groups = ORIGIN_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    count: countByKey.get(g.key) ?? 0,
    excluded: excluded.includes(g.key),
  }));

  return Response.json({ groups, excluded });
}

export async function PUT(req: Request) {
  const member = await readMember();
  if (!member) return unauthorized();

  let body: { excluded?: unknown };
  try {
    body = (await req.json()) as { excluded?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.excluded)) {
    return Response.json({ error: "excluded must be an array" }, { status: 400 });
  }
  // Keep only known group keys; never allow excluding everything.
  const excluded = Array.from(
    new Set(body.excluded.filter((g): g is string => typeof g === "string" && ORIGIN_GROUP_KEYS.has(g)))
  );
  if (excluded.length >= ORIGIN_GROUPS.length) {
    return Response.json({ error: "cannot exclude every origin" }, { status: 400 });
  }

  await db
    .insert(schema.coupleState)
    .values({ coupleId: member.coupleId, excludedOriginGroups: excluded })
    .onConflictDoUpdate({
      target: schema.coupleState.coupleId,
      set: { excludedOriginGroups: excluded },
    });

  return Response.json({ ok: true, excluded });
}
