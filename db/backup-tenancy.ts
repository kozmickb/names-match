import { config } from "dotenv";
config({ path: ".env.local" });
config();
import postgres from "postgres";
import { writeFileSync } from "node:fs";

// Logical backup of every table the tenancy refactor touches. pg_dump is not
// available locally and the DB is on Railway, so we dump rows to JSON via the
// same driver the app uses. The output file is git-ignored (contains user data).
const TABLES = [
  "swipes",
  "tournament_votes",
  "user_profiles",
  "ai_calls",
  "push_subscriptions",
  "app_state",
  "knockouts",
  "knockout_matches",
];

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows = await sql.unsafe(`select * from ${t}`);
    dump[t] = rows;
    console.log(`${t}: ${rows.length} rows`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = `backup-pre-tenancy-${stamp}.json`;
  writeFileSync(file, JSON.stringify(dump, null, 2), "utf8");
  console.log(`\nWrote ${file}`);
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
