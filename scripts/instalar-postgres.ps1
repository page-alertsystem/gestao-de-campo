# instalar-postgres.ps1
# Instala o PostgreSQL nesta maquina (se ainda nao existir), cria o banco "gio"
# com um usuario proprio, grava o DATABASE_URL no .env.server, importa os dados
# do banco antigo (SQLite), recompila e reinicia o servidor GIO.
# Uso: botao direito > "Executar com o PowerShell"  (ou rode como administrador)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

function Passo($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Atualiza-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User") }
function Senha-Aleatoria([int]$tamanho = 24) {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.ToCharArray()
    $bytes = New-Object byte[] $tamanho
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}
function Acha-Psql {
    Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
        Sort-Object { [version](($_.Directory.Parent.Name -replace '[^0-9.]', '') + '.0') } -Descending |
        Select-Object -First 1
}
function Psql([string]$sql, [string]$banco = 'postgres', [switch]$valor) {
    $parametros = @('-U', 'postgres', '-h', '127.0.0.1', '-p', '5432', '-d', $banco, '-v', 'ON_ERROR_STOP=1')
    if ($valor) { $parametros += @('-tAc', $sql) } else { $parametros += @('-c', $sql) }
    $saida = & $script:psqlExe @parametros
    if ($LASTEXITCODE -ne 0) { throw "Falha ao executar no PostgreSQL: $sql" }
    return $saida
}

$projeto  = Split-Path -Parent $PSScriptRoot
$envFile  = Join-Path $projeto '.env.server'
$dataDir  = Join-Path $projeto '.gio-data'
$credFile = Join-Path $dataDir 'credenciais-postgres.txt'

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    Atualiza-Path
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

    # 1. PostgreSQL ------------------------------------------------------------
    $psql = Acha-Psql
    $superSenha = $null
    if ($psql) {
        Passo "PostgreSQL ja instalado: $($psql.Directory.Parent.FullName)"
        $seguro = Read-Host "Digite a senha do usuario 'postgres' (superusuario) desta instalacao" -AsSecureString
        $superSenha = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro))
    } else {
        Passo "Procurando o instalador do PostgreSQL..."
        $url = $null
        foreach ($major in 18, 17) {
            for ($minor = 12; $minor -ge 0; $minor--) {
                foreach ($build in 1, 2) {
                    $candidato = "https://get.enterprisedb.com/postgresql/postgresql-$major.$minor-$build-windows-x64.exe"
                    try {
                        $r = Invoke-WebRequest $candidato -Method Head -UseBasicParsing -TimeoutSec 15
                        if ($r.StatusCode -eq 200) { $url = $candidato; break }
                    } catch { }
                }
                if ($url) { break }
            }
            if ($url) { break }
        }
        if (-not $url) {
            throw "Nao foi possivel baixar o PostgreSQL (get.enterprisedb.com bloqueado ou indisponivel). Instale manualmente pelo site postgresql.org/download/windows e rode este script de novo."
        }
        Write-Host "    $url"
        $exe = Join-Path $env:TEMP 'postgresql-setup.exe'
        Invoke-WebRequest $url -OutFile $exe -UseBasicParsing

        $superSenha = Senha-Aleatoria
        Passo "Instalando o PostgreSQL (pode levar alguns minutos)..."
        $p = Start-Process $exe -ArgumentList @('--mode', 'unattended', '--unattendedmodeui', 'none', '--superpassword', $superSenha, '--serverport', '5432', '--disable-components', 'stackbuilder') -Wait -PassThru
        if ($p.ExitCode -ne 0) { throw "O instalador do PostgreSQL terminou com erro (codigo $($p.ExitCode))." }
        $psql = Acha-Psql
        if (-not $psql) { throw "PostgreSQL instalado, mas o psql.exe nao foi encontrado." }
    }
    $script:psqlExe = $psql.FullName
    $env:PGPASSWORD = $superSenha
    Psql 'SELECT version()' -valor | Out-Null
    Write-Host "    Conectado ao PostgreSQL." -ForegroundColor Green

    # 2. Banco e usuario do GIO -------------------------------------------------
    Passo "Criando o banco 'gio' e o usuario 'gio'..."
    $gioSenha = Senha-Aleatoria
    Psql 'DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ''gio'') THEN CREATE ROLE gio LOGIN; END IF; END $$;' | Out-Null
    Psql "ALTER ROLE gio WITH LOGIN PASSWORD '$gioSenha'" | Out-Null
    $existe = Psql "SELECT 1 FROM pg_database WHERE datname = 'gio'" -valor
    if (-not $existe) { Psql "CREATE DATABASE gio OWNER gio ENCODING 'UTF8' TEMPLATE template0" | Out-Null }
    Psql 'REVOKE ALL ON DATABASE gio FROM PUBLIC' | Out-Null
    Remove-Item Env:\PGPASSWORD

    # 3. Credenciais ------------------------------------------------------------
    $linhas = @(
        "Credenciais do PostgreSQL do GIO - gerado em $(Get-Date -Format 'dd/MM/yyyy HH:mm')",
        "Guarde em um cofre de senhas e apague este arquivo depois.",
        "",
        "Superusuario: postgres",
        "Senha:        $superSenha",
        "",
        "Usuario do GIO: gio",
        "Senha:          $gioSenha",
        "Banco:          gio  (127.0.0.1:5432)"
    )
    [IO.File]::WriteAllLines($credFile, $linhas, (New-Object Text.UTF8Encoding($false)))

    # 4. DATABASE_URL no .env.server -------------------------------------------
    Passo "Gravando DATABASE_URL no .env.server..."
    $conteudo = @()
    if (Test-Path $envFile) { $conteudo = [IO.File]::ReadAllLines($envFile) | Where-Object { $_ -notmatch '^\s*DATABASE_URL\s*=' } }
    $conteudo += "DATABASE_URL=postgres://gio:$gioSenha@127.0.0.1:5432/gio"
    [IO.File]::WriteAllLines($envFile, $conteudo, (New-Object Text.UTF8Encoding($false)))

    # 5. Dependencias, migracao e build ----------------------------------------
    Set-Location $projeto
    Atualiza-Path
    Passo "Instalando dependencias (pnpm install)..."
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "Falha no pnpm install." }

    Passo "Criando as tabelas e importando os dados do banco antigo..."
    node scripts\migrar-sqlite-para-postgres.mjs
    if ($LASTEXITCODE -ne 0) { throw "Falha na migracao." }

    Passo "Compilando o GIO (pnpm build)..."
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "Falha no build." }

    # 6. Reinicia o servidor ----------------------------------------------------
    Passo "Reiniciando o servidor GIO..."
    & (Join-Path $PSScriptRoot 'stop-gio-server.ps1') 2>$null
    & (Join-Path $PSScriptRoot 'start-gio-server.ps1')

    Passo "Pronto! O GIO agora usa o PostgreSQL."
    Write-Host ""
    Write-Host "Senhas do banco salvas em: $credFile" -ForegroundColor Yellow
    Write-Host "Copie para um cofre de senhas e apague esse arquivo." -ForegroundColor Yellow
}
catch {
    Write-Host ""
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Read-Host "Pressione Enter para fechar"
