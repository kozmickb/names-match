# BabyNames Kanban - local sync

A repo-backed Notion Kanban for BabyNames.

- **Notion board:** https://www.notion.so/34a3c01e9353476d9a974d61009c1bb3
- **Database ID:** `34a3c01e-9353-476d-9a97-4d61009c1bb3`
- **Data source ID:** `349b8e3b-0869-43e8-a017-890d88417331`

## How the board moves

1. `items.json` is the local truth. Every card has a stable `key`, a `status`, and a `local_paths` array.
2. **PostToolUse hook** (`.claude/hooks/kanban-postwrite.ps1`) fires after every Edit/Write/MultiEdit/NotebookEdit. If the touched path matches any item's `local_paths` or matches a "new work signal" pattern, it journals to `.claude/kanban/touched.log` and emits an `additionalContext` message.
3. **Stop hook** (`.claude/hooks/kanban-stop.ps1`) blocks turn end if the journal has unprocessed entries, forcing the assistant to reconcile.
4. **SessionStart hook** (`.claude/hooks/kanban-sessionstart.ps1`) primes the assistant's first turn with a snapshot of Held / Building / Spec'd cards.
5. The assistant reads the journal at end-of-turn and updates Notion via `mcp__claude_ai_Notion__notion-update-page`, bumping `Status` if work has crossed a column boundary.

The hooks never write to Notion themselves - that work goes through the MCP server, which is the only path with auth.

## Columns

| Status   | Meaning                                                       |
|----------|---------------------------------------------------------------|
| Backlog  | Captured idea or parked feature, no spec yet                  |
| Spec'd   | Has a written spec or plan; ready to start                    |
| Building | Active on a branch                                            |
| Held     | Done locally, waiting on external gate (review, paired ship)  |
| Live     | Shipped to production                                         |

## Adding an item

Append to `items.json` under `items`:

```json
{
  "key": "stable-slug-do-not-change",
  "title": "Human-readable title",
  "status": "Backlog",
  "subproject": "Web",
  "priority": "P2",
  "type": ["Feature"],
  "runtime": null,
  "spec_link": null,
  "plan_link": null,
  "related_commits": null,
  "ota_build_ids": null,
  "blocker": null,
  "local_paths": ["app/foo/route.ts"],
  "summary": "One paragraph what + why.",
  "notion_page_id": null
}
```

Then run `/kanban-sync` (or just ask "sync the kanban"). It creates the Notion page and writes back the `notion_page_id`.

## Files

- `items.json` - local truth. Commit changes. Never edit `notion_page_id` by hand.
- `touched.log` - append-only journal from the hook. Gitignored. Cleared after each successful sync.

## Manual sync

```text
/kanban-sync
```

See `.claude/skills/kanban-sync/SKILL.md` for the runbook the assistant follows.
