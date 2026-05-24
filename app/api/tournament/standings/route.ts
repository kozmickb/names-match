import { readMember, unauthorized } from "@/lib/api";
import { computeStandings } from "@/lib/standings";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await readMember();
  if (!member) return unauthorized();

  const { boys, girls } = await computeStandings(member.coupleId);
  return Response.json({ boys, girls });
}
