#Requires -Version 5.1
<#
.SYNOPSIS
    Scanne le partage Freebox et génère films.json
.DESCRIPTION
    Récupère la liste des fichiers/dossiers à la racine, explore chaque
    sous-dossier récursivement (max 3 niveaux), et écrit :
      - films.json       : catalogue complet avec contenu des dossiers
.EXAMPLE
    .\update_catalog.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Configuration ────────────────────────────────────────────────────────────
$BASE     = 'http://91.163.2.157:35907/share/fU07_4Ej17-jFYh3/'
$OUT_JSON = Join-Path $PSScriptRoot '..\data\films.json'
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

# ── Extraction du nom de série ────────────────────────────────────────────────
$TECH_TOKENS = 'MULTi|TRUEFRENCH|FRENCH|VOSTFR|SUBFRENCH|FASTSUB|VFF|VF2|VFQ|VFi|VOF|PROPER|REPACK|' +
               '1080p|720p|2160p|4K|BluRay|BDRip|WEB[-.]DL|WEBRip|WEBrip|HDRip|HDLight|mHD|' +
               'x264|x265|H264|H265|H\.264|H\.265|AV1|AC3|DTS|AAC|EAC3|DDP|HEVC|HDR|DV|DOLBY|Atmos|' +
               'BRrip|DVDRip|DVD5|MPEG2|XviD|SUPPLY|FW|LOST|PATOPESTO|NoTag|TyHD|Frosties|SERQPH'

function Get-SeriesName([string]$name) {
    $base = $null
    if ($name -match '^(.+?)[._\s]S\d{2}E\d{2}') {
        $base = $Matches[1]
    } elseif ($name -match '^(.+?)[._\s]S\d{2}[._\s]') {
        $base = $Matches[1]
    }
    if (-not $base) { return $null }

    # Nettoyer séparateurs
    $base = $base -replace '[._]', ' '
    # Supprimer tiret(s) en fin (avec espaces éventuels autour)
    $base = $base -replace '[\s\-]+$', ''
    # Supprimer (2019) en fin
    $base = $base -replace '\s*\(\d{4}\)\s*$', ''
    # Supprimer année seule en fin
    $base = $base -replace '\s+\d{4}\s*$', ''
    # Normaliser espaces multiples
    $base = $base -replace '\s{2,}', ' '
    $base = $base.Trim()
    return $base
}

# ── Scan de la racine ─────────────────────────────────────────────────────────
Write-Host "Scan de $BASE" -ForegroundColor Cyan
$rootEntries = Get-DirEntries $BASE
Write-Host "$($rootEntries.Count) entrées trouvées à la racine`n"

# Première passe : scanner tous les dossiers
$scanned = [System.Collections.Generic.List[hashtable]]::new()
$i = 0

foreach ($e in $rootEntries) {
    $i++
    $pct = [int]($i * 100 / $rootEntries.Count)
    Write-Progress -Activity 'Scan Freebox' -Status "($i/$($rootEntries.Count)) $($e.Name)" -PercentComplete $pct

    if ($e.IsDir) {
        $folderUrl = $BASE + [uri]::EscapeDataString($e.Name) + '/'
        $files     = @(Get-VideoFiles $folderUrl)
        $seriesName = Get-SeriesName $e.Name
        # Si le dossier n'a pas de nom de série mais que ses fichiers contiennent SxxExx → détecter via le premier fichier
        if (-not $seriesName -and $files.Count -gt 0) {
            $firstFile = $files[0] -replace '^.+/', ''  # nom seul sans sous-dossier
            $seriesName = Get-SeriesName $firstFile
        }
        $scanned.Add(@{ Type = 'd'; Name = $e.Name; Files = $files; SeriesName = $seriesName })
        Write-Host "  [d] $($e.Name) ($($files.Count) fichiers)$(if($seriesName){" → série: $seriesName"})" -ForegroundColor DarkGray
    } else {
        # Fichier racine : vérifier si c'est un épisode de série
        $seriesName = Get-SeriesName $e.Name
        $scanned.Add(@{ Type = 'f'; Name = $e.Name; Files = @(); SeriesName = $seriesName })
        Write-Host "  [f] $($e.Name)$(if($seriesName){" → série: $seriesName"})" -ForegroundColor DarkGray
    }
}

Write-Progress -Completed -Activity 'Scan Freebox'

# Deuxième passe : regrouper les épisodes par série
$seriesGroups = @{}
$nonSeries    = [System.Collections.Generic.List[hashtable]]::new()

foreach ($item in $scanned) {
    if ($item.SeriesName) {
        if ($item.Type -eq 'd' -and $item.Files.Count -gt 0) {
            # Dossier série
            if (-not $seriesGroups.ContainsKey($item.SeriesName)) {
                $seriesGroups[$item.SeriesName] = [System.Collections.Generic.List[string]]::new()
            }
            foreach ($f in $item.Files) {
                $seriesGroups[$item.SeriesName].Add("$($item.Name)/$f")
            }
        } elseif ($item.Type -eq 'f') {
            # Fichier racine épisode
            if (-not $seriesGroups.ContainsKey($item.SeriesName)) {
                $seriesGroups[$item.SeriesName] = [System.Collections.Generic.List[string]]::new()
            }
            $seriesGroups[$item.SeriesName].Add($item.Name)
        } else {
            $nonSeries.Add($item)
        }
    } else {
        $nonSeries.Add($item)
    }
}

# Construction du JSON final
$jsonLines = [System.Collections.Generic.List[string]]::new()

# Séries regroupées (type "s")
foreach ($kv in $seriesGroups.GetEnumerator() | Sort-Object Key) {
    $filesJson = ($kv.Value | Sort-Object | ForEach-Object { "`"$(EscapeJson $_)`"" }) -join ','
    $jsonLines.Add("[`"s`",`"$(EscapeJson $kv.Key)`",[$filesJson]]")
    Write-Host "  [s] $($kv.Key) ($($kv.Value.Count) épisodes)" -ForegroundColor Cyan
}

# Films et dossiers non-série
foreach ($item in $nonSeries) {
    if ($item.Type -eq 'd') {
        $filesJson = ($item.Files | ForEach-Object { "`"$(EscapeJson $_)`"" }) -join ','
        $jsonLines.Add("[`"d`",`"$(EscapeJson $item.Name)`",[$filesJson]]")
    } else {
        $jsonLines.Add("[`"f`",`"$(EscapeJson $item.Name)`"]")
    }
}

# ── Écriture des fichiers ─────────────────────────────────────────────────────
$json = "[`n  $([string]::Join(",`n  ", $jsonLines))`n]"

# films.json (UTF-8 sans BOM)
[System.IO.File]::WriteAllText($OUT_JSON, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "`n✓ $OUT_JSON ($($jsonLines.Count) entrées)" -ForegroundColor Green
Write-Host "`nRelancez ce script à chaque ajout de contenu sur le partage." -ForegroundColor Yellow
