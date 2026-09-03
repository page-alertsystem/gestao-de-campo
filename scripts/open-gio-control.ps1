$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
$controlUrl = 'http://127.0.0.1:4180/'
$statusUrl = 'http://127.0.0.1:4180/api/status'

if (-not (Test-Path -LiteralPath $nodeExecutable)) {
  throw 'Node.js não foi encontrado. Instale o Node.js LTS ou execute pelo ambiente do Codex.'
}

$controllerOnline = $false
try {
  $null = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 2
  $controllerOnline = $true
} catch {}

if (-not $controllerOnline) {
  $logDirectory = Join-Path $projectDirectory '.logs'
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  $process = Start-Process -FilePath $nodeExecutable -ArgumentList '.\server\control-panel.mjs' -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'gio-control.log') -RedirectStandardError (Join-Path $logDirectory 'gio-control-error.log') -PassThru
  Set-Content -LiteralPath (Join-Path $projectDirectory '.gio-control.pid') -Value $process.Id

  for ($attempt = 0; $attempt -lt 20 -and -not $controllerOnline; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $null = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 2
      $controllerOnline = $true
    } catch {}
  }
}

if (-not $controllerOnline) {
  throw 'Não foi possível iniciar a Central de Controle GIO. Consulte .logs\gio-control-error.log.'
}

Start-Process $controlUrl

