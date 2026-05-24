import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { and, eq, sql } from "drizzle-orm";
import { getCoupleMembers, otherMember } from "@/lib/members";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await readMember();
  if (!member) return unauthorized();

  const [{ totalNames }] = await db
    .select({ totalNames: sql<number>`count(*)::int` })
    .from(schema.names);

  const [{ swipedByMe }] = await db
    .select({ swipedByMe: sql<number>`count(*)::int` })
    .from(schema.swipes)
    .where(eq(schema.swipes.memberId, member.id));

  const [{ likedByMe }] = await db
    .select({ likedByMe: sql<number>`count(*)::int` })
    .from(schema.swipes)
    .where(and(eq(schema.swipes.memberId, member.id), eq(schema.swipes.decision, "like")));

  const members = await getCoupleMembers(member.coupleId);
  const partner = otherMember(members, member.id);
  let totalMatches = 0;
  if (partner) {
    const matchRows = (await db.execute<{ total_matches: number }>(sql`
      select count(*)::int as total_matches
      from swipes s1
      join swipes s2 on s1.name_id = s2.name_id
      where s1.member_id = ${member.id} and s1.decision = 'like'
        and s2.member_id = ${partner.id} and s2.decision = 'like'
    `)) as unknown as Array<{ total_matches: number }>;
    totalMatches = matchRows[0]?.total_matches ?? 0;
  }

  return Response.json({ totalNames, swipedByMe, likedByMe, totalMatches });
}
