import { config } from "dotenv";
config({ path: ".env.local" });
config({ quiet: true });
import postgres from "postgres";

// Phase A "migrate": backfill Karo & Lucy into a single seed couple and set
// member_id on every per-person row from user_slug. Idempotent — re-running
// after the seed couple exists is a no-op. Never drops or rewrites user_slug.
const SEED = {
  name: "Bonas",
  members: [
    { role: "a", legacySlug: "karo", displayName: "Karo", emoji: "🧔🏻" },
    { role: "b", legacySlug: "lucy", displayName: "Lucy", emoji: "👩🏼" },
  ],
};

function makeInviteCode(): string {
  return "BONAS-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql.begin(async (tx) => {
    const existing = await tx`select id from members where legacy_slug is not null limit 1`;
    if (existing.length > 0) {
      console.log("Seed couple already present — skipping backfill.");
      return;
    }

    // 1. Couple.
    const [couple] = await tx`
      insert into couples (name, invite_code) values (${SEED.name}, ${makeInviteCode()})
      returning id`;
    const coupleId = couple.id as string;

    // 2. Members — carry over emoji from user_profiles if present.
    const slugToMemberId = new Map<string, string>();
    for (const m of SEED.members) {
      const [prof] = await tx`select emoji from user_profiles where user_slug = ${m.legacySlug}`;
      const emoji = (prof?.emoji as string) ?? m.emoji;
      const [member] = await tx`
        insert into members (couple_id, role, display_name, emoji, legacy_slug)
        values (${coupleId}, ${m.role}, ${m.displayName}, ${emoji}, ${m.legacySlug})
        returning id`;
      slugToMemberId.set(m.legacySlug, member.id as string);
    }

    // 3. Backfill member_id on every per-person table from user_slug.
    for (const [slug, memberId] of slugToMemberId) {
      await tx`update swipes set member_id = ${memberId} where user_slug = ${slug}`;
      await tx`update tournament_votes set member_id = ${memberId} where user_slug = ${slug}`;
      await tx`update ai_calls set member_id = ${memberId} where user_slug = ${slug}`;
      await tx`update push_subscriptions set member_id = ${memberId} where user_slug = ${slug}`;
      await tx`update user_profiles set member_id = ${memberId} where user_slug = ${slug}`;
    }

    // 4. couple_state from the single app_state row (id=1), if any.
    const [appState] = await tx`select shuffle_seed, excluded_origin_groups from app_state where id = 1`;
    await tx`
      insert into couple_state (couple_id, shuffle_seed, excluded_origin_groups)
      values (
        ${coupleId},
        ${(appState?.shuffle_seed as number) ?? 0},
        ${sql.json((appState?.excluded_origin_groups as string[]) ?? [])}
      )`;

    // 5. Attach existing knockouts to the couple.
    await tx`update knockouts set couple_id = ${coupleId} where couple_id is null`;

    console.log("Backfill complete. coupleId = " + coupleId);
  });
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
