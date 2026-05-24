import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getState(coupleId: string) {
  const [row] = await db
    .select({
      seed: schema.coupleState.shuffleSeed,
      updatedAt: schema.coupleState.shuffleUpdatedAt,
    })
    .from(schema.coupleState)
    .where(eq(schema.coupleState.coupleId, coupleId))
    .limit(1);
  const seed = Number(row?.seed ?? 0);
  return {
    enabled: seed !== 0,
    seed,
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

export async function GET() {
  const member = await readMember();
  if (!member) return unauthorized();
  return Response.json(await getState(member.coupleId));
}

export async function POST(request: Request) {
  const member = await readMember();
  if (!member) return unauthorized();

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

  await db
    .insert(schema.coupleState)
    .values({ coupleId: member.coupleId, shuffleSeed: newSeed })
    .onConflictDoUpdate({
      target: schema.coupleState.coupleId,
      set: { shuffleSeed: newSeed, shuffleUpdatedAt: new Date() },
    });

  return Response.json(await getState(member.coupleId));
}
