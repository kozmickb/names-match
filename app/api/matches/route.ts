import { db } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { getCoupleMembers } from "@/lib/members";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await readMember();
  if (!member) return unauthorized();
  const members = await getCoupleMembers(member.coupleId);
  const a = members[0];
  const b = members[1];
  if (!a || !b) return Response.json({ matches: [] });

  // sa = member a's swipe, sb = member b's swipe. "my"/"partner" is resolved
  // relative to the requesting member.
  const meIsA = member.id === a.id;
  const rows = (await db.execute<{
    id: number;
    name: string;
    matched_at: string | Date;
    my_favourite: boolean;
    partner_favourite: boolean;
    my_note: string | null;
    partner_note: string | null;
  }>(sql`
    select
      n.id,
      n.name,
      greatest(sa.created_at, sb.created_at) as matched_at,
      case when ${meIsA} then sa.favourite else sb.favourite end as my_favourite,
      case when ${meIsA} then sb.favourite else sa.favourite end as partner_favourite,
      case when ${meIsA} then sa.note else sb.note end as my_note,
      case when ${meIsA} then sb.note else sa.note end as partner_note
    from names n
    join swipes sa on sa.name_id = n.id and sa.member_id = ${a.id} and sa.decision = 'like'
    join swipes sb on sb.name_id = n.id and sb.member_id = ${b.id} and sb.decision = 'like'
    order by
      (case when ${meIsA} then sa.favourite else sb.favourite end) desc,
      matched_at desc
  `)) as unknown as Array<{
    id: number;
    name: string;
    matched_at: string | Date;
    my_favourite: boolean;
    partner_favourite: boolean;
    my_note: string | null;
    partner_note: string | null;
  }>;

  const matches = rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    matchedAt: new Date(r.matched_at).toISOString(),
    myFavourite: !!r.my_favourite,
    partnerFavourite: !!r.partner_favourite,
    myNote: r.my_note ?? null,
    partnerNote: r.partner_note ?? null,
  }));

  return Response.json({ matches });
}
