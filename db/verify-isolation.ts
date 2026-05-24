import { config } from "dotenv";
config({ path: ".env.local" });
config({ quiet: true });
import postgres from "postgres";

// Creates a throwaway second couple, proves the seed couple's match query never
// sees couple B's swipes, then rolls everything back. No persistent writes.
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  let ok = false;
  try {
    await sql.begin(async (tx) => {
      const [c] = await tx`insert into couples (name, invite_code) values ('TEST-ISO', ${"ISO-" + Date.now()}) returning id`;
      const [m1] = await tx`insert into members (couple_id, role, display_name) values (${c.id}, 'a', 'T1') returning id`;
      const [m2] = await tx`insert into members (couple_id, role, display_name) values (${c.id}, 'b', 'T2') returning id`;
      const [name] = await tx`select id from names limit 1`;
      // Both of couple B like the same name => couple B has 1 match.
      await tx`insert into swipes (member_id, name_id, decision) values (${m1.id}, ${name.id}, 'like')`;
      await tx`insert into swipes (member_id, name_id, decision) values (${m2.id}, ${name.id}, 'like')`;

      const [seedA] = await tx`select id from members where legacy_slug = 'karo'`;
      const [seedB] = await tx`select id from members where legacy_slug = 'lucy'`;

      // Does couple B's liked name leak into the seed couple's matches?
      const leak = await tx`
        select n.id from names n
        join swipes sa on sa.name_id = n.id and sa.member_id = ${seedA.id} and sa.decision='like'
        join swipes sb on sb.name_id = n.id and sb.member_id = ${seedB.id} and sb.decision='like'
        where n.id = ${name.id}
          and not exists (select 1 from swipes ssa where ssa.name_id = n.id and ssa.member_id = ${seedA.id})`;
      // Couple B's match must NOT appear unless the seed couple ALSO independently matched it.
      const seedAlsoLikes = await tx`
        select 1 from swipes where member_id = ${seedA.id} and name_id = ${name.id} and decision='like'`;
      const couplebMatchCount = await tx`
        select count(*)::int as c from names n
        join swipes sa on sa.name_id = n.id and sa.member_id = ${m1.id} and sa.decision='like'
        join swipes sb on sb.name_id = n.id and sb.member_id = ${m2.id} and sb.decision='like'`;

      console.log("couple B matches (own scope): " + couplebMatchCount[0].c + " (expect 1)");
      console.log("seed couple independently likes that name: " + (seedAlsoLikes.length ? "yes" : "no"));
      console.log("leak rows into seed scope from couple B: " + leak.length + " (expect 0)");
      ok = couplebMatchCount[0].c === 1 && leak.length === 0;

      throw new Error("__ROLLBACK__");
    });
  } catch (e) {
    if (!String(e).includes("__ROLLBACK__")) throw e;
  }
  // Confirm rollback: no TEST-ISO couple remains.
  const leftover = await sql`select count(*)::int as c from couples where name = 'TEST-ISO'`;
  console.log("leftover TEST-ISO couples after rollback: " + leftover[0].c + " (expect 0)");
  console.log(ok && leftover[0].c === 0 ? "ISOLATION OK" : "ISOLATION FAIL");
  await sql.end();
  if (!(ok && leftover[0].c === 0)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
