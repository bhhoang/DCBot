# scripts/review-package.ps1 — PowerShell port of the subagent-driven-development
# review-package bash script. Generates a review package file with commits, file
# stats, and full diff with extended context.
# Usage: powershell -File scripts/review-package.ps1 BASE HEAD [OUTFILE]
param(
    [Parameter(Mandatory=$true)][string]$Base,
    [Parameter(Mandatory=$true)][string]$Head,
    [string]$OutFile
)
$ErrorActionPreference = 'Stop'
git rev-parse --verify --quiet $Base | Out-Null; if ($LASTEXITCODE) { Write-Error "bad BASE: $Base"; exit 2 }
git rev-parse --verify --quiet $Head | Out-Null; if ($LASTEXITCODE) { Write-Error "bad HEAD: $Head"; exit 2 }
if (-not $OutFile) {
    $sddDir = git rev-parse --git-path sdd
    New-Item -ItemType Directory -Path $sddDir -Force | Out-Null
    $sddDir = (Resolve-Path $sddDir).Path
    $base7 = (& git rev-parse --short $Base) 2>$null
    $head7 = (& git rev-parse --short $Head) 2>$null
    $OutFile = Join-Path $sddDir "review-${base7}..${head7}.diff"
}
$Range = "${Base}..${Head}"
$commitsLog = (& git log --oneline $Range) 2>$null
$statOutput = (& git diff --stat $Range) 2>$null
$diffOutput = (& git diff -U10 $Range) 2>$null
$header = "# Review package: $Range`n`n## Commits`n${commitsLog}`n`n## Files changed`n${statOutput}`n`n## Diff`n"
Set-Content -LiteralPath $OutFile -Value $header -NoNewline
Add-Content -LiteralPath $OutFile -Value $diffOutput
$commits = (& git rev-list --count $Range).ToString()
$bytes = (Get-Item -LiteralPath $OutFile).Length
Write-Output "wrote ${OutFile}: $commits commit(s), $bytes bytes"
