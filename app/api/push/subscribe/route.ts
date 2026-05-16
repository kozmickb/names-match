import { db, schema } from "@/db/client";
import { readUserSlug, unauthorized } from "@/lib/api";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(req: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }

  await db
    .insert(schema.pushSubscriptions)
    .values({ userSlug: slug, endpoint, p256dh, auth })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userSlug: slug, p256dh, auth, createdAt: sql`now()` },
    });

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  let endpoint: string | null = null;
  try {
    const b = (await req.json()) as { endpoint?: string };
    endpoint = b.endpoint ?? null;
  } catch {}

  if (endpoint) {
    await db
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  } else {
    await db
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.userSlug, slug));
  }

  return Response.json({ ok: true });
}
