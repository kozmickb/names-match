# Competitive Findings — Baby-Name Apps (2026-05-23)

Mined from real Apple App Store + Google Play reviews of competitor apps. Full
scrapes were saved under `.firecrawl/` (git-ignored). Use this to prioritise.

## The moat
**No competitor lets a couple *rank* their matches together.** They all stop at a
flat "matches" list; users explicitly ask to narrow/rank it. NameHatch's own marketing
concedes rivals "have no way to rank favorites together."
→ **names-match's league-table → knockout tournament is the headline differentiator.**

## Competitors profiled (with ratings)
- **Babyname – find it together** (iOS 4.1, 21K reviews; Android "Babyname" 3.7, 10.4K) — heavily unbundled IAPs ($0.99 each for undo, nationality, alphabetical, no-ads…).
- **Kinder – Find Baby Names** (iOS 4.4 / Android 3.8) — paid culture "name packs" (~$1.99), sync to partner.
- **Baby Name Together** (4.5, 315) — AI suggestions, partner link, **$1.49/mo sub**.
- **Nameberry** (3.1, new) — biggest DB; **$4.99 one-time** (the *loved* pricing benchmark; "no subscriptions, no surprises").
- **NameHatch** — modern couple rival; AI style filters; **$7/mo or $29/6mo** (resented).
- **Baby Names / Babynames.com** (4.7, 6.1K) — solo search/reference, $1.99 unlock meanings.
- **The Bump – Baby Names Matcher** — swipe game inside the pregnancy app.
- Namr/Mixfame/GoodName/Nona/Belly — not live/reviewable; Pampers is web-only.

## Top complaints (ranked) vs our status
1. **Repetitive names / "ran out in 50 swipes"** (dominant) — even big DBs fail to de-dupe. → ✅ We exclude every swiped name; 17.7k catalog. Treat "never repeat / never dead-end" as P0 correctness.
2. **Paywall resentment** — matches locked, "both partners must pay," selling *undo*, sub fatigue. → ✅ Plan: couple-loop free, one-time unlock (match Nameberry's $4.99 fairness).
3. **Partner sync fails / lost lists** — most brand-damaging 1★ driver. → ⚠️ Must be bulletproof in multi-couple (accounts + recovery). Make it a selling point.
4. **No undo / mis-swipe** (or paywalled). → ✅ We have free undo (`/api/swipe/undo`).
5. **Can't curate/rank shortlist together.** → ✅✅ Our tournament. The moat.
6. **Junk/made-up names; thin culture packs.** → ✅ Real origin+meaning on 17.7k + origin-culture filter.
7. **Bugs / stuck "out of names"** (often post-purchase). → execution requirement; large catalog + filters avoid the dead-end.
8. **Shallow info; want pronunciation + deeper/free stats.** → 🔲 Gap (no pronunciation, no US popularity/trend/gender-split).
9. **No search / can't add a name you already have in mind.** → 🔲 Gap (pure swipe alienates "I have names in mind").
10. **Review-prompt harassment.** → avoid; single well-timed prompt (e.g. after crowning a champion).

## Differentiation opportunities (what to lead with)
1. **Collaborative ranking (tournament)** — unique; make it the headline.
2. **Provably fresh, never-repeating deck** — win #1 by correctness, not "more names."
3. **Fair one-time pricing; couple-loop always free** — never charge both partners, never paywall undo/matches.
4. **Bulletproof cross-device sync + recovery** — turn the top 1★ driver into trust.
5. **Authentic, filterable cultural origins** — deeper than the thin culture packs.
6. **Free table-stakes competitors fragment:** undo (have), delete-a-match, search, add-your-own-name, sort favourites.
7. **Richer free data:** pronunciation, US popularity, trend, gender split.

## Quick wins that *also* help Karo/Lucy prod (only build these into prod)
- Delete-a-match / curate the match list.
- In-deck search + add-your-own-name (BabyName's "secret submit to partner" is liked).
- Pronunciation + richer popularity stats on the name card.
(Everything else is for the productised native app, not prod.)
