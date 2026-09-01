param([switch]$Foreground)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }

if (-not (Test-Path -LiteralPath $nodeExecutable)) {
  throw 'Node.js não foi encontrado. Instale o Node.js LTS ou execute pelo ambiente do Codex.'
}

$environmentFile = Join-Path $projectDirectory '.env.server'
$environmentExample = Join-Path $projectDirectory '.env.server.example'
if (-not (Test-Path -LiteralPath $environmentFile)) {
  Copy-Item -LiteralPath $environmentExample -Destination $environmentFile
}

$distIndex = Join-Path $projectDirectory 'dist\index.html'
$sourceFiles = Get-ChildItem -LiteralPath (Join-Path $projectDirectory 'src') -Recurse -File
$sourceFiles += Get-ChildItem -LiteralPath (Join-Path $projectDirectory 'public') -Recurse -File
$sourceFiles += Get-Item -LiteralPath (Join-Path $projectDirectory 'index.html'), (Join-Path $projectDirectory 'vite.config.ts')
$latestSource = ($sourceFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
$needsBuild = -not (Test-Path -LiteralPath $distIndex) -or (Get-Item -LiteralPath $distIndex).LastWriteTimeUtc -lt $latestSource

if ($needsBuild) {
  Push-Location $projectDirectory
  try {
    & $nodeExecutable '.\node_modules\typescript\bin\tsc' -b
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao validar o projeto.' }
    & $nodeExecutable '.\node_modules\vite\bin\vite.js' build
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar a versão do servidor.' }
  } finally {
    Pop-Location
  }
}

$pidFile = Join-Path $projectDirectory '.gio-server.pid'
if (Test-Path -LiteralPath $pidFile) {
  $existingPid = [int](Get-Content -LiteralPath $pidFile -Raw)
  if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
    Write-Host "O servidor GIO já está em execução (processo $existingPid)."
    exit 0
  }
  Remove-Item -LiteralPath $pidFile -Force
}

if ($Foreground) {
  Push-Location $projectDirectory
  try { & $nodeExecutable '.\server\local-server.mjs' } finally { Pop-Location }
  exit $LASTEXITCODE
}

$logDirectory = Join-Path $projectDirectory '.logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList '.\server\local-server.mjs' -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'gio-server.log') -RedirectStandardError (Join-Path $logDirectory 'gio-server-error.log') -PassThru
Set-Content -LiteralPath $pidFile -Value $serverProcess.Id
Start-Sleep -Milliseconds 900

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/health' -TimeoutSec 5
  Write-Host "Servidor GIO iniciado com sucesso (processo $($serverProcess.Id))."
  Write-Host 'Acesso nesta máquina: http://127.0.0.1:4173/'
  Write-Host "Movidesk configurado: $($health.movideskConfigured)"
} catch {
  throw 'O processo iniciou, mas o teste de acesso ao servidor falhou. Consulte .logs\gio-server-error.log.'
}
