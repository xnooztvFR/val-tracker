#Requires -Version 7
<#
TODO Distribution/build/release : brouillon de changelog FR généré depuis `git log`, pour
réduire la friction de rédaction avant `scripts/release.ps1 -NotesFileFr/-NotesFileEn` — ne
remplace pas la relecture humaine (voir avertissement affiché en sortie). Groupe les commits
par préfixe conventionnel (`feat:`, `fix:`, `chore:`...) façon Keep a Changelog. N'écrit rien
sur disque : affiche le brouillon dans le terminal, à copier/adapter dans le fichier passé à
`-NotesFileFr` ensuite.
#>
param(
    # Tag de départ (exclu) — par défaut, le dernier tag `v*` atteignable depuis HEAD.
    [string]$Since
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $Since) {
    $Since = git describe --tags --abbrev=0 --match "v*" 2>$null
    if (-not $Since) {
        throw "Aucun tag 'v*' trouvé — passe -Since explicitement (ex: -Since v0.3.0)."
    }
}

$range = "$Since..HEAD"
$commits = git log $range --oneline --no-merges --pretty=format:"%s"
if (-not $commits) {
    Write-Host "Aucun commit entre $Since et HEAD." -ForegroundColor Yellow
    exit 0
}

# Mapping préfixe conventionnel -> titre de section FR, dans l'ordre d'affichage souhaité.
$sections = [ordered]@{
    "feat"     = "Nouveautés"
    "fix"      = "Corrections"
    "perf"     = "Performance"
    "refactor" = "Refactorisation"
    "docs"     = "Documentation"
    "chore"    = "Divers"
    "other"    = "Autres changements"
}
$grouped = [ordered]@{}
foreach ($key in $sections.Keys) { $grouped[$key] = @() }

foreach ($line in $commits) {
    $matched = $false
    foreach ($prefix in @("feat", "fix", "perf", "refactor", "docs", "chore")) {
        if ($line -match "^$prefix(\(.+\))?:\s*(.+)$") {
            $grouped[$prefix] += $Matches[2]
            $matched = $true
            break
        }
    }
    if (-not $matched) { $grouped["other"] += $line }
}

Write-Host "== Brouillon de changelog ($range) — À RELIRE ET CORRIGER avant usage ==" -ForegroundColor Cyan
Write-Host ""
foreach ($key in $grouped.Keys) {
    if ($grouped[$key].Count -eq 0) { continue }
    Write-Host "## $($sections[$key])"
    foreach ($entry in $grouped[$key]) {
        Write-Host "- $entry"
    }
    Write-Host ""
}
Write-Host "Rappel : ce brouillon est une traduction littérale des messages de commit, pas un" -ForegroundColor Yellow
Write-Host "changelog utilisateur. Reformule pour un lecteur non technique, retire le bruit" -ForegroundColor Yellow
Write-Host "(chore/refactor internes sans impact visible), et rédige la version EN séparément" -ForegroundColor Yellow
Write-Host "avant de passer -NotesFileFr/-NotesFileEn à scripts/release.ps1." -ForegroundColor Yellow
