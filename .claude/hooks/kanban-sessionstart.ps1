# SessionStart hook. Emits a compact snapshot of the BabyNames Kanban so the
# assistant starts every session knowing what's in flight, what's held, and
# what's blocked. This is the read-side of the kanban automation loop.
#
# Output is hookSpecificOutput.additionalContext, which is injected into the
# first assistant turn as context.

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path "$PSScriptRoot\..\..\").Path.TrimEnd('\','/')
$itemsPath = Join-Path $repoRoot ".claude/kanban/items.json"

function Emit-Empty { Write-Output '{}'; exit 0 }

if (-not (Test-Path $itemsPath)) { Emit-Empty }

$data = $null
try {
    $data = [System.IO.File]::ReadAllText($itemsPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json -ErrorAction Stop
} catch { Emit-Empty }
if (-not $data.items) { Emit-Empty }

$prioRank = @{ 'P0' = 0; 'P1' = 1; 'P2' = 2; 'P3' = 3 }
function Sort-Items($list) {
    $list | Sort-Object @{ Expression = { $prioRank[$_.priority] }; Ascending = $true }, @{ Expression = { $_.title }; Ascending = $true }
}

$held     = @(Sort-Items ($data.items | Where-Object { $_.status -eq 'Held' }))
$building = @(Sort-Items ($data.items | Where-Object { $_.status -eq 'Building' }))
$specd    = @(Sort-Items ($data.items | Where-Object { $_.status -eq "Spec'd" }))

# Force array wrap so single-element Where-Object results still expose .Count
# (PS 5.1 quirk: a single PSCustomObject has no .Count property).
$counts = @{}
foreach ($s in @('Backlog',"Spec'd",'Building','Held','Live')) {
    $counts[$s] = @($data.items | Where-Object { $_.status -eq $s }).Count
}

$lines = @()
$lines += "## BabyNames Program Board snapshot"
$lines += ""
$lines += "Board: https://www.notion.so/34a3c01e9353476d9a974d61009c1bb3"
$lines += "Local manifest: .claude/kanban/items.json (authoritative)"
$lines += ""
$lines += "Counts: Backlog $($counts['Backlog']) | Spec'd $($counts["Spec'd"]) | Building $($counts['Building']) | Held $($counts['Held']) | Live $($counts['Live'])"
$lines += ""

if ($held.Count -gt 0) {
    $lines += "### Held (awaiting external gate)"
    foreach ($i in $held) {
        $b = if ($i.blocker) { " - Blocker: $($i.blocker)" } else { "" }
        $lines += "- [$($i.priority)] $($i.title)$b"
    }
    $lines += ""
}
if ($building.Count -gt 0) {
    $lines += "### Building"
    foreach ($i in $building) {
        $r = if ($i.runtime) { " (runtime $($i.runtime))" } else { "" }
        $lines += "- [$($i.priority)] $($i.title)$r"
    }
    $lines += ""
}
if ($specd.Count -gt 0) {
    $lines += "### Spec'd (ready to start)"
    foreach ($i in $specd) {
        $lines += "- [$($i.priority)] $($i.title)"
    }
    $lines += ""
}

$lines += "Policy: I manage this board (see memory: project_kanban_automation_policy). PostToolUse + Stop hooks keep it in sync. Karo gives input; I move cards."

$msg = ($lines -join "`n")

$out = @{
    hookSpecificOutput = @{
        hookEventName     = 'SessionStart'
        additionalContext = $msg
    }
} | ConvertTo-Json -Compress -Depth 5

Write-Output $out
exit 0
