# Variant grouping — auto-pass all spellings of a rejected name

**Decided 2026-05-29.** Source complaint: "Mallory has been rejected, so should all
spellings of this variant." Today's `auto_pass_variants` uses `levenshtein ≤ 1`,
which catches *nothing* real (Mallory↔Mallorie = 2 edits, ↔Malorie = 3).

## Decisions
- **Match method:** curated **variant-group key** per name (the real fix), with a
  phonetic heuristic as interim/fallback.
- **Trigger:** **pass only** — rejecting a name hides its other spellings; liking a
  name leaves them in the deck so you can compare spellings.

## Why distance alone fails
Phonetic codes group true families (Mallory/Mallorie/Malorie → dmetaphone `MLR`;
Sofia/Sophia/Sophie → `SF`; Catherine/Katherine/Kathryn → `K0RN`), but over-collide
(`Miller`, `Millar`, `Melroy` are also `MLR`). Edit distance can't separate
"spelling of the same name" from "different name a few letters away" — Mallory needs
vowel-sensitivity to exclude *Miller*, Catherine/Katherine needs cross-initial
tolerance. The two pull opposite ways → no single distance rule works. Hence a
curated key.

## Phase 1 — interim heuristic (ship first)
- Deck filter (`app/api/names/route.ts`) variant clause → `dmetaphone(nv)=dmetaphone(n)
  AND levenshtein ≤ 2` **AND `sv.decision = 'pass'`**.
- `app/api/names/[id]/variants/route.ts` → same dmetaphone + lev≤2 rule, so "Also
  spelled" matches what's auto-passed.
- No schema change. Safe, low false-positive. Verifies + ships same day.

## Phase 2 — variant_group key (the real fix)
1. **Schema:** `names.variant_group text` (nullable) + btree index. Apply DDL directly
   to prod (drizzle snapshots are stale — do NOT `db:migrate`). Update `db/schema.ts`.
2. **Backfill script** `scripts/cluster-variants.ts` (`db:cluster-variants`):
   - Bucket all names by `dmetaphone` primary code.
   - Singletons → `variant_group = lower(name)` (own group).
   - Multi-name buckets → send to Claude (haiku, batched, JSON out) to partition into
     true variant groups and pick a canonical spelling per group; key =
     `lower(canonical)`. Phonetics narrows candidates so the LLM only judges plausible
     relatives. Idempotent; only fills NULLs unless `--refresh`.
   - Log dropped/uncertain clusters; never silently truncate.
3. **Switch reads to groups (heuristic fallback for NULLs/new names):**
   - Deck filter: `nv.variant_group = n.variant_group` (pass-only) when both non-null,
     else fall back to dmetaphone+lev≤2.
   - Variants endpoint: same.
4. **New names:** assign `variant_group` at creation in the generate/suggest enrich
   path (`lib/enrich-persist.ts`) — match into an existing group via dmetaphone bucket
   + Claude check, else new singleton group.

## Verification
- tsc + eslint + next build green.
- Spot-check live: reject Mallory → Mallorie + Malorie leave karo's deck; Miller stays.
- Confirm Sofia/Sophia/Sophie, Catherine/Katherine, Aiden/Aidan/Ayden group correctly;
  confirm no obvious false-group (e.g. Miller not in Mallory's group).
- One-off AI cost noted before running the full backfill.
