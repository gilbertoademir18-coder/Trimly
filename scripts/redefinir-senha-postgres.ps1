<#
.SYNOPSIS
    Redefine a senha do superusuário `postgres` quando ela foi esquecida.

.DESCRIPTION
    O caminho padrão, feito com segurança:

      1. guarda uma cópia do pg_hba.conf;
      2. põe no topo uma linha que deixa SÓ o usuário `postgres` entrar sem
         senha, e SÓ a partir desta máquina (127.0.0.1) — nada pelo tailnet;
      3. recarrega a configuração (reload, não restart: os outros apps que
         usam o Postgres nem percebem);
      4. define a senha nova;
      5. devolve o pg_hba.conf original e recarrega de novo — num `finally`,
         então a brecha fecha mesmo se algo der errado no meio.

    Mexer só na senha do `postgres` não afeta os usuários dos outros apps
    (trimly, nihongohub, mediaflow...): cada um tem a sua.

    Precisa de PowerShell como administrador: o pg_hba.conf fica em
    Program Files.

.EXAMPLE
    .\scripts\redefinir-senha-postgres.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Erro([string]$t) { Write-Host "  x $t" -ForegroundColor Red }
function Feito([string]$t) { Write-Host "  - $t" -ForegroundColor Green }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Erro "Rode este script num PowerShell aberto como administrador."
    exit 1
}

# A pasta de dados sai da linha de comando do serviço, e não de um caminho
# fixo: é o jeito de acertar qualquer versão e qualquer pasta de instalação.
$servico = Get-CimInstance Win32_Service -Filter "Name LIKE 'postgresql%'" | Select-Object -First 1
if (-not $servico) { Erro "Não achei o serviço do PostgreSQL."; exit 1 }
if ($servico.PathName -notmatch '-D\s+"([^"]+)"') { Erro "Não consegui ler a pasta de dados do serviço."; exit 1 }
$dados = $matches[1]
$bin = Split-Path ($servico.PathName -replace '^"([^"]+)".*', '$1')
$pgCtl = Join-Path $bin "pg_ctl.exe"
$psql = Join-Path $bin "psql.exe"
$hba = Join-Path $dados "pg_hba.conf"
Feito "serviço $($servico.Name), dados em $dados"

$nova = Read-Host "Senha nova para o usuário 'postgres'" -AsSecureString
$conf = Read-Host "Repita a senha" -AsSecureString
$texto = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($nova))
$texto2 = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($conf))
if ($texto -ne $texto2) { Erro "As senhas não conferem."; exit 1 }
if ($texto.Length -lt 8) { Erro "Use pelo menos 8 caracteres."; exit 1 }

function Recarregar {
    $antes = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $pgCtl reload -D $dados 2>&1 | Out-Null } finally { $ErrorActionPreference = $antes }
    if ($LASTEXITCODE -ne 0) {
        # pg_ctl reload pode não alcançar o serviço; reiniciar sempre funciona,
        # só derruba as conexões abertas por alguns segundos.
        Restart-Service $servico.Name
    }
    Start-Sleep -Seconds 1
}

$original = [IO.File]::ReadAllBytes($hba)
$copia = "$hba.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
[IO.File]::WriteAllBytes($copia, $original)
Feito "cópia do pg_hba.conf em $copia"

try {
    # No topo: o pg_hba vale a primeira linha que casar.
    $liberacao = "host all postgres 127.0.0.1/32 trust  # TEMPORARIO: redefinir-senha-postgres.ps1`r`n"
    $atual = [Text.Encoding]::UTF8.GetString($original)
    [IO.File]::WriteAllText($hba, $liberacao + $atual, (New-Object Text.UTF8Encoding $false))
    Recarregar

    # Aspas simples dobradas: é o escape de literal no SQL.
    $sql = "ALTER USER postgres WITH PASSWORD '$($texto.Replace("'", "''"))'"
    $antes = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { $saida = & $psql -h 127.0.0.1 -U postgres -d postgres -w -tAc $sql 2>&1 } finally { $ErrorActionPreference = $antes }
    if ($LASTEXITCODE -ne 0) { throw "psql falhou: $($saida | Out-String)" }
    Feito "senha do postgres redefinida"
} catch {
    Erro $_.Exception.Message
    $falhou = $true
} finally {
    [IO.File]::WriteAllBytes($hba, $original)
    Recarregar
    Feito "pg_hba.conf original de volta"
}
if ($falhou) { exit 1 }

# Prova de que a senha nova entra — e de que a brecha fechou: sem a senha,
# este mesmo comando agora seria recusado.
$env:PGPASSWORD = $texto
try {
    $antes = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $psql -h 127.0.0.1 -U postgres -d postgres -w -tAc "SELECT 1" 2>&1 | Out-Null } finally { $ErrorActionPreference = $antes }
    if ($LASTEXITCODE -eq 0) { Feito "login com a senha nova conferido" }
    else { Erro "A senha foi trocada, mas o login de teste falhou. Veja o pg_hba.conf." }
} finally { $env:PGPASSWORD = "" }

Write-Host ""
Write-Host "Pronto. Guarde a senha num gerenciador de senhas e rode .\scripts\criar-banco.ps1" -ForegroundColor Cyan
