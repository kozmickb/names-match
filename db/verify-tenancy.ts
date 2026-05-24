import { config } from "dotenv";
config({ path: ".env.local" });
config();
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function counts() {
  const [swipes] = await sql`select count(*)::int as c from swipes`;
  const [votes] = await sql`select count(*)::int as c from tournament_votes`;
  const [profiles] = await sql`select count(*)::int as c from user_profiles`;
  const [ai] = await sql`select count(*)::int as c from ai_calls`;
  const [push] = await sql`select count(*)::int as c from push_subscriptions`;
  // Mutual matches today (the number the couple actually sees). After the
  // Contract migration drops user_slug, swap this to the member-based join.
  const [matches] = await sql`
    select count(*)::int as c from names n
    join swipes sk on sk.name_id = n.id and sk.user_slug = 'karo' and sk.decision = 'like'
    join swipes sl on sl.name_id = n.id and sl.user_slug = 'lucy' and sl.decision = 'like'
  `;
  return {
    swipes: swipes.c,
    votes: votes.c,
    profiles: profiles.c,
    ai: ai.c,
    push: push.c,
    matches: matches.c,
  };
}

async function main() {
  const mode = process.argv[2]; // "baseline" | "check"
  const current = await counts();
  console.log(mode === "baseline" ? "BASELINE" : "CURRENT", JSON.stringify(current));
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
