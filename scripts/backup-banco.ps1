<#
.SYNOPSIS
    Salva um dump do banco em `backups\`, e apaga os mais velhos.

.DESCRIPTION
    Lê a conexão do `.env`, então funciona igual apontando para o banco local
    ou para o de casa pelo tailnet — o dump sai pela rede, e para um banco
    deste tamanho isso custa segundos.

    A pasta `backups\` é ignorada pelo git de propósito: dump carrega o seu
    histórico e a senha de ninguém, mas versionar binário que muda
    inteiro a cada gravação incharia o repositório sem dar nada em troca.

.EXAMPLE
    npm run backup

.EXAMPLE
    .\scripts\backup-banco.ps1 -Manter 30
#>

[CmdletBinding()]
param(
    # Quantos arquivos guardar. Os mais antigos além disso são apagados.
    [int]$Manter = 10
)

$ErrorActionPreference = "Stop"
$RAIZ = Split-Path -Parent $PSScriptRoot
$PASTA = Join-Path $RAIZ "backups"

function Falar([string]$t) { Write-Host $t }
function Erro([string]$t) { Write-Host "  x $t" -ForegroundColor Red }
function Feito([string]$t) { Write-Host "  - $t" -ForegroundColor Green }

# O PowerShell 5.1 embrulha stderr de executável em ErrorRecord quando ela é
# redirecionada; com "Stop" isso vira exceção antes de olharmos o código de
# saída, que é quem de fato diz se deu certo.
function Rodar([string]$exe, [string[]]$argumentos) {
    $antes = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $exe @argumentos 2>&1 } finally { $ErrorActionPreference = $antes }
}

# --- Conexão ----------------------------------------------------------------
$envArquivo = Join-Path $RAIZ ".env"
if (-not (Test-Path $envArquivo)) { Erro "Não achei $envArquivo"; exit 1 }

$linha = Get-Content $envArquivo | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
if (-not $linha) { Erro "Não achei DATABASE_URL no .env"; exit 1 }

# postgresql://usuario:senha@host:porta/banco?query
if ($linha -notmatch 'postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?"''\s]+)') {
    Erro "Não consegui ler o DATABASE_URL. Formato esperado:"
    Falar "    postgresql://usuario:senha@host:porta/banco"
    exit 1
}
$usuario = $matches[1]
$senha = [uri]::UnescapeDataString($matches[2])
$hospedeiro = $matches[3]
$porta = $matches[4]
$banco = $matches[5]

Falar "Banco:  $banco em ${hospedeiro}:${porta} (como $usuario)"

# --- pg_dump ----------------------------------------------------------------
# Procurado na máquina, e não fixado: a versão instalada aqui pode não ser a
# mesma de casa, e o caminho escrito na unha viraria "arquivo não encontrado".
$pgDump = (Get-Command pg_dump.exe -ErrorAction SilentlyContinue).Source
if (-not $pgDump) {
    $candidatos = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "bin\pg_dump.exe" } |
        Where-Object { Test-Path $_ }
    $pgDump = $candidatos | Select-Object -First 1
}
if (-not $pgDump) {
    Erro "Não achei o pg_dump. Instale as ferramentas de linha de comando do PostgreSQL."
    exit 1
}

New-Item -ItemType Directory -Force $PASTA | Out-Null
# Com segundos: duas execuções no mesmo minuto se sobrescreveriam em
# silêncio, e a segunda apagaria o backup da primeira sem dizer nada.
$carimbo = Get-Date -Format "yyyyMMdd-HHmmss"
$arquivo = Join-Path $PASTA "$banco-$carimbo.dump"

$env:PGPASSWORD = $senha
try {
    # -Fc (formato próprio, comprimido) em vez de SQL puro: permite restaurar
    # uma tabela só e é bem menor. O `restaurar-banco.ps1` espera este formato.
    $saida = Rodar $pgDump @("-h", $hospedeiro, "-p", $porta, "-U", $usuario,
        "-d", $banco, "-Fc", "-f", $arquivo)
    if ($LASTEXITCODE -ne 0) {
        Erro "pg_dump falhou:"
        $saida | Select-Object -First 5 | ForEach-Object { Falar "    $_" }
        if (Test-Path $arquivo) { Remove-Item $arquivo -Force }
        exit 1
    }
} finally {
    $env:PGPASSWORD = ""
}

# Um dump que não abre não é backup. Ler o índice custa milissegundos e é a
# diferença entre ter uma cópia e achar que tem.
$indice = Rodar (Join-Path (Split-Path $pgDump) "pg_restore.exe") @("-l", $arquivo)
if ($LASTEXITCODE -ne 0) {
    Erro "O arquivo gerado não abre como dump. Não vou contar isso como backup."
    exit 1
}
$comDados = ($indice | Select-String "TABLE DATA").Count
Feito ("{0} ({1:N0} bytes, {2} tabelas com dados)" -f (Split-Path $arquivo -Leaf), (Get-Item $arquivo).Length, $comDados)

# --- Podar ------------------------------------------------------------------
$todos = Get-ChildItem $PASTA -Filter "*.dump" | Sort-Object LastWriteTime -Descending
if ($todos.Count -gt $Manter) {
    $velhos = $todos | Select-Object -Skip $Manter
    foreach ($v in $velhos) { Remove-Item $v.FullName -Force }
    Feito "apaguei $($velhos.Count) backup(s) antigo(s); ficaram $Manter"
} else {
    Feito "$($todos.Count) backup(s) na pasta"
}
