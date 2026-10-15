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
$mobileIndex = Join-Path $projectDirectory 'mobile\index.html'
if (Test-Path -LiteralPath $mobileIndex) { $sourceFiles += Get-Item -LiteralPath $mobileIndex }
$latestSource = ($sourceFiles | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
$needsBuild = -not (Test-Path -LiteralPath $distIndex) -or (Get-Item -LiteralPath $distIndex).LastWriteTimeUtc -lt $latestSource

if ($needsBuild) {
  Push-Location $projectDirectory
  # Avisos que o compilador escreve na saída de erro não podem interromper o script.
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $nodeExecutable '.\node_modules\typescript\bin\tsc' -b 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao validar o projeto.' }
    & $nodeExecutable '.\node_modules\vite\bin\vite.js' build 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar a versão do servidor.' }
  } finally {
    $ErrorActionPreference = $previousPreference
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
$port = '4173'
$portLine = Get-Content -LiteralPath $environmentFile -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*GIO_PORT\s*=' } | Select-Object -First 1
if ($portLine) { $port = ($portLine -replace '^\s*GIO_PORT\s*=\s*', '').Trim().Trim('"').Trim("'") }

$health = $null
for ($attempt = 1; $attempt -le 30 -and -not $health; $attempt++) {
  Start-Sleep -Seconds 1
  if ($serverProcess.HasExited) { break }
  try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3 } catch { $health = $null }
}
if ($health) {
  Write-Host "Servidor GIO iniciado com sucesso (processo $($serverProcess.Id))."
  Write-Host "Acesso nesta máquina: http://127.0.0.1:$port/"
  Write-Host "Movidesk configurado: $($health.movideskConfigured)"
} else {
  throw 'O servidor não respondeu. Consulte .logs\gio-server-error.log.'
}
