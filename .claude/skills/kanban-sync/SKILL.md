---
name: kanban-sync
description: Reconcile this project's program board (Notion) with the local items.json manifest and the touched.log journal produced by the PostToolUse hook. Use when the user types /kanban-sync, says "sync the board" or "update the kanban", or when a PostToolUse hook has appended to .claude/kanban/touched.log and a turn is ending. Also use when an item is added to or modified in .claude/kanban/items.json and needs to flow to Notion.
---

# kanban-sync - runbook

You are reconciling three sources of truth:

1. **`.claude/kanban/items.json`** - the local manifest. The `notion.data_source_id` field is the Notion data source for this project. Each item has `key`, `status`, `notion_page_id`, plus properties.
2. **`.claude/kanban/touched.log`** - append-only journal of `(ts, path, item_key)` written by the PostToolUse hook on every Edit/Write that hit a tracked path.
3. **Notion data source** (read from items.json) - what the user sees.

## Sync algorithm

For each entry in `items.json`:

- **If `notion_page_id` is null:** create a new Notion page under the data source via `mcp__claude_ai_Notion__notion-create-pages`. Save the returned `id` back into `items.json` under that item's `notion_page_id`. Use the property mapping below.
- **If `notion_page_id` is set AND the item was touched (appears in `touched.log` since the last sync, OR has had any field change since the last commit):** update the page via `mcp__claude_ai_Notion__notion-update-page` with `command: "update_properties"`. Only send properties that changed.

After applying all updates:

- Clear `.claude/kanban/touched.log` (truncate to empty, do not delete the file).
- Report back: which items were created, which were updated, what status transitions happened.

## When the user opens a new turn after editing items.json

If you see `items.json` was just edited but no `touched.log` exists, still run the sync - diff `items.json` against what Notion has for each `notion_page_id`. Use `mcp__claude_ai_Notion__notion-fetch` to get current Notion state for a single page.

## Property mapping (items.json -> Notion property)

| items.json field   | Notion property      | Type          | Notes                                                  |
|--------------------|----------------------|---------------|--------------------------------------------------------|
| `title`            | Title                | title         | inline markdown ok                                     |
| `status`           | Status               | select        | one of Backlog, Spec'd, Building, Held, Live           |
| `subproject`       | Subproject           | select        | adjust options to match this project                   |
| `priority`         | Priority             | select        | P0, P1, P2, P3                                         |
| `type` (array)     | Type                 | multi_select  | pass as JSON-array string, e.g. `"[\"Bug\"]"`          |
| `runtime`          | Runtime              | select        | optional; project-specific version names               |
| `estimated_hours`  | Estimated hours      | number        | JS number, not string                                  |
| `spec_link`        | Spec link            | url           | prepend `https://github.com/<owner>/<repo>/blob/main/` if path-style |
| `plan_link`        | Plan link            | url           | same prefix logic                                      |
| `related_commits`  | Related commits      | text          | comma-separated short SHAs                             |
| `ota_build_ids`    | OTA / Build IDs      | text          | optional; rename for non-mobile projects               |
| `blocker`          | Blocker              | text          | why is it not progressing?                             |
| `local_paths`      | Local paths          | text          | comma-separated, forward slashes                       |
| `key`              | Item key             | text          | never change after first sync - that's the join key    |

Body content is the `summary` field, optionally followed by a "## References" section and a "## Blocker" section if present.

## Status transition rules of thumb

Heuristics, confirm with the user before bumping a non-obvious status:

- **Backlog -> Spec'd:** new `docs/superpowers/specs/*.md` or `docs/specs/*.md` referencing the item
- **Spec'd -> Building:** first edit to a file in the item's `local_paths`
- **Building -> Held:** mention of build submission, PR opened, awaiting external gate
- **Held -> Live:** user confirms shipped / merged
- **Live (terminal):** do not auto-revert; only the user moves Live items

## Adding a new item mid-session

If the user describes work that isn't in `items.json`, append it (full schema, `notion_page_id: null`), then sync. Don't retro-fit into an existing card unless obviously the same work.

## Cleanup

After every sync:

```powershell
Clear-Content .claude/kanban/touched.log
```

## Output format

Tight summary:

```
Kanban synced:
- Updated: <n> items (<list keys with status transitions>)
- Created: <n> items (<list keys>)
- Journal cleared.
```

Do not narrate every individual MCP call.
