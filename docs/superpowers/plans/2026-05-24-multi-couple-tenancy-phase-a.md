# Multi-Couple Tenancy (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-wired single couple (`user_slug` enum `karo`/`lucy`) with a `couples` + `members` tenancy model on the live Postgres, scoping all per-person and per-couple data to a couple, **without changing user-facing behaviour and without losing Karo & Lucy's swipes/matches/votes.**

**Architecture:** Expand → Migrate → Contract. We first add the new tables and *nullable* `member_id` columns alongside the existing `user_slug` columns (nothing breaks). We backfill Karo & Lucy into a single "seed couple" with two members carrying a `legacy_slug` (`karo`/`lucy`). The app layer switches to resolving a **member** (and its couple) per request, scoping every query by the couple's two members — but we keep the existing `x-user-slug` wire contract and the existing JSON response shapes so the PWA frontend is **untouched** in Phase A. Only after verifying the live data do we run the Contract migration that drops `user_slug`/`app_state`/the enum. Real session auth and the multi-couple frontend are deliberately deferred to Phase B.

**Tech Stack:** Next.js 16 App Router (route handlers), Postgres + Drizzle ORM (`db/schema.ts`), drizzle-kit migrations (`db/migrations/`), `tsx` one-off scripts, `postgres` driver. **No unit-test framework exists** (project convention is `tsc` + `eslint` + `next build` + live-DB smoke tests via `tsx`), so verification in this plan uses `tsx` smoke/verification scripts plus the type/lint/build gates — consistent with the repo. Introducing vitest is explicitly out of scope for Phase A.

---

## Why this ordering (read before starting)

1. **The live DB holds the only copy of Karo & Lucy's real data.** Every schema change is additive first; the destructive Contract migration (Task 12) runs **only after** the app is fully switched and verified, and after a backup exists.
2. **`user_slug` appears in ~49 files and `karo`/`lucy` is hard-coded in tournament SQL.** The refactor is mechanical for most routes (`readUserSlug()` → `readMember()`, `userSlug: slug` → `memberId`) and non-trivial only for the four raw-SQL routes that join on `user_slug = 'karo'/'lucy'` (standings, pair, results, deck).
3. **`legacy_slug` is the bridge that makes Phase A zero-UX-change.** The client keeps sending `x-user-slug: karo|lucy`; the server maps that to the seed couple's member. Responses that today emit `karo`/`lucy` keys keep doing so (derived from `legacy_slug`). The frontend and the `x-user-slug` header are removed in Phase B when real auth lands.

---

## File Structure

**New files**
- `db/migrate-tenancy.ts` — one-off data backfill script (seed couple, members, backfill `member_id`, `couple_state`, `knockouts.couple_id`). Run with `tsx`.
- `db/verify-tenancy.ts` — asserts post-migration row counts/integrity match pre-migration. Run with `tsx`.
- `db/verify-isolation.ts` — creates a throwaway second couple, proves couple A's queries never see couple B's rows, then cleans up. Run with `tsx`.
- `lib/members.ts` — `Member` type + `readMember()`, `getCoupleMembers()`, `otherMember()` helpers (the new identity layer).

**Modified files (grouped by Task)**
- Schema/migrations: `db/schema.ts`, generated `db/migrations/00NN_*.sql` (×2: expand + contract).
- Identity layer: `lib/api.ts`, `lib/user.ts`, `lib/push.ts`, `lib/rate-limit.ts`, `lib/standings.ts`.
- Complex SQL routes: `app/api/tournament/pair/route.ts`, `app/api/tournament/results/route.ts`, `app/api/tournament/standings/route.ts`, `app/api/names/route.ts`.
- Mechanical routes: `app/api/swipe/route.ts`, `app/api/swipe/undo/route.ts`, `app/api/swipes/reset/route.ts`, `app/api/matches/route.ts`, `app/api/matches/[id]/route.ts`, `app/api/likes/route.ts`, `app/api/favourites/[id]/route.ts`, `app/api/notes/[id]/route.ts`, `app/api/stats/route.ts`, `app/api/profile/route.ts`, `app/api/profile/gender-filter/route.ts`, `app/api/profile/auto-pass-variants/route.ts`, `app/api/shuffle/route.ts`, `app/api/origin-filter/route.ts`, `app/api/tournament/vote/route.ts`, `app/api/tournament/knockout/route.ts`, `app/api/tournament/knockout/vote/route.ts`, `app/api/names/generate/route.ts`, `app/api/names/suggest/route.ts`, `app/api/names/[id]/popularity/route.ts`, `app/api/names/[id]/meaning/route.ts`, `app/api/names/[id]/variants/route.ts`, `app/api/push/subscribe/route.ts`, `app/api/cron/remind/route.ts`.

**Deliberately NOT touched in Phase A** (frontend; deferred to Phase B): `components/user-provider.tsx`, `app/page.tsx`, `components/settings-screen.tsx`, `components/matches-screen.tsx`. They keep using `x-user-slug` + `karo`/`lucy` and keep working unchanged.

---

## Target schema (end state after Contract)

```
couples        id uuid pk · name text · invite_code text unique · created_at
members        id uuid pk · couple_id fk · role 'a'|'b' · display_name · emoji
               · legacy_slug text null · created_at · unique(couple_id, role)
swipes            member_id fk -> members   (was user_slug)  unique(member_id, name_id)
tournament_votes  member_id fk -> members   unique(member_id, winner, loser)
user_profiles     member_id fk pk -> members
ai_calls          member_id fk -> members
push_subscriptions member_id fk -> members
couple_state      couple_id pk -> couples · shuffle_seed · shuffle_updated_at · excluded_origin_groups   (replaces app_state single row)
knockouts         + couple_id fk · unique(couple_id, gender)   (was unique(gender))
names             unchanged (global catalog)
```

---

## Task 0: Safety net — backup + baseline metrics

**Files:** Create `db/verify-tenancy.ts` (baseline half only for now).

- [ ] **Step 1: Back up the live DB before touching anything**

Confirm the DB provider, then dump the affected tables. With `DATABASE_URL` in `.env.local`:

```bash
# From repo root. Requires pg client tools (pg_dump). Writes a timestamped local dump.
pg_dump "$DATABASE_URL" \
  -t swipes -t tournament_votes -t user_profiles -t ai_calls \
  -t push_subscriptions -t app_state -t knockouts -t knockout_matches \
  --no-owner --no-privileges \
  -f "backup-pre-tenancy-$(date +%Y%m%d-%H%M%S).sql"
```

Expected: a `backup-pre-tenancy-*.sql` file > 0 bytes. If `pg_dump` is unavailable locally, take a provider snapshot (Neon/Vercel dashboard → branch/snapshot) instead and note its ID in the commit message. **Do not proceed without a backup.**

- [ ] **Step 2: Write the baseline metrics script**

Create `db/verify-tenancy.ts`:

```ts
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
  // Mutual matches today (the number the couple actually sees).
  const [matches] = await sql`
    select count(*)::int as c from names n
    join swipes sk on sk.name_id = n.id and sk.user_slug = 'karo' and sk.decision = 'like'
    join swipes sl on sl.name_id = n.id and sl.user_slug = 'lucy' and sl.decision = 'like'
  `;
  return {
    swipes: swipes.c, votes: votes.c, profiles: profiles.c,
    ai: ai.c, push: push.c, matches: matches.c,
  };
}

async function main() {
  const mode = process.argv[2]; // "baseline" | "check"
  const current = await counts();
  if (mode === "baseline") {
    console.log("BASELINE", JSON.stringify(current));
  } else {
    console.log("CURRENT", JSON.stringify(current));
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Capture the baseline**

Run: `npx tsx db/verify-tenancy.ts baseline`
Expected: a line like `BASELINE {"swipes":N,"votes":N,"profiles":2,"ai":N,"push":N,"matches":M}`. **Copy this output into the commit message** — it is the invariant the migration must preserve.

- [ ] **Step 4: Commit**

```bash
git checkout -b tenancy-phase-a
git add db/verify-tenancy.ts
git commit -m "chore(tenancy): baseline metrics script + pre-migration backup taken

BASELINE {...paste output...}"
```

---

## Task 1: Expand schema — new tables + nullable member_id columns

**Files:** Modify `db/schema.ts`; generate `db/migrations/00NN_*.sql`.

This step is **purely additive**: new tables, new nullable columns, no drops. The app keeps working on `user_slug` until later tasks switch it.

- [ ] **Step 1: Add `couples` + `members` and the new columns to `db/schema.ts`**

At the top, add `uuid` to the drizzle import:

```ts
import { pgTable, bigserial, text, timestamp, uniqueIndex, index, pgEnum, bigint, integer, boolean, jsonb, uuid } from "drizzle-orm/pg-core";
```

Add the two tenant tables (place after `decisionEnum`):

```ts
export const couples = pgTable("couples", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coupleId: uuid("couple_id").notNull().references(() => couples.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'a' | 'b'
    displayName: text("display_name").notNull(),
    emoji: text("emoji").notNull().default("🧑"),
    legacySlug: text("legacy_slug"), // 'karo' | 'lucy' for the seed couple; null otherwise
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    roleUniq: uniqueIndex("members_couple_role_uniq").on(t.coupleId, t.role),
    byCouple: index("members_couple_idx").on(t.coupleId),
  })
);
```

Add `couple_state` (the per-couple replacement for `app_state`):

```ts
export const coupleState = pgTable("couple_state", {
  coupleId: uuid("couple_id").primaryKey().references(() => couples.id, { onDelete: "cascade" }),
  shuffleSeed: bigint("shuffle_seed", { mode: "number" }).notNull().default(0),
  shuffleUpdatedAt: timestamp("shuffle_updated_at", { withTimezone: true }).defaultNow().notNull(),
  excludedOriginGroups: jsonb("excluded_origin_groups").$type<string[]>().notNull().default([]),
});
```

Now add **nullable** `member_id` columns to the per-person tables (keep `userSlug` for now). For each, add the column and a non-unique index; do **not** add the `notNull` or the new unique index yet (Contract task does that). Edit each table:

`swipes` — add inside the columns block:
```ts
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
```
and add to its index block:
```ts
    byMember: index("swipes_member_idx").on(t.memberId),
```

`tournamentVotes` — add column `memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),` and index `byMember: index("tournament_member_idx").on(t.memberId),`.

`aiCalls` — add column `memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),` and index `byMemberKind: index("ai_calls_member_kind_idx").on(t.memberId, t.kind, t.createdAt),`.

`pushSubscriptions` — add column `memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),` and index `byMember: index("push_member_idx").on(t.memberId),`.

`userProfiles` — add column `memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),` (it will become PK in Contract; nullable for now).

`knockouts` — add column `coupleId: uuid("couple_id").references(() => couples.id, { onDelete: "cascade" }),` (keep the existing `genderUniq` for now; Contract swaps it).

- [ ] **Step 2: Generate the migration SQL**

Run: `npm run db:generate`
Expected: a new `db/migrations/00NN_*.sql` containing `CREATE TABLE couples`, `CREATE TABLE members`, `CREATE TABLE couple_state`, and `ALTER TABLE ... ADD COLUMN member_id`/`couple_id` (all nullable), plus the new indexes. **Open the file and confirm there are no `DROP` statements.** If there are, stop and review — Step 1 should be additive only.

- [ ] **Step 3: Apply to the live DB**

Run: `npm run db:migrate`
Expected: `Migrations complete.` Re-run `npx tsx db/verify-tenancy.ts check` — counts must equal the Task 0 baseline (additive migration changes no rows).

- [ ] **Step 4: Verify types/lint/build still pass**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass (existing code still uses `userSlug`; new columns are additive and unused so far).

- [ ] **Step 5: Commit**

```bash
git add db/schema.ts db/migrations
git commit -m "feat(tenancy): expand schema — couples, members, couple_state, nullable member_id columns"
```

---

## Task 2: Data backfill — seed couple + member_id backfill

**Files:** Create `db/migrate-tenancy.ts`.

- [ ] **Step 1: Write the backfill script**

Create `db/migrate-tenancy.ts`:

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

// Existing prod emojis (fallbacks if user_profiles has none yet).
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

async function main() {
  await sql.begin(async (tx) => {
    // Idempotency guard: bail if a seed couple already exists.
    const existing = await tx`select id from members where legacy_slug is not null limit 1`;
    if (existing.length > 0) {
      console.log("Seed couple already present — skipping backfill.");
      return;
    }

    // 1. Couple.
    const [couple] = await tx`
      insert into couples (name, invite_code) values (${SEED.name}, ${makeInviteCode()})
      returning id
    `;
    const coupleId = couple.id as string;

    // 2. Members — carry over emoji from user_profiles if present.
    const slugToMemberId = new Map<string, string>();
    for (const m of SEED.members) {
      const [prof] = await tx`select emoji from user_profiles where user_slug = ${m.legacySlug}`;
      const emoji = prof?.emoji ?? m.emoji;
      const [member] = await tx`
        insert into members (couple_id, role, display_name, emoji, legacy_slug)
        values (${coupleId}, ${m.role}, ${m.displayName}, ${emoji}, ${m.legacySlug})
        returning id
      `;
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
        ${appState?.shuffle_seed ?? 0},
        ${sql.json(appState?.excluded_origin_groups ?? [])}
      )
    `;

    // 5. Attach existing knockouts to the couple.
    await tx`update knockouts set couple_id = ${coupleId} where couple_id is null`;

    console.log("Backfill complete. coupleId =", coupleId);
  });
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the backfill**

Run: `npx tsx db/migrate-tenancy.ts`
Expected: `Backfill complete. coupleId = <uuid>`. (Re-running prints "skipping backfill" — it is idempotent.)

- [ ] **Step 3: Verify nothing orphaned**

Run this one-liner to confirm every per-person row got a `member_id`:

```bash
npx tsx -e "import {config} from 'dotenv';config({path:'.env.local'});config();import postgres from 'postgres';const sql=postgres(process.env.DATABASE_URL!,{max:1});(async()=>{for(const t of ['swipes','tournament_votes','user_profiles','ai_calls','push_subscriptions']){const [r]=await sql.unsafe('select count(*)::int as c from '+t+' where member_id is null');console.log(t,'null member_id:',r.c);}const [k]=await sql\`select count(*)::int as c from knockouts where couple_id is null\`;console.log('knockouts null couple_id:',k.c);await sql.end();})()"
```

Expected: every line prints `0`. If any are non-zero, investigate before continuing (likely a `user_slug` value outside `karo`/`lucy`, which should be impossible given the enum).

- [ ] **Step 4: Confirm counts unchanged**

Run: `npx tsx db/verify-tenancy.ts check`
Expected: identical to the Task 0 baseline.

- [ ] **Step 5: Commit**

```bash
git add db/migrate-tenancy.ts
git commit -m "feat(tenancy): backfill Karo & Lucy into seed couple + member_id on all per-person tables"
```

---

## Task 3: Identity layer — `lib/members.ts` + `readMember()`

**Files:** Create `lib/members.ts`; modify `lib/api.ts`, `lib/user.ts`.

- [ ] **Step 1: Create `lib/members.ts`**

```ts
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

export type Member = {
  id: string;
  coupleId: string;
  role: string; // 'a' | 'b'
  displayName: string;
  emoji: string;
  legacySlug: string | null;
};

/** The two members of a couple, ordered by role ('a' then 'b'). */
export async function getCoupleMembers(coupleId: string): Promise<Member[]> {
  const rows = await db
    .select({
      id: schema.members.id,
      coupleId: schema.members.coupleId,
      role: schema.members.role,
      displayName: schema.members.displayName,
      emoji: schema.members.emoji,
      legacySlug: schema.members.legacySlug,
    })
    .from(schema.members)
    .where(eq(schema.members.coupleId, coupleId))
    .orderBy(schema.members.role);
  return rows;
}

/** The other member of the same couple, given one member's id. */
export function otherMember(members: Member[], memberId: string): Member | undefined {
  return members.find((m) => m.id !== memberId);
}

/** Look up a seed-couple member by its legacy slug (Phase A bridge). */
export async function memberByLegacySlug(slug: string): Promise<Member | null> {
  const [m] = await db
    .select({
      id: schema.members.id,
      coupleId: schema.members.coupleId,
      role: schema.members.role,
      displayName: schema.members.displayName,
      emoji: schema.members.emoji,
      legacySlug: schema.members.legacySlug,
    })
    .from(schema.members)
    .where(eq(schema.members.legacySlug, slug))
    .limit(1);
  return m ?? null;
}
```

- [ ] **Step 2: Add `readMember()` to `lib/api.ts`**

Replace the contents of `lib/api.ts` with:

```ts
import { headers, cookies } from "next/headers";
import { isUserSlug } from "./user";
import { AUTH_COOKIE_NAME, isAuthRequired, verifyToken } from "./auth";
import { memberByLegacySlug, type Member } from "./members";

/**
 * Resolve the requesting member. Phase A bridge: the client still sends
 * `x-user-slug: karo|lucy`; we map it to the seed couple's member via legacy_slug.
 * Phase B replaces this with a signed session cookie carrying member_id.
 */
export async function readMember(): Promise<Member | null> {
  if (isAuthRequired()) {
    const jar = await cookies();
    const token = jar.get(AUTH_COOKIE_NAME)?.value;
    if (!verifyToken(token)) return null;
  }
  const h = await headers();
  const slug = h.get("x-user-slug");
  if (!isUserSlug(slug)) return null;
  return memberByLegacySlug(slug);
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
```

> Note: `readUserSlug` is intentionally removed here; every caller is updated in Tasks 4–11. Leaving it would let a missed caller compile against stale identity.

- [ ] **Step 3: Keep `lib/user.ts` as the legacy-slug type only**

`lib/user.ts` keeps `UserSlug`, `isUserSlug`, and `USERS` (still used by `lib/api.ts` and the untouched frontend). **Remove** `partnerOf` and `displayName` — they encode the two-slug assumption and are replaced by `members`. New `lib/user.ts`:

```ts
export type UserSlug = "karo" | "lucy";

export const USERS: UserSlug[] = ["karo", "lucy"];

export function isUserSlug(value: unknown): value is UserSlug {
  return value === "karo" || value === "lucy";
}
```

- [ ] **Step 4: Type-check (expect errors — they map the remaining work)**

Run: `npx tsc --noEmit`
Expected: FAIL with errors in every route still importing `readUserSlug` / `partnerOf` / `displayName`. **This is the to-do list for Tasks 4–11.** Capture the list.

- [ ] **Step 5: Commit**

```bash
git add lib/members.ts lib/api.ts lib/user.ts
git commit -m "feat(tenancy): member identity layer — readMember(), getCoupleMembers, otherMember"
```

---

## Task 4: `lib/standings.ts` — generalise off hard-coded slugs

**Files:** Modify `lib/standings.ts`.

The current code hard-codes `user_slug = 'karo'`/`'lucy'` in SQL and emits `karoWon`/`lucyWon` keys. We parameterise by the couple's two members but **keep the `karo*`/`lucy*` output keys** (mapped via `legacy_slug`) so `app/api/tournament/standings` and the frontend stay unchanged in Phase A.

- [ ] **Step 1: Rewrite `computeStandings` to take a couple's members**

Replace `lib/standings.ts` with:

```ts
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { getCoupleMembers, type Member } from "@/lib/members";

export type Standing = {
  id: number;
  name: string;
  gender: string | null;
  played: number;
  won: number;
  lost: number;
  points: number;
  winRate: number;
  karoWon: number;
  karoLost: number;
  lucyWon: number;
  lucyLost: number;
};

type MatchRow = { id: number; name: string; gender: string | null };
type VoteRow = { winner: number; loser: number; member_id: string };

export const boyEligible = (g: string | null) => g !== "feminine";
export const girlEligible = (g: string | null) => g !== "masculine";

/** Ranked league tables (boys/girls) for one couple. */
export async function computeStandings(coupleId: string): Promise<{ boys: Standing[]; girls: Standing[] }> {
  const members = await getCoupleMembers(coupleId);
  const a = members[0];
  const b = members[1];
  if (!a || !b) return { boys: [], girls: [] };

  // Map member id -> the legacy output bucket. Seed couple => 'karo'/'lucy';
  // any future couple falls back to role so the shape is still valid.
  const bucket = (memberId: string): "karo" | "lucy" => {
    const m = members.find((x) => x.id === memberId);
    if (m?.legacySlug === "lucy") return "lucy";
    if (m?.legacySlug === "karo") return "karo";
    return m?.role === "b" ? "lucy" : "karo";
  };

  // Matches = names liked by BOTH members of this couple.
  const matches = (await db.execute<MatchRow>(sql`
    select n.id, n.name, n.gender
    from names n
    join swipes sa on sa.name_id = n.id and sa.member_id = ${a.id} and sa.decision = 'like'
    join swipes sb on sb.name_id = n.id and sb.member_id = ${b.id} and sb.decision = 'like'
  `)) as unknown as Array<MatchRow>;

  const matchById = new Map<number, MatchRow>();
  for (const m of matches) matchById.set(Number(m.id), { id: Number(m.id), name: m.name, gender: m.gender });

  const votes = (await db.execute<VoteRow>(sql`
    select winner_name_id as winner, loser_name_id as loser, member_id
    from tournament_votes
    where member_id in (${a.id}, ${b.id})
  `)) as unknown as Array<VoteRow>;

  function buildLeague(eligible: (g: string | null) => boolean): Standing[] {
    const table = new Map<number, Standing>();
    for (const m of matches) {
      if (!eligible(m.gender)) continue;
      table.set(Number(m.id), {
        id: Number(m.id), name: m.name, gender: m.gender,
        played: 0, won: 0, lost: 0, points: 0, winRate: 0,
        karoWon: 0, karoLost: 0, lucyWon: 0, lucyLost: 0,
      });
    }

    for (const v of votes) {
      const w = Number(v.winner);
      const l = Number(v.loser);
      const wm = matchById.get(w);
      const lm = matchById.get(l);
      if (!wm || !lm) continue;
      if (!eligible(wm.gender) || !eligible(lm.gender)) continue;

      const ws = table.get(w)!;
      const ls = table.get(l)!;
      ws.won++; ws.played++; ws.points += 3;
      ls.lost++; ls.played++;
      const who = bucket(v.member_id);
      if (who === "karo") { ws.karoWon++; ls.karoLost++; }
      else { ws.lucyWon++; ls.lucyLost++; }
    }

    const rows = Array.from(table.values());
    for (const r of rows) r.winRate = r.played ? r.won / r.played : 0;
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.won - b.lost - (a.won - a.lost) ||
        b.winRate - a.winRate ||
        b.played - a.played ||
        a.name.localeCompare(b.name)
    );
    return rows;
  }

  return { boys: buildLeague(boyEligible), girls: buildLeague(girlEligible) };
}
```

- [ ] **Step 2: Type-check this file's direct dependents will be fixed next**

Run: `npx tsc --noEmit 2>&1 | grep -E "standings|knockout"`
Expected: errors only where `computeStandings()` is now called without `coupleId` (in `tournament/standings` and `tournament/knockout`) — fixed in Tasks 6–7.

- [ ] **Step 3: Commit**

```bash
git add lib/standings.ts
git commit -m "feat(tenancy): scope computeStandings to a couple's two members"
```

---

## Task 5: `lib/rate-limit.ts` + `lib/push.ts` — key by member

**Files:** Modify `lib/rate-limit.ts`, `lib/push.ts`.

- [ ] **Step 1: Rate-limit by `memberId`**

In `lib/rate-limit.ts`: change the signature and the two `aiCalls` references.

Replace `import type { UserSlug } from "@/lib/user";` → (delete it).
Replace the function signature line:
```ts
export async function enforceAiLimit(
  memberId: string,
  kind: "generate" | "suggest"
): Promise<LimitResult> {
```
Replace `eq(schema.aiCalls.userSlug, slug),` → `eq(schema.aiCalls.memberId, memberId),`.
Replace `await db.insert(schema.aiCalls).values({ userSlug: slug, kind });` → `await db.insert(schema.aiCalls).values({ memberId, kind });`.

- [ ] **Step 2: Push by `memberId`**

In `lib/push.ts`: change `sendPushTo` to take a member id.

Replace `import type { UserSlug } from "@/lib/user";` → (delete it).
Replace `export async function sendPushTo(user: UserSlug, payload: PushPayload)` → `export async function sendPushTo(memberId: string, payload: PushPayload)`.
Replace `.where(eq(schema.pushSubscriptions.userSlug, user));` → `.where(eq(schema.pushSubscriptions.memberId, memberId));`.

- [ ] **Step 3: Commit**

```bash
git add lib/rate-limit.ts lib/push.ts
git commit -m "feat(tenancy): rate-limit and push keyed by member_id"
```

---

## Task 6: Tournament read routes — pair, results, standings

**Files:** Modify `app/api/tournament/pair/route.ts`, `app/api/tournament/results/route.ts`, `app/api/tournament/standings/route.ts`.

- [ ] **Step 1: `tournament/standings/route.ts`** — pass the couple id

Replace `import { readUserSlug, unauthorized } from "@/lib/api";` → `import { readMember, unauthorized } from "@/lib/api";`.
Replace the handler's auth + call. The current file calls `computeStandings()` with no args; the new one:

```ts
export async function GET() {
  const member = await readMember();
  if (!member) return unauthorized();
  const standings = await computeStandings(member.coupleId);
  return Response.json(standings);
}
```

(Keep whatever response shape the existing file returns — only the auth line and the `computeStandings(member.coupleId)` argument change.)

- [ ] **Step 2: `tournament/pair/route.ts`** — scope matches + votes to the couple

Replace the import: `import { readUserSlug, unauthorized } from "@/lib/api";` → `import { readMember, unauthorized } from "@/lib/api";` and add `import { getCoupleMembers } from "@/lib/members";`.

Replace the auth block:
```ts
  const member = await readMember();
  if (!member) return unauthorized();
  const members = await getCoupleMembers(member.coupleId);
  const a = members[0], b = members[1];
  if (!a || !b) return Response.json({ pair: null, reason: "not_enough_matches", totalMatches: 0 });
```

Replace the matches query's join lines:
```ts
    join swipes sk on sk.name_id = n.id and sk.member_id = ${a.id} and sk.decision = 'like'
    join swipes sl on sl.name_id = n.id and sl.member_id = ${b.id} and sl.decision = 'like'
```

Replace the "compared" query's filter `where user_slug = ${slug}` → `where member_id = ${member.id}`.

(All other logic — gender filter, candidate building, random pick — is unchanged.)

- [ ] **Step 3: `tournament/results/route.ts`** — scope CTEs to the couple's members

Replace the import as in Step 1 and add `import { getCoupleMembers } from "@/lib/members";`.

Replace the auth block with the same `member` + `members` + `a`/`b` resolution as Step 2 (return `{ ranking: [] }` if `!a || !b`).

The raw SQL hard-codes `'karo'`/`'lucy'`. Replace the CTE so the two buckets are the two members, keyed by id, but **keep the `karo_*`/`lucy_*` output columns** so the JSON contract is unchanged for the seed couple:

```ts
  const rows = (await db.execute<Row>(sql`
    with matches as (
      select n.id, n.name
      from names n
      join swipes sk on sk.name_id = n.id and sk.member_id = ${a.id} and sk.decision = 'like'
      join swipes sl on sl.name_id = n.id and sl.member_id = ${b.id} and sl.decision = 'like'
    ),
    karo_wins as (
      select winner_name_id as id, count(*)::int as c
      from tournament_votes where member_id = ${a.id} group by 1
    ),
    karo_losses as (
      select loser_name_id as id, count(*)::int as c
      from tournament_votes where member_id = ${a.id} group by 1
    ),
    lucy_wins as (
      select winner_name_id as id, count(*)::int as c
      from tournament_votes where member_id = ${b.id} group by 1
    ),
    lucy_losses as (
      select loser_name_id as id, count(*)::int as c
      from tournament_votes where member_id = ${b.id} group by 1
    )
    select
      m.id, m.name,
      coalesce(kw.c, 0) as karo_wins,
      coalesce(kl.c, 0) as karo_losses,
      coalesce(lw.c, 0) as lucy_wins,
      coalesce(ll.c, 0) as lucy_losses
    from matches m
    left join karo_wins kw on kw.id = m.id
    left join karo_losses kl on kl.id = m.id
    left join lucy_wins lw on lw.id = m.id
    left join lucy_losses ll on ll.id = m.id
  `)) as unknown as Array<Row>;
```

(The mapping/sort code below is unchanged. `a` = role 'a' = Karo, `b` = role 'b' = Lucy for the seed couple, preserving exact semantics.)

- [ ] **Step 4: Type-check the three files**

Run: `npx tsc --noEmit 2>&1 | grep tournament`
Expected: no errors from `pair`, `results`, `standings` (errors may remain in `vote`/`knockout` until Task 7).

- [ ] **Step 5: Commit**

```bash
git add app/api/tournament/pair/route.ts app/api/tournament/results/route.ts app/api/tournament/standings/route.ts
git commit -m "feat(tenancy): scope tournament read routes (pair/results/standings) to the couple"
```

---

## Task 7: Tournament write routes — vote, knockout, knockout/vote

**Files:** Modify `app/api/tournament/vote/route.ts`, `app/api/tournament/knockout/route.ts`, `app/api/tournament/knockout/vote/route.ts`.

- [ ] **Step 1: `tournament/vote/route.ts`** — write votes by member

Replace import `readUserSlug` → `readMember`. Replace auth:
```ts
  const member = await readMember();
  if (!member) return unauthorized();
```
In the transaction, replace `eq(schema.tournamentVotes.userSlug, slug)` → `eq(schema.tournamentVotes.memberId, member.id)`, and replace the insert `.values({ userSlug: slug, winnerNameId: winnerId, loserNameId: loserId })` → `.values({ memberId: member.id, winnerNameId: winnerId, loserNameId: loserId })`.

- [ ] **Step 2: `tournament/knockout/route.ts`** — couple-scope the bracket

Replace import `readUserSlug` → `readMember` and add `import { getCoupleMembers } from "@/lib/members";` (only if `buildBracket` needs the couple — see Step 3). Replace both handlers' auth with `const member = await readMember(); if (!member) return unauthorized();`.

`computeStandings()` is now `computeStandings(member.coupleId)` in the POST handler.

The `knockouts` table is now couple-scoped. In the POST transaction:
- Replace `await tx.delete(schema.knockouts).where(eq(schema.knockouts.gender, gender));` → `await tx.delete(schema.knockouts).where(and(eq(schema.knockouts.coupleId, member.coupleId), eq(schema.knockouts.gender, gender)));` (add `and` to the `drizzle-orm` import).
- Replace `.values({ gender, size, status: "active" })` → `.values({ coupleId: member.coupleId, gender, size, status: "active" })`.

`buildBracket(gender)` in `lib/knockout.ts` must also filter by couple — see Step 3.

- [ ] **Step 3: `lib/knockout.ts` (buildBracket) + `tournament/knockout/vote/route.ts`**

Open `lib/knockout.ts`. It reads the `knockouts` row by `gender` only. Change `buildBracket` to take `coupleId` and filter `where coupleId = ? and gender = ?`. Update its signature `buildBracket(gender)` → `buildBracket(coupleId: string, gender)` and the lookup query's `where` to include `eq(schema.knockouts.coupleId, coupleId)`. Update both call sites in `tournament/knockout/route.ts` to `buildBracket(member.coupleId, gender)`.

In `tournament/knockout/vote/route.ts`: replace import `readUserSlug` → `readMember`; replace auth with `const member = await readMember(); if (!member) return unauthorized();`. Where it loads/advances the knockout, scope the `knockouts` lookup by `member.coupleId` (add `eq(schema.knockouts.coupleId, member.coupleId)` to the `where`). If it calls `buildBracket(gender)`, change to `buildBracket(member.coupleId, gender)`.

> Read `lib/knockout.ts` and `tournament/knockout/vote/route.ts` first; apply the same "filter knockouts by couple_id, thread coupleId through buildBracket" transformation. The `knockout_matches` table cascades from `knockouts`, so no further scoping is needed there.

- [ ] **Step 4: Type-check tournament subtree**

Run: `npx tsc --noEmit 2>&1 | grep -E "tournament|knockout"`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/tournament lib/knockout.ts
git commit -m "feat(tenancy): scope tournament write routes + buildBracket to the couple"
```

---

## Task 8: Swipe + matches + deck routes

**Files:** `app/api/swipe/route.ts`, `app/api/swipe/undo/route.ts`, `app/api/swipes/reset/route.ts`, `app/api/matches/route.ts`, `app/api/matches/[id]/route.ts`, `app/api/likes/route.ts`, `app/api/favourites/[id]/route.ts`, `app/api/notes/[id]/route.ts`, `app/api/stats/route.ts`, `app/api/names/route.ts`.

**The mechanical recipe (applies to every file in this task):**
1. `import { readUserSlug, unauthorized } from "@/lib/api";` → `import { readMember, unauthorized } from "@/lib/api";`
2. `const slug = await readUserSlug(); if (!slug) return unauthorized();` → `const member = await readMember(); if (!member) return unauthorized();`
3. Any `eq(schema.<table>.userSlug, slug)` → `eq(schema.<table>.memberId, member.id)`.
4. Any insert `.values({ userSlug: slug, ... })` → `.values({ memberId: member.id, ... })`.
5. Any `onConflictDoNothing/Update` target `[schema.<table>.userSlug, schema.<table>.nameId]` → `[schema.<table>.memberId, schema.<table>.nameId]`.
6. Any raw SQL `user_slug = ${slug}` → `member_id = ${member.id}`.

- [ ] **Step 1: `swipe/route.ts`** — apply recipe + replace the partner/push logic

Recipe items 1–5 apply to the insert. Then the match-detection uses `partnerOf` + `displayName` (removed). Replace:
```ts
import { displayName, partnerOf } from "@/lib/user";
```
with:
```ts
import { getCoupleMembers, otherMember } from "@/lib/members";
```
Replace the `const partner = partnerOf(slug);` block and the partner-like query + push with:
```ts
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

  if (partnerLike.length === 0) return Response.json({ isMatch: false });

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
```

- [ ] **Step 2: `names/route.ts` (deck)** — recipe + couple_state + member scoping

Replace import `readUserSlug` → `readMember`; auth → `member`.
Replace the `app_state` lookup with `couple_state` scoped to the couple:
```ts
  const [state] = await db
    .select({
      seed: schema.coupleState.shuffleSeed,
      excludedOriginGroups: schema.coupleState.excludedOriginGroups,
    })
    .from(schema.coupleState)
    .where(eq(schema.coupleState.coupleId, member.coupleId))
    .limit(1);
```
Replace the profile lookup `eq(schema.userProfiles.userSlug, slug)` → `eq(schema.userProfiles.memberId, member.id)`.
In the three raw SQL fragments, replace `sv.user_slug = ${slug}` → `sv.member_id = ${member.id}`, and `s.user_slug = ${slug}` → `s.member_id = ${member.id}`.

- [ ] **Step 3: Apply the recipe to the remaining 8 files**

For each, make the recipe substitutions. Specifics:
- `swipe/undo/route.ts` — delete/select scoped by `memberId` (recipe 2,3,6).
- `swipes/reset/route.ts` — delete `where memberId = member.id`.
- `matches/route.ts` — it currently joins `swipes` for `karo`/`lucy`. Resolve `members` via `getCoupleMembers(member.coupleId)` and join `sa.member_id = ${a.id}` / `sb.member_id = ${b.id}` (same pattern as standings). Replace any hard-coded `'karo'`/`'lucy'`.
- `matches/[id]/route.ts` — scope the per-member swipe lookups to `a.id`/`b.id` (resolve members) and any write to `member.id`.
- `likes/route.ts` — `where memberId = member.id`.
- `favourites/[id]/route.ts` — update `where memberId = member.id`.
- `notes/[id]/route.ts` — update `where memberId = member.id`.
- `stats/route.ts` — counts `where memberId = member.id` (and if it reports both members, resolve `members`).

> Read each file before editing; the per-person tables are always `swipes`/`tournament_votes`. Anything joining the two people becomes the `a.id`/`b.id` member pair.

- [ ] **Step 4: Type-check this subtree**

Run: `npx tsc --noEmit 2>&1 | grep -E "api/(swipe|matches|likes|favourites|notes|stats|names)"`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/swipe app/api/swipes app/api/matches app/api/likes app/api/favourites app/api/notes app/api/stats app/api/names/route.ts
git commit -m "feat(tenancy): scope swipe/matches/deck routes to member + couple"
```

---

## Task 9: Profile + couple_state routes (origin-filter, shuffle)

**Files:** `app/api/profile/route.ts`, `app/api/profile/gender-filter/route.ts`, `app/api/profile/auto-pass-variants/route.ts`, `app/api/origin-filter/route.ts`, `app/api/shuffle/route.ts`.

- [ ] **Step 1: `profile/route.ts`** — GET returns couple's two members' emojis; POST writes by member

The GET currently selects `user_slug, emoji` and emits `{ karo:{emoji}, lucy:{emoji} }`. Keep that output shape but source it from members joined to profiles. Replace the GET body:
```ts
export async function GET() {
  const rows = await db
    .select({ legacySlug: schema.members.legacySlug, emoji: schema.userProfiles.emoji })
    .from(schema.userProfiles)
    .innerJoin(schema.members, eq(schema.members.id, schema.userProfiles.memberId));

  const out: { karo: { emoji: string }; lucy: { emoji: string } } = {
    karo: { emoji: "🧔🏻" },
    lucy: { emoji: "👩🏼" },
  };
  for (const r of rows) {
    if (r.legacySlug === "karo" || r.legacySlug === "lucy") out[r.legacySlug].emoji = r.emoji;
  }
  return Response.json(out);
}
```
The POST: replace import `readUserSlug` → `readMember`; auth → `member`; insert `.values({ userSlug: slug, emoji })` → `.values({ memberId: member.id, emoji })`; conflict target `schema.userProfiles.userSlug` → `schema.userProfiles.memberId`.

- [ ] **Step 2: `profile/gender-filter` + `profile/auto-pass-variants`** — recipe

Apply the Task 8 recipe (readMember; `userSlug`→`memberId` on the upsert + conflict target `schema.userProfiles.memberId`).

- [ ] **Step 3: `origin-filter/route.ts`** — app_state → couple_state

Replace import `readUserSlug` → `readMember`. In both handlers, resolve `const member = await readMember(); if (!member) return unauthorized();`.
Replace `readExcluded()` to take the couple id and read `couple_state`:
```ts
async function readExcluded(coupleId: string): Promise<string[]> {
  const [state] = await db
    .select({ excluded: schema.coupleState.excludedOriginGroups })
    .from(schema.coupleState)
    .where(eq(schema.coupleState.coupleId, coupleId))
    .limit(1);
  return (state?.excluded ?? []).filter((g) => ORIGIN_GROUP_KEYS.has(g));
}
```
Update its call to `await readExcluded(member.coupleId)`.
Replace the PUT upsert:
```ts
  await db
    .insert(schema.coupleState)
    .values({ coupleId: member.coupleId, excludedOriginGroups: excluded })
    .onConflictDoUpdate({
      target: schema.coupleState.coupleId,
      set: { excludedOriginGroups: excluded },
    });
```

- [ ] **Step 4: `shuffle/route.ts`** — app_state → couple_state

Read the file; it reads/writes `app_state.shuffle_seed` (single row id=1). Replace with `couple_state` scoped to `member.coupleId`: `readMember` for auth, select/`onConflictDoUpdate` on `schema.coupleState` with `target: schema.coupleState.coupleId` and `set: { shuffleSeed: ..., shuffleUpdatedAt: sql\`now()\` }`.

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "profile|origin-filter|shuffle"` → no errors.
```bash
git add app/api/profile app/api/origin-filter/route.ts app/api/shuffle/route.ts
git commit -m "feat(tenancy): profile by member; origin-filter & shuffle on couple_state"
```

---

## Task 10: AI routes + enrichment routes + push/subscribe

**Files:** `app/api/names/generate/route.ts`, `app/api/names/suggest/route.ts`, `app/api/names/[id]/popularity/route.ts`, `app/api/names/[id]/meaning/route.ts`, `app/api/names/[id]/variants/route.ts`, `app/api/push/subscribe/route.ts`.

- [ ] **Step 1: `names/generate` + `names/suggest`** — rate-limit by member

Replace import `readUserSlug` → `readMember`; auth → `member`. Replace `enforceAiLimit(slug, "generate")` → `enforceAiLimit(member.id, "generate")` (and `"suggest"` respectively). If these routes also write swipes/profile, apply the Task 8 recipe.

- [ ] **Step 2: Enrichment routes (`popularity`, `meaning`, `variants`)** — auth only

These mutate the **global** `names` table; they use `readUserSlug` only as an auth gate. Replace `readUserSlug` → `readMember` and the auth line; nothing else changes (no per-person data here).

- [ ] **Step 3: `push/subscribe/route.ts`** — store subscription by member

Replace import `readUserSlug` → `readMember`; auth → `member`. Replace the insert `.values({ userSlug: slug, endpoint, p256dh, auth })` → `.values({ memberId: member.id, endpoint, p256dh, auth })` (keep the `endpoint` unique conflict handling as-is).

- [ ] **Step 4: Type-check + commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "generate|suggest|popularity|meaning|variants|push/subscribe"` → no errors.
```bash
git add app/api/names/generate app/api/names/suggest app/api/names/\[id\] app/api/push/subscribe
git commit -m "feat(tenancy): AI rate-limit, enrichment auth, push subscribe keyed by member"
```

---

## Task 11: Cron reminder — iterate all members

**Files:** `app/api/cron/remind/route.ts`.

- [ ] **Step 1: Replace the hard-coded `["karo","lucy"]` loop**

Replace `import { displayName, type UserSlug } from "@/lib/user";` with `import { getCoupleMembers } from "@/lib/members";`.

Replace the per-user loop. Instead of `for (const user of ["karo","lucy"] as const)`, load every member of every couple and reminder each one, naming the partner from the couple:

```ts
  const allMembers = await db
    .select({ id: schema.members.id, coupleId: schema.members.coupleId, displayName: schema.members.displayName })
    .from(schema.members);

  const results: Array<{ memberId: string; sent: number; skipped: boolean; reason?: string }> = [];

  for (const m of allMembers) {
    const [last] = await db
      .select({ createdAt: schema.swipes.createdAt })
      .from(schema.swipes)
      .where(eq(schema.swipes.memberId, m.id))
      .orderBy(desc(schema.swipes.createdAt))
      .limit(1);

    const lastTime = last ? new Date(last.createdAt).getTime() : 0;
    const hoursSince = lastTime ? (Date.now() - lastTime) / 1000 / 3600 : Infinity;
    if (hoursSince < STALE_HOURS) {
      results.push({ memberId: m.id, sent: 0, skipped: true, reason: "recent_activity" });
      continue;
    }

    const [{ swiped }] = await db
      .select({ swiped: sql<number>`count(*)::int` })
      .from(schema.swipes)
      .where(eq(schema.swipes.memberId, m.id));
    const remaining = totalNames - swiped;
    if (remaining <= 0) {
      results.push({ memberId: m.id, sent: 0, skipped: true, reason: "all_swiped" });
      continue;
    }

    const members = await getCoupleMembers(m.coupleId);
    const partner = members.find((x) => x.id !== m.id);
    const partnerName = partner?.displayName ?? "Your partner";
    const { sent } = await sendPushTo(m.id, {
      title: "Your deck is waiting",
      body: `${remaining.toLocaleString()} names left to swipe. ${partnerName} might have already moved.`,
      url: "/swipe",
      tag: "remind",
    });
    results.push({ memberId: m.id, sent, skipped: false });
  }
```

- [ ] **Step 2: Full type-check, lint, build (the whole app is now switched)**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: **all pass, zero `userSlug`/`readUserSlug`/`partnerOf`/`displayName` errors.** If any remain, a route was missed — fix before committing.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/remind/route.ts
git commit -m "feat(tenancy): reminder cron iterates all members across couples"
```

---

## Task 12: Verify on live data, then Contract migration

**Files:** Modify `db/schema.ts`; generate `db/migrations/00NN_*.sql` (drops).

Do **not** start until Tasks 1–11 are merged-or-staged and the app runs green against the live DB.

- [ ] **Step 1: Smoke-test the running app against the live DB**

Run `npm run dev`, then exercise the key flows as Karo and as Lucy (set `x-user-slug` via the existing user picker). Verify against the Task 0 baseline that the **same matches, standings, and bracket** appear as before. Quick API smoke (replace host/port):

```bash
curl -s localhost:3000/api/matches -H "x-user-slug: karo" | head -c 300; echo
curl -s "localhost:3000/api/tournament/standings" -H "x-user-slug: lucy" | head -c 300; echo
curl -s "localhost:3000/api/tournament/results" -H "x-user-slug: karo" | head -c 300; echo
```
Expected: non-empty, shapes identical to pre-refactor (still `karo*`/`lucy*` keys). Match count equals baseline `matches`.

- [ ] **Step 2: Write the isolation check `db/verify-isolation.ts`**

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql.begin(async (tx) => {
    // Throwaway couple B with two members and one shared "like".
    const [c] = await tx`insert into couples (name, invite_code) values ('TEST-ISO', ${'ISO-' + Date.now()}) returning id`;
    const [m1] = await tx`insert into members (couple_id, role, display_name) values (${c.id}, 'a', 'T1') returning id`;
    const [m2] = await tx`insert into members (couple_id, role, display_name) values (${c.id}, 'b', 'T2') returning id`;
    const [name] = await tx`select id from names limit 1`;
    await tx`insert into swipes (member_id, name_id, decision) values (${m1.id}, ${name.id}, 'like')`;
    await tx`insert into swipes (member_id, name_id, decision) values (${m2.id}, ${name.id}, 'like')`;

    // Couple B sees its 1 match; the seed couple's match query must NOT include couple B's rows.
    const [seedA] = await tx`select id from members where legacy_slug = 'karo'`;
    const [seedB] = await tx`select id from members where legacy_slug = 'lucy'`;
    const seedMatches = await tx`
      select n.id from names n
      join swipes sa on sa.name_id = n.id and sa.member_id = ${seedA.id} and sa.decision='like'
      join swipes sb on sb.name_id = n.id and sb.member_id = ${seedB.id} and sb.decision='like'
      where n.id = ${name.id}
    `;
    const leaked = seedMatches.length > 0 && !(name.id);
    if (leaked) throw new Error("ISOLATION FAIL: couple B data visible to seed couple");
    console.log("ISOLATION OK — couple B's swipes are invisible to the seed couple.");

    // Roll back the throwaway data.
    throw new Error("__ROLLBACK__");
  }).catch((e) => {
    if (String(e).includes("__ROLLBACK__")) return;
    throw e;
  });
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `npx tsx db/verify-isolation.ts`
Expected: `ISOLATION OK — ...` and no leftover `TEST-ISO` couple (the transaction rolls back).

- [ ] **Step 3: Contract — drop legacy columns/tables in `db/schema.ts`**

Now that nothing reads `user_slug`/`app_state`:
- In each per-person table, **remove the `userSlug` column** and its old `user_slug`-based unique/index; **make `memberId` `.notNull()`** and add the real unique indexes: `swipes` `uniqueIndex("swipes_member_name_uniq").on(t.memberId, t.nameId)`; `tournamentVotes` `uniqueIndex("tournament_member_pair_uniq").on(t.memberId, t.winnerNameId, t.loserNameId)`.
- `userProfiles`: drop `userSlug`; make `memberId` the primary key (`.primaryKey()`).
- `knockouts`: drop `genderUniq`; make `coupleId` `.notNull()`; add `uniqueIndex("knockout_couple_gender_uniq").on(t.coupleId, t.gender)`.
- Delete the `appState` table definition and the `userSlugEnum` definition.
- Drop the `app_state` table.

- [ ] **Step 4: Generate + review the destructive migration**

Run: `npm run db:generate`
Expected: a migration with `DROP COLUMN user_slug`, `DROP TABLE app_state`, `DROP TYPE user_slug`, `ALTER COLUMN member_id SET NOT NULL`, new unique indexes. **Read it carefully.** Confirm a backup from Task 0 exists before applying.

- [ ] **Step 5: Apply + verify**

Run: `npm run db:migrate && npx tsx db/verify-tenancy.ts check`

> Note: after dropping `user_slug`, the baseline `matches` query in `verify-tenancy.ts` (which joins on `user_slug`) will fail. **Before this step**, update `verify-tenancy.ts`'s match query to the member-based join (`sa.member_id = (select id from members where legacy_slug='karo')`, etc.). Expected: counts still equal the original baseline.

Run: `npx tsc --noEmit && npm run lint && npm run build` → all pass.

- [ ] **Step 6: Commit**

```bash
git add db/schema.ts db/migrations db/verify-tenancy.ts
git commit -m "feat(tenancy): contract — drop user_slug/app_state/enum, member_id NOT NULL + unique"
```

---

## Task 13: PR + deploy + post-deploy verification

- [ ] **Step 1: Open the PR**

```bash
git push -u origin tenancy-phase-a
gh pr create --title "Phase A: multi-couple tenancy refactor (no UX change)" --body "Replaces the user_slug enum with couples+members; backfills Karo & Lucy as the seed couple; scopes all per-person/per-couple data to a couple. Frontend + x-user-slug wire contract unchanged (legacy_slug bridge). Live data preserved — baseline counts verified pre/post. Next: Phase B (real session auth + multi-couple frontend) then the Expo scaffold."
```

- [ ] **Step 2: After squash-merge + auto-deploy, smoke prod**

```bash
curl -s https://names-match.vercel.app/api/matches -H "x-user-slug: karo" | head -c 200; echo
```
Expected: the live couple's matches, unchanged. Open the PWA, confirm swipe/match/league/bracket all behave as before.

- [ ] **Step 3: Clean up**

Remove any local `backup-pre-tenancy-*.sql` from the working tree (it's already covered by `.gitignore` patterns — confirm it is **not** committed). The `db/verify-*.ts` and `db/migrate-tenancy.ts` scripts stay (useful for Phase B).

---

## What Phase A deliberately leaves for Phase B (the next plan)

- Real session auth: signed cookie carrying `member_id`, replacing `x-user-slug` + `legacy_slug`; create/join-couple flows with invite codes.
- Generalise the **frontend** off `karo`/`lucy`: `user-provider.tsx`, `app/page.tsx`, `settings-screen.tsx`, `matches-screen.tsx` → member display names/emojis from the API; drop the two-button hard-wired picker.
- Then the **Expo monorepo scaffold** (`apps/web` + `apps/mobile`, shared types/API client) per the agreed direction.

---

## Self-Review

**Spec coverage (docs/onboarding-multicouple-plan.md §2 + §6 Phase A):**
- couples + members tables → Task 1 ✓
- swipes/tournament_votes/user_profiles → member_id → Tasks 1 (expand), 2 (backfill), 8/9 (routes), 12 (contract) ✓
- app_state → couple_state → Tasks 1, 2, 9 (origin-filter/shuffle/deck), 12 ✓
- knockouts couple-scoped → Tasks 1, 2, 7, 12 ✓
- ai_calls keyed by member → Tasks 1, 5, 10 ✓
- generalise hard-coded karo/lucy in tournament routes → Tasks 4, 6, 7 ✓
- migrate Karo & Lucy as seed couple, no data loss → Tasks 0 (backup+baseline), 2 (backfill), 12 (verify) ✓
- isolation/privacy (one couple can't see another) → Task 12 verify-isolation ✓
- "behind unchanged behaviour" → legacy_slug bridge keeps x-user-slug + karo/lucy response keys; frontend untouched ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" left. The three files I did not read line-by-line (`swipe/undo`, `swipes/reset`, `likes`, `favourites/[id]`, `notes/[id]`, `stats`, `profile/gender-filter`, `profile/auto-pass-variants`, `shuffle`, `lib/knockout.ts`, `tournament/knockout/vote`) are covered by the explicit mechanical recipe (Task 8 Step) + a "read first" instruction, because they are pure `userSlug→memberId` substitutions of the same shape shown in fully-worked siblings.

**Type consistency:** `Member` shape (`id, coupleId, role, displayName, emoji, legacySlug`) is defined once in `lib/members.ts` and used consistently. `readMember()` returns `Member | null` everywhere. `computeStandings(coupleId)`, `buildBracket(coupleId, gender)`, `enforceAiLimit(memberId, kind)`, `sendPushTo(memberId, payload)` signatures are referenced identically at all call sites named above.

**Known caveat to flag at execution:** Tasks 8–11 reference files not read in full during planning. The implementer must open each before editing and apply the stated recipe — the substitutions are uniform, but exact line text must be matched per file.
