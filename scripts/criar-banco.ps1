<#
.SYNOPSIS
    Cria o usuário e o banco `trimly` no PostgreSQL local e escreve o `.env`.

.DESCRIPTION
    Roda uma vez, na máquina onde o banco mora. Pede a senha do superusuário
    `postgres` (que só é usada aqui e não fica gravada em lugar nenhum), gera
    uma senha aleatória para o usuário `trimly` e aplica as migrações.

    O usuário `trimly` é dono apenas do banco `trimly`: não é superusuário e
    não enxerga os outros bancos do servidor. Ele tem CREATEDB porque o
    `prisma migrate dev` cria um banco-sombra temporário para calcular o diff.

    Se o `.env` já tiver DATABASE_URL, o script para: sobrescrever a senha
    deixaria o app sem conseguir entrar num banco que já existe.

.EXAMPLE
    .\scripts\criar-banco.ps1
#>

[CmdletBinding()]
param(
    [string]$Hospedeiro = "127.0.0.1",
    [int]$Porta = 5432
)

$ErrorActionPreference = "Stop"
$RAIZ = Split-Path -Parent $PSScriptRoot
$ENV_ARQUIVO = Join-Path $RAIZ ".env"

function Erro([string]$t) { Write-Host "  x $t" -ForegroundColor Red }
function Feito([string]$t) { Write-Host "  - $t" -ForegroundColor Green }

if ((Test-Path $ENV_ARQUIVO) -and (Select-String -Path $ENV_ARQUIVO -Pattern '^\s*DATABASE_URL\s*=' -Quiet)) {
    Erro "O .env já tem DATABASE_URL. Nada a fazer."
    exit 1
}

# Procurado na máquina, e não fixado: a versão instalada pode mudar.
$psql = (Get-Command psql.exe -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $psql = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
        Sort-Object { [int]$_.Name } -Descending |
        ForEach-Object { Join-Path $_.FullName "bin\psql.exe" } |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1
}
if (-not $psql) { Erro "Não achei o psql. O PostgreSQL está instalado?"; exit 1 }

$segura = Read-Host "Senha do usuário 'postgres'" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))

# Só letras e números: a senha vai dentro de uma URL e de um literal SQL, e
# assim nenhum dos dois precisa de escape.
$caracteres = [char[]]"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$senhaApp = -join ($bytes | ForEach-Object { $caracteres[$_ % $caracteres.Length] })

function Sql([string]$comando, [string]$banco = "postgres") {
    $antes = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $saida = & $psql -h $Hospedeiro -p $Porta -U postgres -d $banco -v ON_ERROR_STOP=1 -tAc $comando 2>&1
    } finally { $ErrorActionPreference = $antes }
    if ($LASTEXITCODE -ne 0) { throw ($saida | Out-String).Trim() }
    return ($saida | Out-String).Trim()
}

try {
    if ((Sql "SELECT 1 FROM pg_roles WHERE rolname = 'trimly'") -eq "1") {
        # O papel já existe (de uma tentativa anterior): trocar a senha é o
        # único jeito de o .env novo conseguir entrar.
        Sql "ALTER ROLE trimly WITH LOGIN CREATEDB PASSWORD '$senhaApp'" | Out-Null
        Feito "usuário trimly já existia — senha redefinida"
    } else {
        Sql "CREATE ROLE trimly WITH LOGIN CREATEDB PASSWORD '$senhaApp'" | Out-Null
        Feito "usuário trimly criado"
    }

    if ((Sql "SELECT 1 FROM pg_database WHERE datname = 'trimly'") -eq "1") {
        Feito "banco trimly já existia"
    } else {
        Sql "CREATE DATABASE trimly OWNER trimly ENCODING 'UTF8' TEMPLATE template0" | Out-Null
        Feito "banco trimly criado"
    }
} catch {
    Erro $_.Exception.Message
    exit 1
} finally {
    $env:PGPASSWORD = ""
}

# timezone=UTC na conexão: o driver manda timestamps sem rótulo de fuso, e com
# a sessão em America/Sao_Paulo o Postgres os leria como hora local — tudo
# gravado 3 horas deslocado, em silêncio. (Lição aprendida no NihongoHub.)
$url = "postgresql://trimly:$senhaApp@${Hospedeiro}:$Porta/trimly?options=-c%20timezone%3DUTC"
# UTF-8 sem BOM: o `-Encoding utf8` do PowerShell 5.1 põe BOM, e o Node leria
# a primeira chave como "﻿DATABASE_URL" — variável que ninguém procura.
[IO.File]::AppendAllText($ENV_ARQUIVO, "DATABASE_URL=`"$url`"`r`n", (New-Object Text.UTF8Encoding $false))
Feito ".env escrito"

Push-Location (Join-Path $RAIZ "apps\api")
try {
    & npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { Erro "As migrações falharam."; exit 1 }
    Feito "migrações aplicadas"
} finally { Pop-Location }

Write-Host ""
Write-Host "Pronto! Agora é só dar dois cliques no Trimly.cmd." -ForegroundColor Cyan
