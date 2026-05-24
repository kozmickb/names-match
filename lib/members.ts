import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export type Member = {
  id: string;
  coupleId: string;
  role: string; // 'a' | 'b'
  displayName: string;
  emoji: string;
  legacySlug: string | null;
};

const memberColumns = {
  id: schema.members.id,
  coupleId: schema.members.coupleId,
  role: schema.members.role,
  displayName: schema.members.displayName,
  emoji: schema.members.emoji,
  legacySlug: schema.members.legacySlug,
};

/** The two members of a couple, ordered by role ('a' then 'b'). */
export async function getCoupleMembers(coupleId: string): Promise<Member[]> {
  return db
    .select(memberColumns)
    .from(schema.members)
    .where(eq(schema.members.coupleId, coupleId))
    .orderBy(schema.members.role);
}

/** The other member of the same couple, given one member's id. */
export function otherMember(members: Member[], memberId: string): Member | undefined {
  return members.find((m) => m.id !== memberId);
}

/** Look up a seed-couple member by its legacy slug (Phase A bridge). */
export async function memberByLegacySlug(slug: string): Promise<Member | null> {
  const [m] = await db
    .select(memberColumns)
    .from(schema.members)
    .where(eq(schema.members.legacySlug, slug))
    .limit(1);
  return m ?? null;
}
