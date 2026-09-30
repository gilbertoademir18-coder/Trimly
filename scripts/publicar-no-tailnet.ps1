<#
.SYNOPSIS
    Publica o Trimly no tailnet, em HTTPS, na porta 8443.

.DESCRIPTION
    O celular chega ao app pelo Tailscale — e precisa ser por HTTPS: fora do
    localhost, o navegador só instala PWA e registra service worker em origem
    segura. O `tailscale serve` resolve isso com um certificado válido para
    o nome da máquina no tailnet (`*.ts.net`), sem nada a configurar à mão.

    A 443 desta máquina já pertence a outro app, então o Trimly fica na 8443.
    Só quem está no seu tailnet enxerga o endereço — não é a internet aberta
    (isso seria o `tailscale funnel`, que não usamos).

    Roda uma vez: com `--bg` o Tailscale guarda a configuração e a refaz
    sozinho depois de reiniciar a máquina.

.EXAMPLE
    .\scripts\publicar-no-tailnet.ps1

.EXAMPLE
    .\scripts\publicar-no-tailnet.ps1 -Desligar
#>

[CmdletBinding()]
param(
    [int]$PortaHttps = 8443,
    [int]$PortaApp = 3200,
    [switch]$Desligar
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command tailscale.exe -ErrorAction SilentlyContinue)) {
    Write-Host "  x Não achei o tailscale.exe no PATH." -ForegroundColor Red
    exit 1
}

if ($Desligar) {
    & tailscale serve "--https=$PortaHttps" off
    exit $LASTEXITCODE
}

& tailscale serve --bg "--https=$PortaHttps" "http://127.0.0.1:$PortaApp"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$nome = (& tailscale status --json | ConvertFrom-Json).Self.DNSName.TrimEnd(".")
Write-Host ""
Write-Host "  Trimly no tailnet: https://${nome}:$PortaHttps" -ForegroundColor Green
