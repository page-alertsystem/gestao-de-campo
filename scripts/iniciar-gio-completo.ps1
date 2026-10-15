# iniciar-gio-completo.ps1 - usado pelo início automático do Windows:
# liga o PostgreSQL, o servidor GIO e (se estava publicado) o túnel da internet.
$ErrorActionPreference = 'Continue'
$projeto = Split-Path -Parent $PSScriptRoot
Set-Location $projeto
$log = Join-Path $projeto '.logs\gio-inicio-automatico.log'
New-Item -ItemType Directory -Path (Split-Path $log) -Force | Out-Null
function Registrar($texto) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'dd/MM/yyyy HH:mm:ss'), $texto) }

$svc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if ($svc -and $svc.Status -ne 'Running') { Start-Service $svc.Name; Start-Sleep -Seconds 5; Registrar "PostgreSQL iniciado ($($svc.Name))." }

try { & (Join-Path $PSScriptRoot 'start-gio-server.ps1') *>&1 | ForEach-Object { Registrar "$_" } }
catch { Registrar "Falha ao ligar o GIO: $($_.Exception.Message)" }

if (Test-Path (Join-Path $projeto '.gio-publicar-internet')) {
  try { & (Join-Path $PSScriptRoot 'publicar-internet.ps1') *>&1 | ForEach-Object { Registrar "$_" } }
  catch { Registrar "Falha ao publicar na internet: $($_.Exception.Message)" }
}
