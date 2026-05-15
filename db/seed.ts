import { config } from "dotenv";
config({ path: ".env.local" });
config();
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const raw = readFileSync(resolve(process.cwd(), "db/names-seed.json"), "utf8");
  const names = JSON.parse(raw) as string[];
  if (!Array.isArray(names)) throw new Error("names-seed.json must be a JSON array of strings");

  const sql = postgres(url, { max: 1 });
  console.log(`Seeding ${names.length} names...`);

  const chunkSize = 200;
  let inserted = 0;
  for (let i = 0; i < names.length; i += chunkSize) {
    const chunk = names.slice(i, i + chunkSize).map((n) => ({ name: n }));
    const res = await sql`
      insert into names ${sql(chunk, "name")}
      on conflict (name) do nothing
      returning id
    `;
    inserted += res.length;
  }

  const [{ count }] = await sql<{ count: string }[]>`select count(*)::text as count from names`;
  console.log(`Inserted ${inserted} new rows. Total rows in names table: ${count}.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
