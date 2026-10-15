# parar-publicacao.ps1 - fecha o túnel da internet (o GIO continua funcionando na rede interna)
$ErrorActionPreference = 'Stop'
$projeto = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projeto '.gio-tunnel.pid'
if (-not (Test-Path $pidFile)) { Write-Host 'O GIO não está publicado na internet.'; exit 0 }
$id = [int](Get-Content $pidFile -Raw)
$processo = Get-Process -Id $id -ErrorAction SilentlyContinue
if ($processo -and $processo.ProcessName -eq 'cloudflared') { Stop-Process -Id $id -Force }
Remove-Item $pidFile -Force
Write-Host 'Publicação na internet encerrada. O link do GitHub ficará indisponível até publicar de novo.'
