import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getState() {
  const [row] = await db
    .select({
      seed: schema.appState.shuffleSeed,
      updatedAt: schema.appState.shuffleUpdatedAt,
    })
    .from(schema.appState)
    .where(eq(schema.appState.id, 1))
    .limit(1);
  const seed = Number(row?.seed ?? 0);
  return {
    enabled: seed !== 0,
    seed,
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

export async function GET() {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();
  return Response.json(await getState());
}

export async function POST(request: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  let body: { enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "enabled must be boolean" }, { status: 400 });
  }

  let newSeed = 0;
  if (body.enabled) {
    const r = Math.floor(Math.random() * 2_000_000_000) + 1;
    newSeed = r;
  }

  await db.execute(sql`
    insert into app_state (id, shuffle_seed, shuffle_updated_at)
    values (1, ${newSeed}, now())
    on conflict (id) do update set
      shuffle_seed = excluded.shuffle_seed,
      shuffle_updated_at = excluded.shuffle_updated_at
  `);

  return Response.json(await getState());
}
