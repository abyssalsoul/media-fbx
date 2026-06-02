# start-tunnel.ps1 — Démarre le tunnel Cloudflare Maupiflix

Write-Host "Arrêt du tunnel existant..." -ForegroundColor Yellow
taskkill /F /IM cloudflared.exe 2>$null

Write-Host "Démarrage du tunnel..." -ForegroundColor Green
Start-Process -NoNewWindow cloudflared -ArgumentList "tunnel --config `"$env:USERPROFILE\.cloudflared\config.yml`" run maupiflix"

Write-Host "Tunnel démarré ✓" -ForegroundColor Green
Write-Host "stream.maupiflix.com  → Freebox" -ForegroundColor Cyan
Write-Host "jellyfin.maupiflix.com → Jellyfin" -ForegroundColor Cyan
