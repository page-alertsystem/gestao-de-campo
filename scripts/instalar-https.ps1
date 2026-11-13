# instalar-https.ps1
# Publica o SIGA com HTTPS no endereço fixo (padrão: https://siga.alertsystem.com.br).
#  1. baixa o Caddy (servidor web que emite e renova sozinho o certificado SSL gratuito Let's Encrypt);
#  2. cria a configuração: https://DOMINIO -> SIGA local (127.0.0.1:porta);
#  3. libera as portas 80 e 443 no Firewall do Windows;
#  4. registra a tarefa "SIGA - HTTPS (Caddy)" que liga junto com o Windows, mesmo sem ninguém logado;
#  5. liga e acompanha a emissão do certificado.
# Pré-requisito (TI): DNS do domínio apontando para o IP público e as portas 80 e 443 desse IP
# redirecionadas para este servidor.
param([string]$Dominio = 'siga.alertsystem.com.br')

$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Execute este script como Administrador.' }

$projeto = Split-Path -Parent $PSScriptRoot
$pastaCaddy = Join-Path $projeto '.tools\caddy'
$caddy = Join-Path $pastaCaddy 'caddy.exe'
$caddyfile = Join-Path $pastaCaddy 'Caddyfile'
$dados = Join-Path $projeto '.gio-data\caddy'
$logDir = Join-Path $projeto '.logs'
$logCaddy = Join-Path $logDir 'caddy.log'
$tarefa = 'SIGA - HTTPS (Caddy)'

function Porta {
  $linha = Get-Content (Join-Path $projeto '.env.server') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*GIO_PORT\s*=' } | Select-Object -First 1
  if ($linha) { return (($linha -replace '^\s*GIO_PORT\s*=\s*', '').Trim().Trim('"').Trim("'")) }
  return '4173'
}
$porta = Porta
$barra = { param($t) Write-Host ''; Write-Host "==> $t" -ForegroundColor Cyan }

& $barra 'Verificando o SIGA local'
try { $h = Invoke-RestMethod "http://127.0.0.1:$porta/api/health" -TimeoutSec 5; Write-Host "OK - SIGA respondendo na porta $porta." }
catch { throw "O SIGA não está respondendo em http://127.0.0.1:$porta. Ligue o SIGA pelo Painel antes de continuar." }

& $barra 'Verificando se as portas 80 e 443 estão livres'
$ocupadas = Get-NetTCPConnection -State Listen -LocalPort 80, 443 -ErrorAction SilentlyContinue |
  ForEach-Object { $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; [pscustomobject]@{ Porta = $_.LocalPort; Programa = if ($p) { $p.ProcessName } else { "PID $($_.OwningProcess)" } } } |
  Where-Object { $_.Programa -ne 'caddy' } | Sort-Object Porta, Programa -Unique
if ($ocupadas) {
  $ocupadas | ForEach-Object { Write-Host "  Porta $($_.Porta) em uso por: $($_.Programa)" -ForegroundColor Yellow }
  throw 'As portas 80/443 já estão em uso por outro programa (ex.: IIS - "W3SVC" ou "System"). Libere-as e rode de novo.'
}
Write-Host 'OK - portas livres.'

& $barra 'Instalando o Caddy'
New-Item -ItemType Directory -Path $pastaCaddy, $dados, $logDir -Force | Out-Null
if (-not (Test-Path $caddy)) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ProgressPreference = 'SilentlyContinue'
  # Versão mais recente; se a consulta falhar, usa a 2.10.2 (testada).
  $versao = 'v2.10.2'; $endereco = 'https://github.com/caddyserver/caddy/releases/download/v2.10.2/caddy_2.10.2_windows_amd64.zip'
  try {
    $release = Invoke-RestMethod 'https://api.github.com/repos/caddyserver/caddy/releases/latest' -Headers @{ 'User-Agent' = 'SIGA-instalador' } -TimeoutSec 20
    $asset = $release.assets | Where-Object { $_.name -like '*_windows_amd64.zip' } | Select-Object -First 1
    if ($asset) { $versao = $release.tag_name; $endereco = $asset.browser_download_url }
  } catch { }
  $zip = Join-Path $env:TEMP 'caddy_windows_amd64.zip'
  $extrair = Join-Path $env:TEMP ('caddy-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  Invoke-WebRequest $endereco -OutFile $zip -UseBasicParsing
  Expand-Archive $zip -DestinationPath $extrair -Force
  Copy-Item (Join-Path $extrair 'caddy.exe') $caddy -Force
  Remove-Item $zip, $extrair -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "OK - Caddy $versao instalado."
} else { Write-Host 'OK - Caddy já instalado.' }

& $barra "Configurando https://$Dominio"
$barraDados = $dados.Replace('\', '/')
$barraLog = $logCaddy.Replace('\', '/')
$conteudo = @"
{
	storage file_system "$barraDados"
	log {
		output file "$barraLog" {
			roll_size 10MiB
			roll_keep 5
		}
	}
}

$Dominio {
	encode zstd gzip
	header Strict-Transport-Security "max-age=31536000"
	reverse_proxy 127.0.0.1:$porta
}
"@
[IO.File]::WriteAllText($caddyfile, $conteudo, (New-Object Text.UTF8Encoding($false)))
$anterior = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
$validacao = & $caddy validate --config $caddyfile --adapter caddyfile 2>&1 | ForEach-Object { "$_" }
$codigo = $LASTEXITCODE; $ErrorActionPreference = $anterior
if ($codigo -ne 0) { $validacao | Select-Object -Last 5 | ForEach-Object { Write-Host "  $_" }; throw 'A configuração do Caddy é inválida.' }
Write-Host 'OK - configuração válida.'

& $barra 'Liberando as portas 80 e 443 no Firewall do Windows'
if (-not (Get-NetFirewallRule -DisplayName 'SIGA - HTTPS (80 e 443)' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'SIGA - HTTPS (80 e 443)' -Direction Inbound -Protocol TCP -LocalPort 80, 443 -Action Allow -Profile Any | Out-Null
}
Write-Host 'OK - regra de firewall criada.'

& $barra 'Registrando o início automático do HTTPS'
Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$acao = New-ScheduledTaskAction -Execute $caddy -Argument "run --config `"$caddyfile`" --adapter caddyfile" -WorkingDirectory $pastaCaddy
$gatilho = New-ScheduledTaskTrigger -AtStartup
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$conta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gatilho -Settings $ajustes -Principal $conta -Force | Out-Null
Start-ScheduledTask -TaskName $tarefa
Write-Host "OK - tarefa '$tarefa' registrada e iniciada."

& $barra 'Emitindo o certificado SSL (até 2 minutos)'
$resultado = 'aguardando'
for ($i = 1; $i -le 60 -and $resultado -eq 'aguardando'; $i++) {
  Start-Sleep -Seconds 2
  $texto = if (Test-Path $logCaddy) { Get-Content $logCaddy -Raw -ErrorAction SilentlyContinue } else { '' }
  if ($texto -match 'certificate obtained successfully|"msg":"certificate is valid|loading managed certificate|skipping obtaining') { $resultado = 'ok' }
  elseif ($texto -match 'could not get certificate from issuer|challenge failed|no solvers available|Timeout during connect|Connection refused|unauthorized') { $resultado = 'falha' }
}
Write-Host ''
if ($resultado -eq 'ok') {
  Write-Host "OK - Certificado emitido. Teste de um celular (4G) ou de fora da rede: https://$Dominio" -ForegroundColor Green
  Write-Host 'Quando abrir, rode scripts\usar-dominio-siga.ps1 para trocar os links do site do GitHub e do app para o endereço fixo.'
} elseif ($resultado -eq 'falha') {
  Write-Host 'O Let''s Encrypt NÃO conseguiu acessar este servidor pela internet.' -ForegroundColor Red
  Write-Host "Peça à TI para conferir: DNS $Dominio -> IP público, e redirecionamento das portas 80 e 443 desse IP para este servidor."
  Write-Host 'O Caddy continua tentando sozinho; assim que a TI liberar, o certificado sai sem rodar nada de novo.'
  if (Test-Path $logCaddy) { Get-Content $logCaddy -Tail 6 | ForEach-Object { Write-Host "  $_" } }
} else {
  Write-Host 'Ainda sem resposta do Let''s Encrypt. O Caddy continua tentando sozinho.' -ForegroundColor Yellow
  Write-Host "Acompanhe em: $logCaddy  — ou teste https://$Dominio de um celular em alguns minutos."
}
