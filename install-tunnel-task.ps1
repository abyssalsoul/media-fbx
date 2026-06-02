#Requires -Version 5.1
<#
.SYNOPSIS
    Enregistre une tâche planifiée Windows qui lance le tunnel Cloudflare
    automatiquement à l'ouverture de session.
.DESCRIPTION
    Lance cloudflared en arrière-plan au logon de l'utilisateur courant.
    Relancez ce script pour mettre à jour la tâche (si start-tunnel.ps1 a bougé).
.EXAMPLE
    .\install-tunnel-task.ps1
#>

$TaskName   = 'Maupiflix - Tunnel Cloudflare'
$ScriptPath = Join-Path $PSScriptRoot 'start-tunnel.ps1'

if (-not (Test-Path $ScriptPath)) {
    Write-Error "Introuvable : $ScriptPath"
    exit 1
}

$action  = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# -ExecutionTimeLimit 0 = pas de limite de durée
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

# Supprimer l'ancienne tâche si elle existe
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Ancienne tâche supprimée." -ForegroundColor Yellow
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action   $action `
    -Trigger  $trigger `
    -Settings $settings `
    -RunLevel Highest `
    | Out-Null

Write-Host "✓ Tâche planifiée créée : '$TaskName'" -ForegroundColor Green
Write-Host "  → Le tunnel démarrera automatiquement à chaque connexion." -ForegroundColor Cyan
Write-Host ""
Write-Host "Pour la supprimer : Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false" -ForegroundColor DarkGray
