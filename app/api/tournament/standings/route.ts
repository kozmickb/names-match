import { readUserSlug, unauthorized } from "@/lib/api";
import { computeStandings } from "@/lib/standings";

export const dynamic = "force-dynamic";

export async function GET() {
  const slug = await readUserSlug();
  if (!slug) return unauthorized();

  const { boys, girls } = await computeStandings();
  return Response.json({ boys, girls });
}
