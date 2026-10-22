# enviar-para-github.ps1
# Envia todas as alterações da pasta do GIO para a branch main do GitHub
# (o GitHub Pages republica o site e o /mobile em 1 a 3 minutos).
$ErrorActionPreference = 'Stop'
$projeto = Split-Path -Parent $PSScriptRoot
Set-Location $projeto
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

function RodarGit([string[]]$argumentos) {
  $anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $saida = & git @argumentos 2>&1 | ForEach-Object { "$_" }; $codigo = $LASTEXITCODE } finally { $ErrorActionPreference = $anterior }
  $saida | ForEach-Object { Write-Host "  $_" }
  if ($codigo -ne 0) { throw "O comando 'git $($argumentos -join ' ')' falhou." }
  return $saida
}

try {
  Write-Host '==> Buscando a versão atual do GitHub...' -ForegroundColor Cyan
  RodarGit @('fetch', 'origin') | Out-Null

  Write-Host '==> Preparando as alterações em cima da main...' -ForegroundColor Cyan
  RodarGit @('checkout', '-B', 'postgres') | Out-Null
  RodarGit @('reset', 'origin/main') | Out-Null
  # Mantém o endereço do túnel que já está publicado no GitHub
  RodarGit @('checkout', 'origin/main', '--', 'public/server-config.json') | Out-Null
  RodarGit @('add', '-A') | Out-Null

  $mudancas = & git status --porcelain
  if (-not $mudancas) { Write-Host 'Nada para enviar: o GitHub já está atualizado.' -ForegroundColor Green }
  else {
    Write-Host "Arquivos que serão enviados: $(@($mudancas).Count)"
    $nome = (& git config user.name); if (-not $nome) { RodarGit @('config', '--global', 'user.name', 'Servidor GIO') | Out-Null }
    $email = (& git config user.email); if (-not $email) { RodarGit @('config', '--global', 'user.email', 'gio@alertsystem.com.br') | Out-Null }
    RodarGit @('commit', '-m', ('SIGA: atualização do servidor em ' + (Get-Date -Format 'dd/MM/yyyy HH:mm'))) | Out-Null

    Write-Host '==> Enviando para a main...' -ForegroundColor Cyan
    RodarGit @('push', 'origin', 'HEAD:main') | Out-Null
    RodarGit @('push', '--force', 'origin', 'HEAD:postgres') | Out-Null
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
