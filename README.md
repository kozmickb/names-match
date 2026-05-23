# names-match

A **couples baby-name app**. Two partners each swipe names (like / pass); names you
**both** like become **matches**; then a **tournament** ranks the matches — a
**league table (group stage)** that leads into a **World Cup–style knockout bracket** —
to crown a favourite. Collaborative ranking is the product's moat: no competitor lets a
couple rank their matches together.

Live: https://names-match.vercel.app

## Stack
- **Next.js 16** (App Router, Turbopack) · React 19 · Tailwind v4 · shadcn/base-ui · framer-motion
- **Postgres + Drizzle ORM** (`db/`) · deployed on **Vercel**
- **Anthropic SDK** (`claude-haiku-4-5`) — name enrichment + AI generate/suggest
- **web-push** — match notifications

> ⚠️ See `AGENTS.md`: this Next.js version has breaking changes — check
> `node_modules/next/dist/docs/` before writing Next code.

## What it does
- **Swipe & match** — like/pass names; mutual likes become matches; free **undo**.
- **Global catalog** — ~17,700 UK + US names (SSA + ONS imports), enriched with
  origin, meaning, and UK popularity. Shared across all users (enrichment paid once).
- **Filters** — per-user gender filter; shared **origin-culture filter** (12 groups,
  e.g. hide Greek / Indian names) applied to the swipe deck.
- **Tournament** — gender-split **league table** → seeded **knockout bracket** (ties
  decided together) → champion. Reached via the **Rank** tab.
- **AI** — generate fresh names or suggest more like the ones you've liked
  (batched enrichment at creation; per-user daily rate limit).
- **Push** — get pinged when you both match a name.

## Develop
```bash
npm install
npm run dev          # http://localhost:3000 (needs DATABASE_URL in .env.local)
npm run build        # production build
npm run lint
```

### Database / data scripts
```bash
npm run db:push          # apply Drizzle schema
npm run db:import        # import US SSA top names
npm run db:import-ons    # import UK ONS names (xlsx)
npm run db:enrich        # backfill origin/meaning/popularity (batched AI)
npm run db:group-origins # backfill origin-culture groups
```

## Status & direction
- **Current prod is a single hard-wired couple** (Karo & Lucy; `user_slug` enum).
- **Next: a native iOS + Android product** over this same Next.js API, with multi-couple
  tenancy and cross-platform sync.

## Docs
- `docs/onboarding-multicouple-plan.md` — multi-couple tenancy, auth, onboarding, phasing, native direction.
- `docs/competitive-findings.md` — market pain points, our moat, gaps to fill.
- `CLAUDE.md` — full project context for AI assistants.
- `graphify-out/GRAPH_REPORT.md` + `graph.html` — knowledge graph of this codebase (regenerate with `/graphify`).
