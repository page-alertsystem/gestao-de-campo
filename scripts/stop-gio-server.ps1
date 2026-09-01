$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectDirectory '.gio-server.pid'

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host 'O servidor GIO não está em execução.'
  exit 0
}

$serverPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $serverPid
  $null = $process.WaitForExit(5000)
}
Remove-Item -LiteralPath $pidFile -Force
Write-Host 'Servidor GIO encerrado.'
