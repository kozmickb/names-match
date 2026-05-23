import { config } from "dotenv";
config({ path: ".env.local" });
config();

import postgres from "postgres";
import { originGroup } from "../lib/origin-groups";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const sql = postgres(dbUrl, { ssl: "require" });

  try {
    const rows = (await sql`select id, origin from names`) as unknown as Array<{
      id: number;
      origin: string | null;
    }>;
    console.log(`names: ${rows.length}`);

    // Bucket ids by computed group, then one bulk update per group.
    const byGroup = new Map<string, number[]>();
    for (const r of rows) {
      const g = originGroup(r.origin);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(Number(r.id));
    }

    for (const [g, ids] of byGroup) {
      for (let i = 0; i < ids.length; i += 2000) {
        const chunk = ids.slice(i, i + 2000);
        await sql`update names set origin_group = ${g} where id = any(${chunk})`;
      }
    }

    const dist = (await sql`
      select origin_group, count(*)::int c from names group by 1 order by 2 desc
    `) as unknown as Array<{ origin_group: string | null; c: number }>;
    console.log("group distribution:");
    for (const d of dist) console.log("  " + (d.origin_group ?? "(null)").padEnd(16), d.c);
    console.log("done.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
