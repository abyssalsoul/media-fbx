#Requires -Version 5.1
<#
.SYNOPSIS
    Scanne le partage Freebox et génère films.json + films-data.js
.DESCRIPTION
    Récupère la liste des fichiers/dossiers à la racine, explore chaque
    sous-dossier récursivement (max 3 niveaux), et écrit :
      - films.json       : catalogue complet avec contenu des dossiers
      - films-data.js    : idem + clé TMDB, pour usage en file://
.EXAMPLE
    .\update_catalog.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Configuration ────────────────────────────────────────────────────────────
$BASE     = 'http://91.163.2.157:35907/share/fU07_4Ej17-jFYh3/'
$OUT_JSON = Join-Path $PSScriptRoot 'films.json'
$OUT_JS   = Join-Path $PSScriptRoot 'films-data.js'
$KEY_FILE = Join-Path $PSScriptRoot 'tmdb.key'
$VIDEO    = @('.mkv', '.mp4', '.avi', '.mov')

# ── Helpers ──────────────────────────────────────────────────────────────────
function EscapeJson([string]$s) {
    $s.Replace('\','\\').Replace('"','\"').Replace("`r",'').Replace("`n",'\n').Replace("`t",'\t')
}

function Get-DirEntries([string]$url) {
    $html = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15).Content
    $re   = [regex]'href="([^"?#]+)"'
    $seen = [System.Collections.Generic.HashSet[string]]::new()
    $list = [System.Collections.Generic.List[hashtable]]::new()

    foreach ($m in $re.Matches($html)) {
        $raw = $m.Groups[1].Value
        # Ignorer liens de navigation et absolus
        if ($raw -in '../','./','/' -or
            $raw.StartsWith('/') -or
            $raw.StartsWith('http') -or
            $raw.StartsWith('?')) { continue }

        $clean = if ($raw.StartsWith('./')) { $raw.Substring(2) } else { $raw }
        if (-not $clean -or -not $seen.Add($clean)) { continue }   # dédoublonnage (icône + texte)

        $isDir = $clean.EndsWith('/')
        $name  = [uri]::UnescapeDataString($clean.TrimEnd('/'))
        $ext   = [System.IO.Path]::GetExtension($name).ToLower()

        if ($isDir -or $ext -in $VIDEO) {
            $list.Add(@{ Name = $name; IsDir = $isDir })
        }
    }
    return $list
}

# Scan récursif d'un dossier → liste de chemins relatifs (ex: "S01/ep1.mkv")
function Get-VideoFiles([string]$baseUrl, [string]$prefix = '', [int]$depth = 0) {
    if ($depth -gt 3) { return @() }
    $entries = @()
    try   { $entries = Get-DirEntries $baseUrl }
    catch { Write-Warning "  Inaccessible : $baseUrl"; return @() }

    $result = [System.Collections.Generic.List[string]]::new()
    foreach ($e in $entries) {
        if ($e.IsDir) {
            $subUrl = $baseUrl + [uri]::EscapeDataString($e.Name) + '/'
            $subPfx = if ($prefix) { "$prefix/$($e.Name)" } else { $e.Name }
            foreach ($f in (Get-VideoFiles $subUrl $subPfx ($depth + 1))) {
                $result.Add($f)
            }
        } else {
            $rel = if ($prefix) { "$prefix/$($e.Name)" } else { $e.Name }
            $result.Add($rel)
        }
    }
    return $result.ToArray()
}

# ── Scan de la racine ─────────────────────────────────────────────────────────
Write-Host "Scan de $BASE" -ForegroundColor Cyan
$rootEntries = Get-DirEntries $BASE
Write-Host "$($rootEntries.Count) entrées trouvées à la racine`n"

$jsonLines = [System.Collections.Generic.List[string]]::new()
$i = 0

foreach ($e in $rootEntries) {
    $i++
    $pct = [int]($i * 100 / $rootEntries.Count)
    Write-Progress -Activity 'Scan Freebox' -Status "($i/$($rootEntries.Count)) $($e.Name)" -PercentComplete $pct

    if ($e.IsDir) {
        $folderUrl = $BASE + [uri]::EscapeDataString($e.Name) + '/'
        $files     = @(Get-VideoFiles $folderUrl)   # @() garantit un tableau même à 1 élément
        $filesJson = ($files | ForEach-Object { "`"$(EscapeJson $_)`"" }) -join ','
        $jsonLines.Add("[`"d`",`"$(EscapeJson $e.Name)`",[$filesJson]]")
        Write-Host "  [d] $($e.Name) ($($files.Count) fichiers)" -ForegroundColor DarkGray
    } else {
        $jsonLines.Add("[`"f`",`"$(EscapeJson $e.Name)`"]")
        Write-Host "  [f] $($e.Name)" -ForegroundColor DarkGray
    }
}

Write-Progress -Completed -Activity 'Scan Freebox'

# ── Écriture des fichiers ─────────────────────────────────────────────────────
$json = "[`n  $([string]::Join(",`n  ", $jsonLines))`n]"

# films.json (UTF-8 sans BOM)
[System.IO.File]::WriteAllText($OUT_JSON, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "`n✓ $OUT_JSON ($($jsonLines.Count) entrées)" -ForegroundColor Green

# films-data.js (UTF-8 sans BOM)
$token = ''
if (Test-Path $KEY_FILE) { $token = (Get-Content $KEY_FILE -Encoding UTF8).Trim() }
$js = "/* films-data.js — généré par update_catalog.ps1 le $(Get-Date -Format 'yyyy-MM-dd HH:mm') */`n"
$js += "window.FILMS_DATA = $json;`n"
if ($token) { $js += "window.TMDB_KEY_DATA = '$(EscapeJson $token)';`n" }
[System.IO.File]::WriteAllText($OUT_JS, $js, [System.Text.UTF8Encoding]::new($false))
Write-Host "✓ $OUT_JS mis à jour" -ForegroundColor Green
Write-Host "`nRelancez ce script à chaque ajout de contenu sur le partage." -ForegroundColor Yellow
