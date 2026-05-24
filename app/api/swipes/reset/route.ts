import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  const member = await readMember();
  if (!member) return unauthorized();

  await db.delete(schema.swipes).where(eq(schema.swipes.memberId, member.id));
  return Response.json({ ok: true });
}
