import { db, schema } from "@/db/client";
import { readMember, unauthorized } from "@/lib/api";
import { getCoupleMembers, otherMember } from "@/lib/members";
import { sendPushTo } from "@/lib/push";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await readMember();
  if (!member) return unauthorized();

  let body: { nameId?: unknown; decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const nameId = Number(body.nameId);
  const decision = body.decision;
  if (!Number.isInteger(nameId) || nameId <= 0) {
    return Response.json({ error: "invalid nameId" }, { status: 400 });
  }
  if (decision !== "like" && decision !== "pass") {
    return Response.json({ error: "invalid decision" }, { status: 400 });
  }

  await db
    .insert(schema.swipes)
    .values({ memberId: member.id, nameId, decision })
    .onConflictDoNothing({ target: [schema.swipes.memberId, schema.swipes.nameId] });

  if (decision !== "like") {
    return Response.json({ isMatch: false });
  }

  const members = await getCoupleMembers(member.coupleId);
  const partner = otherMember(members, member.id);
  if (!partner) return Response.json({ isMatch: false });

  const partnerLike = await db
    .select({ id: schema.swipes.id })
    .from(schema.swipes)
    .where(
      and(
        eq(schema.swipes.memberId, partner.id),
        eq(schema.swipes.nameId, nameId),
        eq(schema.swipes.decision, "like")
      )
    )
    .limit(1);

  if (partnerLike.length === 0) {
    return Response.json({ isMatch: false });
  }

  const [nameRow] = await db
    .select({ id: schema.names.id, name: schema.names.name })
    .from(schema.names)
    .where(eq(schema.names.id, nameId))
    .limit(1);

  const matchedName = nameRow ?? { id: nameId, name: "" };

  void sendPushTo(partner.id, {
    title: "It's a match!",
    body: `${member.displayName} also liked ${matchedName.name}.`,
    url: "/matches",
    tag: `match-${matchedName.id}`,
  }).catch(() => {});

  return Response.json({ isMatch: true, name: matchedName });
}
