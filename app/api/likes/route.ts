import { db } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { getCoupleMembers, otherMember } from "@/lib/members";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await readMember();
  if (!member) return unauthorized();

  const members = await getCoupleMembers(member.coupleId);
  const partner = otherMember(members, member.id);
  if (!partner) return Response.json({ mine: [], awaitingMe: [] });

  const myLikes = (await db.execute<{ id: number; name: string; liked_at: string | Date }>(sql`
    select n.id, n.name, s.created_at as liked_at
    from swipes s
    join names n on n.id = s.name_id
    where s.member_id = ${member.id} and s.decision = 'like'
      and not exists (
        select 1 from swipes p
        where p.member_id = ${partner.id} and p.name_id = n.id and p.decision = 'like'
      )
    order by s.created_at desc
  `)) as unknown as Array<{ id: number; name: string; liked_at: string | Date }>;

  const partnerPending = (await db.execute<{ id: number; name: string; liked_at: string | Date }>(sql`
    select n.id, n.name, s.created_at as liked_at
    from swipes s
    join names n on n.id = s.name_id
    where s.member_id = ${partner.id} and s.decision = 'like'
      and not exists (
        select 1 from swipes me
        where me.member_id = ${member.id} and me.name_id = n.id
      )
    order by s.created_at desc
  `)) as unknown as Array<{ id: number; name: string; liked_at: string | Date }>;

  return Response.json({
    mine: myLikes.map((r) => ({
      id: Number(r.id),
      name: r.name,
      likedAt: new Date(r.liked_at).toISOString(),
    })),
    awaitingMe: partnerPending.map((r) => ({
      id: Number(r.id),
      name: r.name,
      likedAt: new Date(r.liked_at).toISOString(),
    })),
  });
}
