# PostToolUse hook for Edit | Write | NotebookEdit.
# Reads the touched file path from $env:CLAUDE_TOOL_INPUT_FILE_PATH (stdin JSON
# is also accepted as a fallback). Matches that path against the `local_paths`
# array of each entry in .claude/kanban/items.json. If any item matches, append
# a journal line and emit hookSpecificOutput.additionalContext so the assistant
# sees the kanban needs a sync.
#
# The hook never blocks tool execution and never writes to Notion itself —
# Claude (with the MCP) does the actual Notion update at the end of the turn.

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path "$PSScriptRoot\..\..\").Path.TrimEnd('\','/')
$itemsPath = Join-Path $repoRoot ".claude/kanban/items.json"
$journalPath = Join-Path $repoRoot ".claude/kanban/touched.log"

function Emit-Empty {
    Write-Output '{}'
    exit 0
}

if (-not (Test-Path $itemsPath)) { Emit-Empty }

# Parse the hook payload from stdin. Claude Code passes a JSON object that
# includes tool_input.file_path for Edit/Write/NotebookEdit calls.
$payload = $null
try {
    $stdin = [Console]::In.ReadToEnd()
    if ($stdin -and $stdin.Trim().Length -gt 0) {
        $payload = $stdin | ConvertFrom-Json -ErrorAction Stop
    }
} catch {
    $payload = $null
}

$touched = $null
if ($payload -and $payload.tool_input -and $payload.tool_input.file_path) {
    $touched = [string]$payload.tool_input.file_path
}
if (-not $touched -and $env:CLAUDE_TOOL_INPUT_FILE_PATH) {
    $touched = $env:CLAUDE_TOOL_INPUT_FILE_PATH
}
if (-not $touched) { Emit-Empty }

# Normalise to a forward-slash relative path against the repo root so it
# matches items.json entries authored in POSIX style.
$touchedFull = $null
try {
    $touchedFull = (Resolve-Path -LiteralPath $touched -ErrorAction Stop).Path
} catch {
    $touchedFull = $touched
}
$rel = $touchedFull
if ($touchedFull.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    $rel = $touchedFull.Substring($repoRoot.Length).TrimStart('\','/')
}
$relPosix = $rel -replace '\\','/'

# Skip writes inside .claude/kanban itself — would create a feedback loop on
# every sync.
if ($relPosix -like '.claude/kanban/*') { Emit-Empty }

$items = $null
try {
    $items = [System.IO.File]::ReadAllText($itemsPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json -ErrorAction Stop
} catch {
    Emit-Empty
}
if (-not $items.items) { Emit-Empty }

$hits = @()
foreach ($item in $items.items) {
    if (-not $item.local_paths) { continue }
    foreach ($p in $item.local_paths) {
        if (-not $p) { continue }
        $pNorm = ($p -replace '\\','/').TrimEnd('/')
        $rNorm = $relPosix.TrimEnd('/')
        $isDirPath = $p.EndsWith('/')
        if ($isDirPath) {
            if ($rNorm -like ($pNorm + '/*') -or $rNorm -eq $pNorm) {
                $hits += $item; break
            }
        } else {
            if ($rNorm -eq $pNorm -or $rNorm -like ($pNorm + '/*')) {
                $hits += $item; break
            }
        }
    }
}

# Patterns that indicate a NEW unit of work, even when no item.local_paths matches.
# When these match, emit an "untracked" signal so the assistant auto-creates a card.
# Adapted for names-match: Next.js App Router routes/screens, the future Expo app,
# and the superpowers spec/plan dirs.
$untrackedSignals = @(
    @{ pattern = '^docs/superpowers/specs/.+\.md$';   kind = 'new-spec';     suggestedStatus = "Spec'd" }
    @{ pattern = '^docs/superpowers/plans/.+\.md$';   kind = 'new-plan';     suggestedStatus = "Spec'd" }
    @{ pattern = '^app/api/.+/route\.ts$';            kind = 'new-route';    suggestedStatus = 'Building' }
    @{ pattern = '^app/[^/]+/page\.tsx$';             kind = 'new-page';     suggestedStatus = 'Building' }
    @{ pattern = '^apps/mobile/.+\.(ts|tsx)$';        kind = 'mobile-work';  suggestedStatus = 'Building' }
    @{ pattern = '^db/migrations/.+\.sql$';           kind = 'db-migration'; suggestedStatus = 'Building' }
)

$untracked = $null
if ($hits.Count -eq 0) {
    foreach ($sig in $untrackedSignals) {
        if ($relPosix -match $sig.pattern) { $untracked = $sig; break }
    }
    if (-not $untracked) { Emit-Empty }
}

$ts = (Get-Date).ToString('o')
foreach ($m in $hits) {
    $line = @{
        ts        = $ts
        path      = $relPosix
        item_key  = $m.key
        title     = $m.title
        status    = $m.status
    } | ConvertTo-Json -Compress
    Add-Content -LiteralPath $journalPath -Value $line -Encoding utf8
}
if ($untracked) {
    $line = @{
        ts              = $ts
        path            = $relPosix
        item_key        = '<untracked>'
        kind            = $untracked.kind
        suggestedStatus = $untracked.suggestedStatus
    } | ConvertTo-Json -Compress
    Add-Content -LiteralPath $journalPath -Value $line -Encoding utf8
}

if ($hits.Count -gt 0) {
    $keys = ($hits | ForEach-Object { $_.key }) -join ', '
    $titles = ($hits | ForEach-Object { "[$($_.status)] $($_.title)" }) -join '; '
    $msg = "Kanban dirty (tracked): edited '$relPosix' touched item(s): $keys. Active card(s): $titles. MANDATORY at end of turn: invoke the kanban-sync skill to push deltas to Notion via mcp__claude_ai_Notion__notion-update-page, bump status if the work crossed a column boundary, then clear .claude/kanban/touched.log."
} else {
    $msg = "Kanban dirty (untracked, kind=$($untracked.kind)): edited '$relPosix' but no items.json card claims this path. MANDATORY at end of turn: invoke the kanban-sync skill to (a) decide whether this is a new unit of work, (b) if yes, append a new entry to .claude/kanban/items.json with suggestedStatus=$($untracked.suggestedStatus) and create the Notion page via mcp__claude_ai_Notion__notion-create-pages, (c) if not, ignore. Then clear .claude/kanban/touched.log."
}

$out = @{
    hookSpecificOutput = @{
        hookEventName     = 'PostToolUse'
        additionalContext = $msg
    }
} | ConvertTo-Json -Compress -Depth 5

Write-Output $out
exit 0
