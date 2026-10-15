# enviar-para-github.ps1
# Envia todas as alterações da pasta do GIO para a branch main do GitHub
# (o GitHub Pages republica o site e o /mobile em 1 a 3 minutos).
$ErrorActionPreference = 'Stop'
$projeto = Split-Path -Parent $PSScriptRoot
Set-Location $projeto
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

function Git([string[]]$argumentos) {
  $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $saida = & git @argumentos 2>&1 | ForEach-Object { "$_" }; $codigo = $LASTEXITCODE } finally { $ErrorActionPreference = $anterior }
  $saida | ForEach-Object { Write-Host "  $_" }
  if ($codigo -ne 0) { throw "O comando 'git $($argumentos -join ' ')' falhou." }
  return $saida
}

try {
  Write-Host '==> Buscando a versão atual do GitHub...' -ForegroundColor Cyan
  Git @('fetch', 'origin') | Out-Null

  Write-Host '==> Preparando as alterações em cima da main...' -ForegroundColor Cyan
  Git @('checkout', '-B', 'postgres') | Out-Null
  Git @('reset', 'origin/main') | Out-Null
  # Mantém o endereço do túnel que já está publicado no GitHub
  Git @('checkout', 'origin/main', '--', 'public/server-config.json') | Out-Null
  Git @('add', '-A') | Out-Null

  $mudancas = & git status --porcelain
  if (-not $mudancas) { Write-Host 'Nada para enviar: o GitHub já está atualizado.' -ForegroundColor Green }
  else {
    Write-Host "Arquivos que serão enviados: $(@($mudancas).Count)"
    $nome = (& git config user.name); if (-not $nome) { Git @('config', '--global', 'user.name', 'Servidor GIO') | Out-Null }
    $email = (& git config user.email); if (-not $email) { Git @('config', '--global', 'user.email', 'gio@alertsystem.com.br') | Out-Null }
    Git @('commit', '-m', ('GIO: atualização do servidor em ' + (Get-Date -Format 'dd/MM/yyyy HH:mm'))) | Out-Null

    Write-Host '==> Enviando para a main...' -ForegroundColor Cyan
    Git @('push', 'origin', 'HEAD:main') | Out-Null
    Git @('push', '--force', 'origin', 'HEAD:postgres') | Out-Null
    Write-Host ''
    Write-Host 'OK - Enviado! O GitHub Pages publica em 1 a 3 minutos:' -ForegroundColor Green
    Write-Host '  https://page-alertsystem.github.io/gestao-de-campo/'
    Write-Host '  https://page-alertsystem.github.io/gestao-de-campo/mobile/'
    Write-Host '  Acompanhe em: https://github.com/page-alertsystem/gestao-de-campo/actions'
  }
} catch {
  Write-Host ''
  Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ''
Read-Host 'Pressione Enter para fechar'
