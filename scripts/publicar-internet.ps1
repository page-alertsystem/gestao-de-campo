# publicar-internet.ps1
# Publica o GIO na internet para o link do GitHub Pages
# (https://page-alertsystem.github.io/gestao-de-campo/):
#  1. abre um túnel seguro (Cloudflare) até o servidor local;
#  2. grava o endereço do túnel em public/server-config.json;
#  3. envia só esse arquivo para a branch main do GitHub, sem mexer na pasta de trabalho;
#  4. o GitHub Pages republica o site em 1 a 3 minutos.
param([switch]$SemEnviarAoGitHub)

$ErrorActionPreference = 'Stop'
$projeto = Split-Path -Parent $PSScriptRoot
Set-Location $projeto

$pastaTools = Join-Path $projeto '.tools'
$cloudflared = Join-Path $pastaTools 'cloudflared.exe'
$pidFile = Join-Path $projeto '.gio-tunnel.pid'
$logDir = Join-Path $projeto '.logs'
$logFile = Join-Path $logDir 'gio-tunnel.log'
$configDist = Join-Path $projeto 'dist\server-config.json'
$linkPages = 'https://page-alertsystem.github.io/gestao-de-campo/'

function Porta {
  $linha = Get-Content (Join-Path $projeto '.env.server') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*GIO_PORT\s*=' } | Select-Object -First 1
  if ($linha) { return (($linha -replace '^\s*GIO_PORT\s*=\s*', '').Trim().Trim('"').Trim("'")) }
  return '4173'
}
function Executar([string]$exe, [string[]]$argumentos) {
  $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $saida = & $exe @argumentos 2>&1 | ForEach-Object { "$_" }; $codigo = $LASTEXITCODE } finally { $ErrorActionPreference = $anterior }
  $saida | ForEach-Object { Write-Host "  $_" }
  if ($codigo -ne 0) { throw "O comando '$exe $($argumentos -join ' ')' falhou." }
}

$porta = Porta
try { $null = Invoke-RestMethod "http://127.0.0.1:$porta/api/health" -TimeoutSec 5 }
catch { throw "O GIO não está respondendo em http://127.0.0.1:$porta. Ligue o GIO antes de publicar." }

# 1. cloudflared
if (-not (Test-Path $cloudflared)) {
  Write-Host '==> Baixando o cloudflared (túnel seguro da Cloudflare)...'
  New-Item -ItemType Directory -Path $pastaTools -Force | Out-Null
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared -UseBasicParsing
}

# 2. Túnel (reaproveita se já estiver no ar)
$url = $null
if (Test-Path $pidFile) {
  $pidAntigo = [int](Get-Content $pidFile -Raw)
  $processo = Get-Process -Id $pidAntigo -ErrorAction SilentlyContinue
  if ($processo -and $processo.ProcessName -eq 'cloudflared' -and (Test-Path $logFile)) {
    $url = (Select-String -Path $logFile -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | Select-Object -Last 1).Matches.Value | Select-Object -Last 1
    if ($url) { Write-Host "Túnel já estava no ar: $url" }
  }
  if (-not $url) {
    if ($processo -and $processo.ProcessName -eq 'cloudflared') { Stop-Process -Id $pidAntigo -Force }
    Remove-Item $pidFile -Force
  }
}

if (-not $url) {
  Write-Host '==> Abrindo o túnel...'
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  if (Test-Path $logFile) { Remove-Item $logFile -Force }
  $processo = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$porta") `
    -WindowStyle Hidden -RedirectStandardError $logFile -RedirectStandardOutput (Join-Path $logDir 'gio-tunnel-out.log') -PassThru
  Set-Content -Path $pidFile -Value $processo.Id
  for ($i = 1; $i -le 60 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    if ($processo.HasExited) { break }
    if (Test-Path $logFile) {
      $texto = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
      if ($texto -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $url = $Matches[0] }
    }
  }
  if (-not $url) {
    $fim = if (Test-Path $logFile) { (Get-Content $logFile -Tail 15) -join "`n" } else { '' }
    throw "Não foi possível abrir o túnel (rede bloqueando a Cloudflare?).`n$fim"
  }
  Write-Host "Túnel aberto: $url"
}

# 3. Testa o túnel de ponta a ponta
Write-Host '==> Testando o acesso pela internet...'
$ok = $false
for ($i = 1; $i -le 30 -and -not $ok; $i++) {
  try { $h = Invoke-RestMethod "$url/api/health" -TimeoutSec 5; $ok = $h.application -eq 'GIO' } catch { Start-Sleep -Seconds 2 }
}
if (-not $ok) { throw "O túnel abriu, mas o GIO não respondeu por $url." }
Write-Host 'OK - GIO acessível pela internet.'

# 4. Grava o endereço
# Mantém os outros endereços (desktopUrl, mobileUrl, androidApkUrl) e troca só o da API.
function Montar-Config([string]$textoAtual) {
  $config = [ordered]@{ apiBaseUrl = $url; desktopUrl = ''; mobileUrl = ''; androidApkUrl = '' }
  if ($textoAtual) {
    try { $lido = $textoAtual | ConvertFrom-Json; foreach ($p in $lido.PSObject.Properties) { if ($p.Name -ne 'apiBaseUrl') { $config[$p.Name] = [string]$p.Value } } } catch { }
  }
  $linhas = @(); foreach ($k in $config.Keys) { $linhas += ('  "{0}": "{1}"' -f $k, ([string]$config[$k]).Replace('\', '\\').Replace('"', '\"')) }
  return "{`n" + ($linhas -join ",`n") + "`n}`n"
}
$json = Montar-Config 
$utf8 = New-Object Text.UTF8Encoding($false)
# (o arquivo da pasta de trabalho não é alterado, para não bloquear atualizações; vale o que está no GitHub)
if (Test-Path (Split-Path $configDist)) { [IO.File]::WriteAllText($configDist, $json, $utf8) }

if ($SemEnviarAoGitHub) { Write-Host "Túnel no ar: $url (sem enviar ao GitHub)."; return }

# 5. Envia só o server-config.json para a main, usando uma cópia temporária do repositório
Write-Host '==> Atualizando o endereço no GitHub (branch main)...'
$temp = Join-Path $env:TEMP ("gio-publicar-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
Executar git @('fetch', 'origin', 'main')
try {
  Executar git @('worktree', 'add', '--detach', $temp, 'origin/main')
  $destino = Join-Path $temp 'public\server-config.json'
  $atual = if (Test-Path $destino) { [IO.File]::ReadAllText($destino) } else { '' }
  $json = Montar-Config $atual
  if ($atual.Trim() -eq $json.Trim()) {
    Write-Host 'O GitHub já tem esse endereço.'
  } else {
    New-Item -ItemType Directory -Path (Split-Path $destino) -Force | Out-Null
    [IO.File]::WriteAllText($destino, $json, $utf8)
    Executar git @('-C', $temp, 'add', '--', 'public/server-config.json')
    Executar git @('-C', $temp, '-c', 'user.name=Servidor GIO', '-c', 'user.email=gio@alertsystem.com.br', 'commit', '-m', 'chore: atualiza endereço do servidor GIO', '--only', '--', 'public/server-config.json')
    Executar git @('-C', $temp, 'push', 'origin', 'HEAD:main')
    Write-Host 'OK - Endereço enviado. O GitHub Pages republica o site em 1 a 3 minutos.'
  }
} finally {
  $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  & git worktree remove --force $temp 2>&1 | Out-Null
  & git worktree prune 2>&1 | Out-Null
  $ErrorActionPreference = $anterior
}
Write-Host "Link para os usuários: $linkPages"
