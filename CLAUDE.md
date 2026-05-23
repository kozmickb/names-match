@AGENTS.md

# names-match — project context

A **couples baby-name app**. Two partners each swipe names (like/pass); mutual likes
become **matches**; a **tournament** ranks the matches — a **league table (group stage)**
that leads into a **World Cup–style knockout bracket** — to crown a favourite. The
collaborative ranking is the product's moat (no competitor ranks matches together).

## Stack
- **Next.js 16** (App Router, Turbopack) + React 19, Tailwind v4, shadcn/base-ui, framer-motion.
- **Postgres + Drizzle ORM** (`db/schema.ts`, `db/client.ts`). Deployed on **Vercel**;
  prod = https://names-match.vercel.app. Live DB via `DATABASE_URL` in `.env.local`.
- **Anthropic SDK** (`claude-haiku-4-5`) for name enrichment + AI generate/suggest.
- **web-push** for match notifications. Auth today: optional `APP_PASSCODE` + `x-user-slug` header.
- AGENTS.md warning holds: this Next.js has breaking changes — check `node_modules/next/dist/docs/` before writing Next code.

## Current prod model (Karo & Lucy — single hard-wired couple)
- Identity is the enum `user_slug ('karo','lucy')`; tournament routes hard-code these.
- **Catalog is global** (~17,713 names, UK SSA + US ONS imports), enriched: `origin` (92%),
  `meaning` (83%), UK `uk_rank`/`ukBlurb`, `gender`, `origin_group` (12 culture groups).
  Enrichment is paid once per name for everyone — keep it global.
- Built & live: swipe/match, free **undo**, AI generate/suggest (batched enrich at
  creation) with a per-user daily **rate limit** (`ai_calls`), gender filter (per-user),
  **shared origin-culture filter** (`app_state.excluded_origin_groups`, deck-only),
  tournament **league table** (gender-split) + **knockout bracket** (`knockouts`,
  `knockout_matches`; ties "decided together"), push notifications, **Rank** nav tab.
- Key ops scripts: `db:enrich`, `db:import` (SSA), `db:import-ons` (UK xlsx),
  `db:group-origins`, `db:push`.
- Reliability note already fixed: enrichment routes only cache on API success (no
  negative-cache-on-error blanking).

## Direction (decided 2026-05-23)
Scaffold a **native iOS + Android product** (App Store + Play). A couple may be split
across iOS/Android, so **cross-platform parity + bulletproof sync are first-class.**
- Likely **React Native / Expo** client over the **existing Next.js API + Postgres**
  backend; reuse all swipe/match/tournament/filter logic server-side.
- Requires **multi-couple tenancy**: replace the `user_slug` enum with `couples` +
  `members`, scope per-couple data, add accounts (invite-code join), native push (APNs/FCM).
- **Keep the Karo/Lucy PWA running**; only add competitor-research features (search,
  add-your-own-name, delete-a-match, pronunciation) to prod if they clearly improve it.

## Read these before continuing
- `docs/onboarding-multicouple-plan.md` — tenancy/data model, auth, onboarding, phasing, native direction (§8).
- `docs/competitive-findings.md` — market pain points, our moat, gaps to fill, what to lead with.
- `graphify-out/GRAPH_REPORT.md` — knowledge graph of this codebase (god nodes, communities, surprising links). Regenerate with `/graphify`. `graphify-out/` is git-ignored.

## Working conventions (this session's pattern)
- Branch off `main` → commit → PR → squash-merge → auto-deploy. Verify with `tsc` +
  `eslint` + `next build`; smoke-test endpoints against the live DB and clean up test data.
