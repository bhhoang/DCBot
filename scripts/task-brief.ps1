# scripts/task-brief.ps1 — PowerShell port of the subagent-driven-development
# task-brief bash script. Extracts one task's full text from an implementation
# plan into a file the implementer reads in one call.
# Usage: powershell -File scripts/task-brief.ps1 PLAN_FILE TASK_NUMBER [OUTFILE]
param(
    [Parameter(Mandatory=$true)][string]$Plan,
    [Parameter(Mandatory=$true)][int]$TaskNum,
    [string]$OutFile
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Plan)) { Write-Error "no such plan file: $Plan"; exit 2 }
if (-not $OutFile) {
    $sddDir = git rev-parse --git-path sdd
    New-Item -ItemType Directory -Path $sddDir -Force | Out-Null
    $sddDir = (Resolve-Path $sddDir).Path
    $OutFile = Join-Path $sddDir "task-$TaskNum-brief.md"
}
$content = Get-Content -LiteralPath $Plan -Raw
$lines = $content -split "`n"
$brief = New-Object System.Collections.Generic.List[string]
$inFence = $false
$inTask = $false
foreach ($line in $lines) {
    $trimmed = $line.TrimEnd("`r")
    if ($trimmed -match '^```') {
        $inFence = -not $inFence
        if ($inTask) { $brief.Add($line) }
        continue
    }
    if (-not $inFence -and $line -match "^#+\s+Task\s+(\d+)") {
        $n = [int]$Matches[1]
        if ($n -eq $TaskNum) {
            $inTask = $true
            $brief.Add($line)
            continue
        } elseif ($inTask) {
            break
        }
    }
    if ($inTask) { $brief.Add($line) }
}
if ($brief.Count -eq 0) { Write-Error "task $TaskNum not found in $Plan"; exit 3 }
$brief | Set-Content -LiteralPath $OutFile
Write-Output "wrote ${OutFile}: $($brief.Count) lines"
