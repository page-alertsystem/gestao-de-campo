# usar-dominio-siga.ps1
# Passa a usar o endereço fixo (https://siga.alertsystem.com.br) em vez do túnel provisório:
#  - grava em public/server-config.json (na main do GitHub) o servidor, o site, o mobile e o app Android;
#  - fecha o túnel provisório e desliga a publicação automática por túnel.
param([string]$Dominio = 'siga.alertsystem.com.br')
$ErrorActionPreference = 'Stop'
$projeto = Split-Path -Parent $PSScriptRoot
Set-Location $projeto
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$base = "https://$Dominio"

function Executar([string]$exe, [string[]]$argumentos) {
  $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $saida = & $exe @argumentos 2>&1 | ForEach-Object { "$_" }; $codigo = $LASTEXITCODE } finally { $ErrorActionPreference = $anterior }
  $saida | ForEach-Object { Write-Host "  $_" }
  if ($codigo -ne 0) { throw "O comando '$exe $($argumentos -join ' ')' falhou." }
}

$json = "{`n  ""apiBaseUrl"": ""$base"",`n  ""desktopUrl"": ""$base/"",`n  ""mobileUrl"": ""$base/mobile/"",`n  ""androidApkUrl"": ""$base/mobile/siga-mobile.apk""`n}`n"
$utf8 = New-Object Text.UTF8Encoding($false)

Write-Host '==> Atualizando os endereços no GitHub (branch main)...' -ForegroundColor Cyan
$temp = Join-Path $env:TEMP ('siga-dominio-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
Executar git @('fetch', 'origin', 'main')
try {
  Executar git @('worktree', 'add', '--detach', $temp, 'origin/main')
  $destino = Join-Path $temp 'public\server-config.json'
  $atual = if (Test-Path $destino) { [IO.File]::ReadAllText($destino) } else { '' }
  if (($atual -replace "`r", '').Trim() -eq ($json -replace "`r", '').Trim()) { Write-Host 'O GitHub já usa o endereço fixo.' }
  else {
    [IO.File]::WriteAllText($destino, $json, $utf8)
    Executar git @('-C', $temp, 'add', '--', 'public/server-config.json')
    Executar git @('-C', $temp, '-c', 'user.name=Servidor SIGA', '-c', 'user.email=gio@alertsystem.com.br', 'commit', '-m', "chore: SIGA passa a usar $base", '--only', '--', 'public/server-config.json')
    Executar git @('-C', $temp, 'push', 'origin', 'HEAD:main')
    Write-Host 'OK - endereços enviados ao GitHub.'
  }
} finally {
  $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  & git worktree remove --force $temp 2>&1 | Out-Null
  & git worktree prune 2>&1 | Out-Null
  $ErrorActionPreference = $anterior
}
$configDist = Join-Path $projeto 'dist\server-config.json'
if (Test-Path (Split-Path $configDist)) { [IO.File]::WriteAllText($configDist, $json, $utf8) }

Write-Host '==> Desligando o túnel provisório...' -ForegroundColor Cyan
# Primeiro as marcas: o início automático e o botão "Publicar" deixam de usar o túnel.
Set-Content -Path (Join-Path $projeto '.siga-dominio') -Value $Dominio -Encoding ASCII
Remove-Item (Join-Path $projeto '.gio-publicar-internet') -Force -ErrorAction SilentlyContinue
$pidFile = Join-Path $projeto '.gio-tunnel.pid'
$tuneis = @(Get-Process cloudflared -ErrorAction SilentlyContinue)
$falhou = $false
foreach ($t in $tuneis) {
  try { Stop-Process -Id $t.Id -Force -ErrorAction Stop } catch { $falhou = $true }
}
if ($falhou) {
  Write-Host 'Não foi possível fechar o túnel antigo (precisa de Administrador). Ele deixa de ser usado e some no próximo reinício do Windows.' -ForegroundColor Yellow
} else {
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  Write-Host 'OK - túnel provisório fechado.'
}

Write-Host ''
Write-Host "OK - O SIGA agora usa o endereço fixo: $base" -ForegroundColor Green
Write-Host "  Site:   $base/"
Write-Host "  Mobile: $base/mobile/"
Write-Host '  O link antigo do GitHub Pages continua funcionando (usa o mesmo servidor).'
