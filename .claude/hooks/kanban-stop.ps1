# Stop hook. Runs once when Claude finishes a turn.
# If the kanban touched.log has unprocessed entries, this forces the assistant
# to keep going for one more turn to reconcile Notion. Without this, dirty
# entries can pile up if Claude finishes a turn without reading the
# PostToolUse additionalContext.
#
# The hook decision schema for Stop hooks is:
#   { "decision": "block", "reason": "<message that becomes the next prompt>" }

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path "$PSScriptRoot\..\..\").Path.TrimEnd('\','/')
$journalPath = Join-Path $repoRoot ".claude/kanban/touched.log"
$stopCookie = Join-Path $repoRoot ".claude/kanban/.stop-cookie"

function Emit-Empty {
    Write-Output '{}'
    exit 0
}

if (-not (Test-Path $journalPath)) { Emit-Empty }

$size = (Get-Item -LiteralPath $journalPath).Length
if ($size -le 0) { Emit-Empty }

# Avoid an infinite loop: only block once per dirty-state. Once we have asked
# the assistant to sync, mark the journal's mtime as "claimed". If Claude does
# not actually clear the journal on the next turn (sync failed or skipped), we
# will NOT block again on the same content.
$journalWriteTime = (Get-Item -LiteralPath $journalPath).LastWriteTimeUtc.Ticks
if (Test-Path $stopCookie) {
    $cookieTicks = [int64](Get-Content -LiteralPath $stopCookie -Raw)
    if ($cookieTicks -ge $journalWriteTime) { Emit-Empty }
}

$lines = Get-Content -LiteralPath $journalPath
$count = $lines.Count
$keys = @()
foreach ($l in $lines) {
    try {
        $obj = $l | ConvertFrom-Json
        if ($obj.item_key) { $keys += $obj.item_key }
    } catch {}
}
$uniqueKeys = $keys | Sort-Object -Unique
$keyList = ($uniqueKeys -join ', ')

[System.IO.File]::WriteAllText($stopCookie, $journalWriteTime.ToString())

$reason = "Kanban journal has $count unprocessed entry/entries (item keys: $keyList). Before ending the turn, invoke the kanban-sync skill: read .claude/kanban/touched.log + .claude/kanban/items.json, push deltas to Notion via the MCP (mcp__claude_ai_Notion__notion-update-page for existing cards, mcp__claude_ai_Notion__notion-create-pages for any '<untracked>' entries that look like real new work), then Clear-Content the journal. Report back which cards moved."

$out = @{
    decision = 'block'
    reason   = $reason
} | ConvertTo-Json -Compress -Depth 5

Write-Output $out
exit 0
