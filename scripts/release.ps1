#Requires -Version 7
<#
Build + publie une release GitHub (installeurs signés + latest.json) sans jamais pousser
le code source : le dépôt xnooztvFR/val-tracker ne sert que de point de distribution.
Nécessite `gh auth login` fait au préalable.
#>
param(
    [switch]$Draft = $true
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$keyPath = "$env:USERPROFILE\.tauri\val-tracker.key"
$keyPasswordPath = "$env:USERPROFILE\.tauri\val-tracker.key.password.txt"
if (-not (Test-Path $keyPath) -or -not (Test-Path $keyPasswordPath)) {
    throw "Clé de signature updater introuvable ($keyPath). Voir README.md > Signature."
}

# signtool.exe (Authenticode) vient du Windows SDK mais n'est pas ajouté au PATH par défaut.
$signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) {
    throw "signtool.exe introuvable — installe le Windows SDK (composant 'Windows SDK Signing Tools')."
}
$env:PATH = "$($signtool.DirectoryName);$env:PATH"

$conf = Get-Content "$root\src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$version = $conf.version
$repo = "xnooztvFR/val-tracker"
$tag = "v$version"

Write-Host "== Build release $tag ==" -ForegroundColor Cyan

if (gh release view $tag --repo $repo 2>$null) {
    throw "La release $tag existe déjà sur $repo. Monte la version dans src-tauri/tauri.conf.json et package.json d'abord."
}

$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyPath -Raw)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content $keyPasswordPath -Raw).Trim()

npm run tauri build
if ($LASTEXITCODE -ne 0) { throw "Le build a échoué." }

$bundleDir = "$root\src-tauri\target\release\bundle"
# Le dossier bundle/ accumule les artefacts des builds précédents (Tauri ne les nettoie pas) —
# filtrer par version exacte, sinon `Select-Object -First 1` sur un tri alphabétique par défaut
# peut renvoyer un ancien binaire (ex. 0.1.0 trié avant 0.1.1) alors que tauri.conf.json est à jour.
$nsisExe = Get-ChildItem "$bundleDir\nsis\*_${version}_*.exe" | Select-Object -First 1
$nsisSig = Get-ChildItem "$bundleDir\nsis\*_${version}_*.exe.sig" | Select-Object -First 1
$msi = Get-ChildItem "$bundleDir\msi\*_${version}_*.msi" | Select-Object -First 1
$msiSig = Get-ChildItem "$bundleDir\msi\*_${version}_*.msi.sig" | Select-Object -First 1

if (-not $nsisExe -or -not $nsisSig) {
    throw "Artefact NSIS (.exe/.sig) introuvable dans $bundleDir\nsis — vérifie bundle.targets et createUpdaterArtifacts dans tauri.conf.json."
}

# windows-x86_64 pointe vers le NSIS (updater silencieux) ; le MSI reste dispo en asset
# pour une installation manuelle mais n'est pas utilisé par l'auto-update.
# GitHub remplace les espaces des noms de fichiers par des points à l'upload — l'URL doit
# refléter le nom final, sinon l'updater obtient un 404.
$signature = (Get-Content $nsisSig.FullName -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$nsisAssetName = $nsisExe.Name -replace " ", "."

$latestJson = [ordered]@{
    version  = $version
    notes    = "Voir les changements de cette version."
    pub_date = $pubDate
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = $signature
            url       = "https://github.com/$repo/releases/download/$tag/$nsisAssetName"
        }
    }
} | ConvertTo-Json -Depth 5

$latestJsonPath = "$bundleDir\latest.json"
Set-Content -Path $latestJsonPath -Value $latestJson -NoNewline

$assets = @($nsisExe.FullName, $nsisSig.FullName, $latestJsonPath)
if ($msi) { $assets += $msi.FullName }
if ($msiSig) { $assets += $msiSig.FullName }

Write-Host "== Publication de $tag sur $repo (brouillon) ==" -ForegroundColor Cyan
$draftFlag = if ($Draft) { "--draft" } else { $null }

gh release create $tag @assets `
    --repo $repo `
    --title "Valorant Tracker $tag" `
    --notes "Voir les changements de cette version." `
    $draftFlag

Write-Host "Release $tag créée en brouillon. Vérifie les notes et les assets sur GitHub avant de la publier." -ForegroundColor Green
