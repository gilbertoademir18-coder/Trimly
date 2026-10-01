<#
    Trimly na bandeja do sistema.

    O servidor precisa ficar vivo para o app funcionar — no PC e no celular,
    pelo tailnet —, mas isso não obriga ninguém a manter um prompt aberto na
    tela. Este script sobe o servidor como processo oculto e deixa na bandeja
    um ícone que diz se ele está no ar, com os atalhos que importam.

    Não depende de pacote nenhum: o WinForms já vem com o Windows.

    Não é para ser executado direto — use o Trimly.cmd, que confere Node e
    dependências antes e depois some. Veio do NihongoHub, que é onde as
    decisões abaixo foram tomadas e medidas; o README conta os porquês.
#>

# As funções seguem o português do resto do projeto. O analisador pede verbos
# aprovados em inglês (Get-, Start-, Stop-), regra que existe para cmdlets
# exportados por módulos — nada disso se aplica a funções privadas de script.
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseApprovedVerbs', '')]
param(
    # Uso interno: marca o relançamento que já nasceu sem console. Ver abaixo.
    [switch]$SemConsole
)

$ErrorActionPreference = "Stop"

<#
    Sem console — de verdade.

    `-WindowStyle Hidden` não basta no Windows 11: quem hospeda o console é o
    Windows Terminal, e o pedido de esconder a janela não tem a quem chegar.
    A saída é não ter janela: o script relança a si mesmo com CREATE_NO_WINDOW
    e sai. O processo novo nasce sem console nenhum.
#>
if (-not $SemConsole) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName         = Join-Path $PSHOME "powershell.exe"
    $psi.Arguments        = "-NoProfile -ExecutionPolicy Bypass -STA -File `"$PSCommandPath`" -SemConsole"
    $psi.WorkingDirectory = Split-Path -Parent $PSScriptRoot
    $psi.UseShellExecute  = $false
    $psi.CreateNoWindow   = $true
    [System.Diagnostics.Process]::Start($psi) | Out-Null
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$RAIZ  = Split-Path -Parent $PSScriptRoot
$PORTA = 3200
$URL   = "http://localhost:$PORTA"

# A porta HTTPS que o `tailscale serve` publica (ver scripts\publicar-no-tailnet.ps1).
# A 443 desta máquina já pertence a outro app.
$PORTA_TAILNET = 8443

# O log vai para fora do projeto: um arquivo de log dentro da árvore
# versionada só serviria para sujar o git status.
$PASTA_LOG = Join-Path $env:LOCALAPPDATA "Trimly"
$LOG       = Join-Path $PASTA_LOG "servidor.log"

# ---------------------------------------------------------------------------
# Uma instância só. Dois ícones disputando a mesma porta não ajudariam
# ninguém, e o segundo acharia que o servidor do primeiro é dele.
# ---------------------------------------------------------------------------
$souOUnico = $false
$tranca = New-Object System.Threading.Mutex($true, "TrimlyTray", [ref]$souOUnico)
if (-not $souOUnico) {
    [System.Windows.Forms.MessageBox]::Show(
        "O Trimly já está na bandeja do sistema.`n`nProcure o ícone perto do relógio — pode estar escondido na setinha.",
        "Trimly", "OK", "Information") | Out-Null
    exit 0
}

# ---------------------------------------------------------------------------
# Estado da porta
# ---------------------------------------------------------------------------

<#
    Quem ouve na porta, sem abrir conexão. Consultado a cada segundo, então
    precisa ser barato: esta chamada custa milissegundos, enquanto
    Get-NetTCPConnection custa centenas e travaria o menu.
#>
function Porta-Ouvindo {
    $escutas = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    foreach ($e in $escutas) { if ($e.Port -eq $PORTA) { return $true } }
    return $false
}

<# O PID de quem ocupa a porta. Só é preciso ao parar, então pode ser caro. #>
function Pid-NaPorta {
    try {
        $c = Get-NetTCPConnection -LocalPort $PORTA -State Listen -ErrorAction Stop | Select-Object -First 1
        return $c.OwningProcess
    } catch { return $null }
}

# Processos que o npm e o tsx empilham entre o lançador e o servidor. Só por
# estes a busca abaixo pode subir; o explorer.exe ou o terminal que iniciou
# tudo ficam de fora, e é neles que a subida para.
$ANDAIME = @("node.exe", "cmd.exe", "npm.exe")

<#
    O topo da árvore do servidor, a partir de quem ocupa a porta.

    Quem escuta na 3200 não é quem foi iniciado: o npm põe degraus de cmd.exe
    no meio e o tsx roda o servidor num node filho. Matar só o dono da porta
    deixaria os de cima vivos. A subida para no primeiro processo que não seja
    andaime — e também se o "pai" nasceu depois do filho, o que não é
    parentesco e sim um PID reciclado pelo Windows.
#>
function Raiz-DoServidor {
    $raiz = Pid-NaPorta
    if (-not $raiz) { return $null }

    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$raiz" -ErrorAction SilentlyContinue
    for ($nivel = 0; $nivel -lt 8 -and $proc; $nivel++) {
        $pai = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)" -ErrorAction SilentlyContinue
        if (-not $pai) { break }
        if ($ANDAIME -notcontains $pai.Name.ToLower()) { break }
        if ($pai.CreationDate -gt $proc.CreationDate) { break }
        $raiz = $pai.ProcessId
        $proc = $pai
    }
    return $raiz
}

<#
    A porta responder não basta: outro projeto atendendo ali faria o ícone
    anunciar "no ar" e abrir o navegador no app errado. A rota /api/saude
    existe só para esta pergunta.
#>
function E-O-Trimly {
    try {
        $r = Invoke-WebRequest -Uri "$URL/api/saude" -UseBasicParsing -TimeoutSec 10
        return ($r.Content -match '"Trimly"')
    } catch { return $false }
}

<#
    O endereço HTTPS do app no tailnet, ou $null sem Tailscale.

    É por ele que o celular chega — e precisa ser HTTPS: fora do localhost, o
    navegador só instala PWA e registra service worker em origem segura.
#>
function Url-Tailnet {
    try {
        $status = & tailscale status --json 2>$null | ConvertFrom-Json
        $nome = $status.Self.DNSName.TrimEnd(".")
        if ($nome) { return "https://${nome}:$PORTA_TAILNET" }
    } catch { }
    return $null
}

# ---------------------------------------------------------------------------
# Ícone
# ---------------------------------------------------------------------------

<#
    Monta o ícone da bandeja a partir do PNG do PWA, em 32x32.

    O ícone é o painel de estado, e não a notificação: balão some em quatro
    segundos, ícone fica.

      verde    no ar
      vermelho o servidor caiu ou não subiu
      nenhum   subindo — estado passageiro, não vale alarme

    O selo vai no canto inferior direito, igual ao do NihongoHub e do
    Creativa: com os ícones na mesma bandeja, o estado aparece sempre no
    mesmo lugar, e não dá para confundir qual app está no ar.

    O desenho segue o do reWASD: o ícone recortado em círculo, e o selo com
    um anel preto em volta, que o separa do desenho e o mantém legível sobre
    bandeja clara ou escura. O selo invade a borda do círculo de propósito —
    é o que faz ele parecer pousado em cima, e não um pedaço do ícone.
#>
function Novo-Bitmap([bool]$apagado, [string]$selo) {
    $origem = [System.Drawing.Image]::FromFile((Join-Path $RAIZ "apps\web\public\icon-192.png"))
    try {
        # Primeiro o desenho inteiro, colorido ou cinza, numa tela à parte...
        $plano = New-Object System.Drawing.Bitmap 32, 32
        $gp = [System.Drawing.Graphics]::FromImage($plano)
        $gp.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

        $atrib = New-Object System.Drawing.Imaging.ImageAttributes
        if ($apagado) {
            $m = New-Object System.Drawing.Imaging.ColorMatrix
            # Pesos de luminância nas nove casas RGB: cinza puro, sem sobra de cor.
            $m.Matrix00 = 0.299; $m.Matrix01 = 0.299; $m.Matrix02 = 0.299
            $m.Matrix10 = 0.587; $m.Matrix11 = 0.587; $m.Matrix12 = 0.587
            $m.Matrix20 = 0.114; $m.Matrix21 = 0.114; $m.Matrix22 = 0.114
            $m.Matrix33 = 0.55
            $atrib.SetColorMatrix($m)
        }

        $destino = New-Object System.Drawing.Rectangle 0, 0, 32, 32
        $gp.DrawImage($origem, $destino, 0, 0, $origem.Width, $origem.Height,
                      [System.Drawing.GraphicsUnit]::Pixel, $atrib)
        $gp.Dispose()

        # ...depois pintado como textura de um círculo. Recortar com SetClip
        # deixaria a borda serrilhada: o recorte não tem antisserrilhado, o
        # preenchimento tem.
        $tela = New-Object System.Drawing.Bitmap 32, 32
        $g = [System.Drawing.Graphics]::FromImage($tela)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $textura = New-Object System.Drawing.TextureBrush $plano
        $g.FillEllipse($textura, 0, 0, 32, 32)
        $textura.Dispose()
        $plano.Dispose()

        if ($selo) {
            $cor = if ($selo -eq "verde") {
                [System.Drawing.Color]::FromArgb(255, 70, 200, 40)
            } else {
                [System.Drawing.Color]::FromArgb(255, 220, 45, 45)
            }
            $g.FillEllipse([System.Drawing.Brushes]::Black, 15, 15, 17, 17)
            $pincel = New-Object System.Drawing.SolidBrush $cor
            $g.FillEllipse($pincel, 17.5, 17.5, 12, 12)
            $pincel.Dispose()
        }

        $g.Dispose()
        return $tela
    } finally { $origem.Dispose() }
}

function Novo-Icone([bool]$apagado, [string]$selo) {
    $tela = Novo-Bitmap $apagado $selo
    return [System.Drawing.Icon]::FromHandle($tela.GetHicon())
}

# ---------------------------------------------------------------------------
# Servidor
# ---------------------------------------------------------------------------

$script:proc         = $null
$script:desde        = Get-Date
# Só o clique em "Abrir no Edge" liga isto. O navegador nunca abre por conta
# própria: nem ao subir, nem ao adotar um servidor que já estava rodando.
$script:abrirAoSubir = $false

<#
    Sobe o app oculto, com a saída indo para o log.

    `npm run servir` aplica as migrações pendentes, compila o front e sobe a
    API servindo o front pronto. Por isso "Reiniciar" depois de um `git pull`
    é tudo o que se precisa: banco, front e back saem atualizados juntos.

    A saída vai para arquivo pelo próprio cmd, e não pelos pipes do .NET: pipe
    redirecionado que ninguém lê enche o buffer e congela o processo filho.
#>
function Iniciar-Servidor {
    if (-not (Test-Path $PASTA_LOG)) { New-Item -ItemType Directory -Path $PASTA_LOG | Out-Null }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName         = $env:ComSpec
    $psi.Arguments        = "/c npm run servir 1>`"$LOG`" 2>&1"
    $psi.WorkingDirectory = $RAIZ
    $psi.UseShellExecute  = $false
    $psi.CreateNoWindow   = $true
    $psi.EnvironmentVariables["NODE_ENV"] = "production"

    $script:proc  = [System.Diagnostics.Process]::Start($psi)
    $script:desde = Get-Date
    Marcar "subindo"
}

<#
    Derruba o servidor e tudo que ele abriu. `taskkill /T` alcança a árvore
    inteira; matar só o pai deixaria a porta ocupada por um fantasma.
#>
function Parar-Servidor {
    $alvos = @()
    if ($script:proc -and -not $script:proc.HasExited) { $alvos += $script:proc.Id }
    # Também pela porta: quando o ícone adotou um servidor que já estava no ar,
    # não existe $proc nenhum para matar.
    $raiz = Raiz-DoServidor
    if ($raiz) { $alvos += $raiz }

    foreach ($alvo in ($alvos | Select-Object -Unique)) {
        try { & taskkill /PID $alvo /T /F 2>$null | Out-Null } catch { }
    }
    $script:proc = $null

    # Esperar a porta de fato vagar, em vez de chutar um tempo.
    for ($i = 0; $i -lt 30 -and (Porta-Ouvindo); $i++) { Start-Sleep -Milliseconds 100 }
}

<# O Edge, se estiver instalado; senão o navegador padrão do sistema. #>
function Abrir-Navegador {
    $candidatos = @(
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:ProgramFiles        "Microsoft\Edge\Application\msedge.exe")
    )
    foreach ($e in $candidatos) {
        if (Test-Path $e) { Start-Process $e -ArgumentList $URL; return }
    }
    Start-Process $URL
}

$WORKSPACE = Join-Path $RAIZ "Trimly.code-workspace"

<#
    Onde está o VS Code, ou $null. O `code` do PATH é um `.cmd` e abriria um
    console por um instante a cada clique; o executável de verdade não abre.
#>
function Achar-VsCode {
    $candidatos = @(
        (Join-Path $env:LOCALAPPDATA        "Programs\Microsoft VS Code\Code.exe"),
        (Join-Path $env:ProgramFiles        "Microsoft VS Code\Code.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft VS Code\Code.exe"),
        (Join-Path $env:LOCALAPPDATA        "Programs\Microsoft VS Code Insiders\Code - Insiders.exe"),
        (Join-Path $env:ProgramFiles        "Microsoft VS Code Insiders\Code - Insiders.exe")
    )
    foreach ($c in $candidatos) { if (Test-Path $c) { return $c } }
    return $null
}

# ---------------------------------------------------------------------------
# Início automático
# ---------------------------------------------------------------------------

# A pasta Inicializar do usuário — pedida ao Windows, porque o caminho muda
# com o idioma da instalação.
$ATALHO_STARTUP = Join-Path ([Environment]::GetFolderPath("Startup")) "Trimly.lnk"
$LANCADOR       = Join-Path $RAIZ "Trimly.cmd"

<#
    O atalho existe *e* aponta para esta cópia do projeto? Um atalho deixado
    por uma pasta antiga marcaria a opção como ligada sem subir nada.
#>
function Inicio-Automatico-Ligado {
    if (-not (Test-Path $ATALHO_STARTUP)) { return $false }
    $shell = New-Object -ComObject WScript.Shell
    try {
        return ($shell.CreateShortcut($ATALHO_STARTUP).TargetPath -eq $LANCADOR)
    } finally {
        [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
    }
}

<#
    Liga ou desliga a subida junto com o Windows. Janela "minimizada" (7): o
    Trimly.cmd ainda confere Node e dependências num console, mas no login ele
    aparece na barra de tarefas em vez de saltar por cima do que estiver na tela.
#>
function Definir-Inicio-Automatico([bool]$ligar) {
    if (-not $ligar) {
        if (Test-Path $ATALHO_STARTUP) { Remove-Item $ATALHO_STARTUP -Force }
        return
    }
    $shell = New-Object -ComObject WScript.Shell
    try {
        $atalho = $shell.CreateShortcut($ATALHO_STARTUP)
        $atalho.TargetPath       = $LANCADOR
        $atalho.WorkingDirectory = $RAIZ
        $atalho.WindowStyle      = 7
        $atalho.Description      = "Põe o Trimly na bandeja do sistema"
        $atalho.Save()
    } finally {
        [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
    }
}

# ---------------------------------------------------------------------------
# Bandeja
# ---------------------------------------------------------------------------

[System.Windows.Forms.Application]::EnableVisualStyles()

$iconeNoAr    = Novo-Icone $false "verde"
$iconeSubindo = Novo-Icone $true  ""
$iconeParado  = Novo-Icone $true  "vermelho"

$bandeja = New-Object System.Windows.Forms.NotifyIcon
$bandeja.Icon    = $iconeSubindo
$bandeja.Text    = "Trimly"
$bandeja.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$bandeja.ContextMenuStrip = $menu

$itemAbrir = $menu.Items.Add("Abrir no Edge")
$itemAbrir.Font = New-Object System.Drawing.Font($menu.Font, [System.Drawing.FontStyle]::Bold)
$itemCelular = $menu.Items.Add("Copiar link do celular")
$itemCode = $menu.Items.Add("Abrir no VS Code")
$itemPasta = $menu.Items.Add("Abrir a pasta do projeto")
$itemReiniciar = $menu.Items.Add("Reiniciar o servidor")
$menu.Items.Add("-") | Out-Null
$itemBackup = $menu.Items.Add("Fazer backup do banco")
$itemStartup = $menu.Items.Add("Iniciar com o Windows")
$itemStartup.CheckOnClick = $true
$itemStartup.Checked = Inicio-Automatico-Ligado
$itemLog = $menu.Items.Add("Ver o log")
$menu.Items.Add("-") | Out-Null
$itemSair = $menu.Items.Add("Sair")

$script:estado = "parado"

<# O único lugar que muda estado, dica e ícone juntos. #>
function Marcar([string]$novo) {
    $script:estado = $novo
    switch ($novo) {
        "subindo" {
            $bandeja.Icon = $iconeSubindo
            $bandeja.Text = "Trimly — subindo o servidor..."
        }
        "no-ar" {
            $bandeja.Icon = $iconeNoAr
            $bandeja.Text = "Trimly — no ar. Clique duas vezes para abrir."
        }
        "parado" {
            $bandeja.Icon = $iconeParado
            $bandeja.Text = "Trimly — parado"
        }
    }
    $itemReiniciar.Enabled = ($novo -ne "subindo")
}

<#
    Balão de notificação — para o que deu errado, e para a resposta de uma
    ação pedida que não deixa rastro na tela (copiar link, backup). Sucesso de
    rotina não interrompe: quem diz que está tudo bem é o selo verde.
#>
function Avisar([string]$texto, [string]$tipo) {
    $bandeja.ShowBalloonTip(4000, "Trimly", $texto, $tipo)
}

# ---------------------------------------------------------------------------
# Ações do menu
# ---------------------------------------------------------------------------

$itemAbrir.add_Click({
    if ($script:estado -eq "no-ar") {
        Abrir-Navegador
        return
    }
    # Pedir para abrir com o servidor parado é, na prática, pedir para subir.
    $script:abrirAoSubir = $true
    if ($script:estado -ne "subindo") { Iniciar-Servidor }
})

$bandeja.add_DoubleClick({ $itemAbrir.PerformClick() })

$itemCelular.add_Click({
    $link = Url-Tailnet
    if (-not $link) {
        Avisar "Não consegui falar com o Tailscale. Ele está rodando?" "Error"
        return
    }
    [System.Windows.Forms.Clipboard]::SetText($link)
    Avisar "Copiado: $link`nAbra no celular e use 'Adicionar à tela inicial'." "Info"
})

$itemCode.add_Click({
    $code = Achar-VsCode
    if (-not $code) {
        Avisar "Não encontrei o VS Code instalado nesta máquina." "Error"
        return
    }
    $alvo = if (Test-Path $WORKSPACE) { $WORKSPACE } else { $RAIZ }
    Start-Process $code -ArgumentList "`"$alvo`""
})

# $RAIZ, e não um caminho escrito: é a pasta desta cópia, onde quer que ela esteja.
$itemPasta.add_Click({
    Start-Process explorer.exe -ArgumentList "`"$RAIZ`""
})

$itemReiniciar.add_Click({
    Parar-Servidor
    $script:abrirAoSubir = $false
    Iniciar-Servidor
})

$itemBackup.add_Click({
    # Numa janela visível, de propósito: backup é algo que se quer ver
    # terminar, e o script diz onde gravou e quantos arquivos guardou.
    Start-Process powershell.exe -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit",
        "-File", "`"$(Join-Path $RAIZ 'scripts\backup-banco.ps1')`""
    ) -WorkingDirectory $RAIZ
})

$itemStartup.add_Click({
    # `CheckOnClick` já virou a marca antes deste clique chegar aqui.
    try {
        Definir-Inicio-Automatico $itemStartup.Checked
    } catch {
        Avisar "Não consegui mudar o início automático: $($_.Exception.Message)" "Error"
    }
    # Quem manda é o arquivo, não a marca: se a escrita falhou, ela volta.
    $itemStartup.Checked = Inicio-Automatico-Ligado
})

# Pasta Inicializar e VS Code podem mudar por fora — relidos a cada abertura.
$menu.add_Opening({
    $itemStartup.Checked = Inicio-Automatico-Ligado
    $itemCode.Enabled = [bool](Achar-VsCode)
})

$itemLog.add_Click({
    if (Test-Path $LOG) { Start-Process notepad.exe -ArgumentList "`"$LOG`"" }
    else { Avisar "Ainda não há log: o servidor não subiu nesta sessão." "Warning" }
})

$itemSair.add_Click({
    Parar-Servidor
    # Sem isto o ícone fica de fantasma na bandeja até o mouse passar por cima.
    $bandeja.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})

# ---------------------------------------------------------------------------
# Relógio: acompanha o servidor sem travar o menu
# ---------------------------------------------------------------------------

$relogio = New-Object System.Windows.Forms.Timer
$relogio.Interval = 1000
$relogio.add_Tick({
    $ouvindo = Porta-Ouvindo

    if ($script:estado -eq "subindo") {
        if ($ouvindo) {
            Marcar "no-ar"
            if ($script:abrirAoSubir) {
                Abrir-Navegador
                $script:abrirAoSubir = $false
            }
            return
        }
        # Morreu antes de abrir a porta: erro de compilação, migração ou banco
        # fora do ar — e só o log diz qual.
        if ($script:proc -and $script:proc.HasExited) {
            Marcar "parado"
            Avisar "O servidor não subiu. Abra 'Ver o log' para saber por quê." "Error"
            return
        }
        if (((Get-Date) - $script:desde).TotalSeconds -gt 180) {
            Marcar "parado"
            Avisar "O servidor demorou demais para responder. Veja o log." "Warning"
        }
        return
    }

    if ($script:estado -eq "no-ar" -and -not $ouvindo) {
        Marcar "parado"
        Avisar "O servidor parou. Use 'Reiniciar o servidor'." "Warning"
    }
})
$relogio.Start()

# ---------------------------------------------------------------------------
# Partida
# ---------------------------------------------------------------------------

if (Porta-Ouvindo) {
    if (E-O-Trimly) {
        # Já havia um servidor rodando — adotamos em vez de subir outro.
        Marcar "no-ar"
    } else {
        $bandeja.Visible = $false
        [System.Windows.Forms.MessageBox]::Show(
            "A porta $PORTA está ocupada por outro programa.`n`nFeche o que estiver usando essa porta, ou mude a porta em apps\api\src\server.ts e em scripts\tray.ps1.",
            "Trimly", "OK", "Warning") | Out-Null
        exit 1
    }
} else {
    # Sobe o servidor, e só. O navegador é sempre um pedido explícito.
    Iniciar-Servidor
}

[System.Windows.Forms.Application]::Run()

$bandeja.Dispose()
$tranca.ReleaseMutex()
