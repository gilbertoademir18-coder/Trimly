<#
.SYNOPSIS
    Confere o código e faz o backup antes de a versão nova entrar no ar.

.DESCRIPTION
    "Reiniciar o servidor", no tray, derruba o app primeiro e compila depois:
    se a compilação falhar, o celular fica sem app até alguém consertar. Este
    script faz antes tudo o que pode dar errado, com o servidor antigo ainda no
    ar — TypeScript, testes e build — e o backup do banco, porque o reinício
    aplica as migrações pendentes. Só se tudo passar é que o servidor reinicia.

    Quem chama é o item "Publicar a versão nova" do tray, numa janela visível,
    e é o tray que reinicia quando este script sai com 0. Rodado à mão, ele só
    confere; o reinício fica por sua conta.

    O que vai ao ar é o que está nesta pasta — o branch atual, com o que ainda
    não foi commitado. O script mostra os dois para não haver surpresa.

.EXAMPLE
    .\scripts\publicar.ps1
#>

[CmdletBinding()]
param(
    # Uso do tray: espera um Enter antes de fechar a janela quando algo falha,
    # senão o erro sumiria junto com ela.
    [switch]$DaBandeja
)

$ErrorActionPreference = "Stop"
$RAIZ = Split-Path -Parent $PSScriptRoot
Set-Location $RAIZ

function Falar([string]$t) { Write-Host $t }
function Etapa([string]$t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Feito([string]$t) { Write-Host "  - $t" -ForegroundColor Green }
function Aviso([string]$t) { Write-Host "  ! $t" -ForegroundColor Yellow }

function Falhar([string]$t) {
    Write-Host ""
    Write-Host "  x $t" -ForegroundColor Red
    Write-Host "  O servidor que está no ar não foi tocado." -ForegroundColor Red
    if ($DaBandeja) { Read-Host "`nEnter para fechar" | Out-Null }
    exit 1
}

<#
    Roda um comando npm e para tudo se ele falhar.

    O nome não pode ser `Npm`: função ganha de executável na resolução de
    comandos, e sem diferença de maiúsculas o `npm` aqui dentro chamaria a
    própria função, em laço. E `npm.cmd` explícito pelo mesmo motivo.
#>
function Rodar-Npm([string[]]$argumentos, [string]$nome) {
    Etapa $nome
    & npm.cmd @argumentos
    if ($LASTEXITCODE -ne 0) { Falhar "$nome falhou." }
    Feito "$nome ok"
}

# --- O que vai ao ar ---------------------------------------------------------
Etapa "O que vai ao ar"
$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
$commit = (& git log -1 --format="%h %s").Trim()
Falar "  branch: $branch"
Falar "  último commit: $commit"
$pendentes = @(& git status --porcelain)
if ($pendentes.Count -gt 0) {
    Aviso "$($pendentes.Count) arquivo(s) alterado(s) sem commit — vão junto."
}

# --- Conferências, com o servidor antigo no ar -------------------------------
Rodar-Npm @("run", "typecheck") "TypeScript"
Rodar-Npm @("run", "test") "Testes"

# Numa pasta temporária, e não no `apps\web\dist`: é dali que o servidor no ar
# serve o app, e o Vite esvazia a pasta antes de escrever — um build que
# falhasse no meio deixaria o celular com o app quebrado. O build de verdade é
# o do reinício.
$buildTeste = Join-Path $env:TEMP "trimly-build-teste"
Rodar-Npm @("run", "build", "-w", "apps/web", "--", "--outDir", $buildTeste, "--emptyOutDir") "Build do front"
Remove-Item $buildTeste -Recurse -Force -ErrorAction SilentlyContinue

# --- Backup ------------------------------------------------------------------
# Sempre, e não só quando há migração pendente: custa segundos, e é a única
# rede de segurança se uma migração fizer algo que não devia.
Etapa "Backup do banco"
& (Join-Path $PSScriptRoot "backup-banco.ps1")
if ($LASTEXITCODE -ne 0) { Falhar "O backup falhou — sem backup, não publico." }

Write-Host ""
if ($DaBandeja) {
    Write-Host "Tudo certo. O tray reinicia o servidor com a versão nova." -ForegroundColor Green
    Start-Sleep -Seconds 3
} else {
    Write-Host "Tudo certo. Falta reiniciar o servidor — 'Reiniciar o servidor' no tray." -ForegroundColor Green
}
exit 0
