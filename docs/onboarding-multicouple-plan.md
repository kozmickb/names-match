# Onboarding & Multi-Couple Plan

Status: **draft for discussion** (no code yet). Goal: turn names-match from a single
hard-wired couple (Karo & Lucy) into a product many couples can sign up for, with a
first-run onboarding that shapes each couple's name pool.

---

## 1. Where we are today (the constraint)

- Identity is hard-wired: `user_slug` is a Postgres enum `('karo','lucy')`. There is
  no real auth beyond an optional shared `APP_PASSCODE` + a two-button user picker.
- Per-person data (`swipes`, `tournament_votes`, `user_profiles`) is keyed by that enum.
- Shared state is a **single global row**: `app_state` (shuffle seed, excluded origin
  groups) and one `knockouts` row per gender.
- Tournament routes (`pair`, `results`, `standings`, `knockout`) **hard-code** the two
  slugs `'karo'` / `'lucy'`.
- The **names catalog + enrichment is global** — and that's correct. It should stay
  shared across all couples (enrichment is paid once per name for everyone).

**Implication:** going multi-couple is mostly a *tenancy refactor* — scope all the
per-person and per-couple data to a couple, and generalise the two hard-coded slugs to
"the couple's two members." The catalog is untouched.

---

## 2. Target data model

```
couples
  id              uuid pk
  name            text            -- "The Bonas家" / optional
  invite_code     text unique     -- short code partner 2 uses to join
  created_at      timestamptz

members                            -- replaces the user_slug enum
  id              uuid pk
  couple_id       uuid fk -> couples
  role            'a' | 'b'        -- the two seats in a couple
  display_name    text
  emoji           text
  email           text null        -- only if we do email auth
  created_at      timestamptz
  unique (couple_id, role)

-- Per-person data: swap user_slug -> member_id (couple is derivable via member)
swipes            ... member_id fk -> members
tournament_votes  ... member_id fk -> members
user_profiles     ... member_id fk -> members   (gender filter, auto-pass, emoji)

-- Per-couple shared state: add couple_id, drop the single-row assumption
couple_state      couple_id pk, shuffle_seed, excluded_origin_groups, plan/tier
knockouts         ... couple_id fk   (one per couple per gender)
knockout_matches  ... unchanged (cascades from knockouts)

-- Global, unchanged
names             (catalog + origin/meaning/popularity/origin_group)
```

Notes:
- A **couple is the tenant.** Everything a partner sees is filtered to their couple.
- `names` stays global. Matches = names liked by *both members of the same couple*.
- `ai_calls` rate-limit log: key by `member_id` (or `couple_id`) instead of slug.

---

## 3. Auth & joining (lightweight)

Recommendation: **couple-code join**, optionally upgraded to email magic-link later.

- Partner 1: "Create" → picks display name + emoji → we mint a `couple` with a short
  `invite_code` (e.g. `LUCY-7G2`) and a device/session token.
- Partner 2: "Join" → enters the code → becomes role `b` on that couple.
- Session = a signed cookie carrying `member_id` (replaces today's `x-user-slug` header
  + `nm_auth` passcode). `readUserSlug()` becomes `readMember()` → `{ memberId, coupleId, role }`.
- This avoids forcing email/passwords up front (low friction) while still isolating
  couples. Email magic-link can be added for multi-device / recovery without changing
  the model.

Open decision: **couple-code only** (simplest, but losing the code = losing access) vs
**email magic-link from day one** (more robust, slightly more friction). Lean: code to
start, add email before any real launch.

---

## 4. Onboarding flow (first run)

Principle from our earlier discussion: **shape the pool early, but optional and
skippable; never drown a skipper.**

1. **Create or join a couple** (§3).
2. **You** — display name + emoji (reuse existing emoji picker).
3. **Shape your pool** *(optional, one "Skip / Show me everything" button)* — reuses the
   existing filter engine, framed as inclusion ("which feel right?", all pre-selected):
   - **Gender focus**: Boys / Girls / Either (they may already know the sex).
   - **Origins**: the 12 culture groups (all on; deselect to exclude).
   - **Popularity / volume**: "Mainstream", "Balanced", "Include rare & unique" — a cut
     on the catalog so the deck is finite even if everything else is left wide.
4. **Start swiping.**

Reuse: gender filter + origin-group filter already exist. The **only new filter
primitive** is the *popularity/volume cut* (e.g. by `uk_rank` presence / a popularity
score), which is the main lever for "don't drown me."

Default pool (if they skip everything): a **curated starter** — e.g. names that have a
UK ONS rank or are otherwise reasonably common — not the raw 17.7k. Expanding is one tap
in Settings later. This makes a narrow start never feel like a dead end.

---

## 5. Monetisation hook (from the cost model)

AI COGS is ~cents per couple, so price on value, not COGS:
- **Free**: swiping, matches, league table; capped AI generate/suggest per day.
- **Paid unlock** (one-off ~£2.99 or sub): unlimited AI, knockout bracket, advanced
  filters. Billed **per couple**. Wire the paywall as a couple-level flag on `couple_state`.

---

## 6. Phasing (each shippable)

- **Phase A — Tenancy refactor (no UX change).** Add `couples`/`members`; migrate Karo &
  Lucy into the first couple; swap `user_slug` → `member_id` across swipes / votes /
  profiles; make `app_state`, `knockouts` couple-scoped; generalise the hard-coded
  `'karo'/'lucy'` in tournament routes to the couple's two members. Highest-risk, touches
  every route — do it behind unchanged behaviour and verify against the existing data.
- **Phase B — Auth + create/join couple.** Session cookie carrying `member_id`; create
  flow with invite code; join flow.
- **Phase C — Onboarding step + popularity cut + curated default pool.** Reuse the filter
  engine; add the volume lever.
- **Phase D — Paywall / plans.**

---

## 7. Key risks & decisions

- **The `user_slug` enum refactor is the big one** — it appears in the schema, many
  routes, and the tournament's hard-coded slugs. Plan a careful, tested migration with
  Karo & Lucy as the seed couple so we never lose their swipes/matches/votes.
- **Auth approach**: code-only vs email magic-link (see §3).
- **Isolation/privacy**: every per-couple query must filter by `couple_id`; add tests so
  one couple can never see another's swipes/matches.
- **Default pool definition**: needs a "popularity score" — `uk_rank` covers only ~700
  names, so we may want a broader signal (e.g. ONS/SSA counts at import time) to grade
  "common vs rare" for the volume cut. Worth capturing counts during import for this.

---

## 8. Native iOS + Android direction (decided 2026-05-23)

We're scaffolding a **native app for the iOS App Store and Google Play**, not just the
PWA. A couple can be split across iOS and Android, so **cross-platform parity and sync
are first-class requirements**, not afterthoughts.

What's decided / to decide when scaffolding (the "superpowers" scaffolding step):

- **Client approach (open):** likely **React Native / Expo** (one codebase, both stores)
  over two native codebases or a PWA wrapper — keeps the cross-platform couple cheap to
  support. Confirm at scaffold time.
- **Backend reuse:** the existing **Next.js API routes + Postgres (Drizzle)** are the
  natural backend for the native clients (catalog, swipes, matches, tournament, filters
  already exist). The native app becomes a client over the same API; multi-couple tenancy
  (§2) is the prerequisite.
- **Cross-platform couple:** one couple, two members who may be on different OSes →
  server-side accounts + invite-code join (§3), real push on both platforms (we already
  have web-push; native needs APNs/FCM), and identical feature set on both.
- **Carry over, don't rebuild logic:** the swipe/match/tournament/knockout/filter logic
  lives server-side and should be reused as-is; the native app is primarily a new UI shell
  + auth + push.
- **Keep Karo/Lucy prod (the Next.js PWA) running** as-is during the build; only fold in
  competitor-research features (search, add-your-own-name, delete-a-match, pronunciation)
  if they clearly improve that prod model — otherwise they're for the native product.

See `docs/competitive-findings.md` for what to lead with (the tournament is the moat;
bulletproof cross-device sync is the top trust driver).
