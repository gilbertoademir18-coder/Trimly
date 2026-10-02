# Trimly

App de acompanhamento de desenvolvimento pessoal, em módulos. O primeiro é o
**WL**: jejum, pontuação de cada dia, calendário, pesagens e meta.

PWA em React + Vite, API em Node (Fastify + Prisma 7) e PostgreSQL local, num
monorepo com npm workspaces. Acessível do celular pelo Tailscale.

## Começando

Uma vez só, no PowerShell, para criar o banco e o `.env`:

```powershell
npm install
.\scripts\criar-banco.ps1          # pede a senha do usuário postgres
.\scripts\publicar-no-tailnet.ps1  # HTTPS no tailnet (já feito em x570-aorus)
```

Depois, **dê dois cliques em `Trimly.cmd`**. O servidor não fica numa janela:
ele vira um **ícone na bandeja**, perto do relógio. Duplo clique no ícone abre
o app; o botão direito traz o resto.

## No celular

No ícone da bandeja, **Copiar link do celular** copia
`https://x570-aorus.tail2c882a.ts.net:8443`. Abra no celular (com o Tailscale
ligado) e use **Adicionar à tela inicial**.

### Por que HTTPS e porta 8443

Fora do `localhost`, o navegador só instala PWA e registra service worker em
**origem segura**. Abrir `http://100.65.76.22:3200` funciona como site, mas não
instala. O `tailscale serve` entrega HTTPS com certificado válido para o nome
da máquina no tailnet, sem nada a configurar.

A 443 desta máquina já pertence a outro app (porta 3001), por isso o Trimly
fica na 8443. Só dispositivos do seu tailnet enxergam o endereço — não é a
internet aberta. Para desfazer: `.\scripts\publicar-no-tailnet.ps1 -Desligar`.

## O ícone da bandeja

Veio do NihongoHub, com as mesmas decisões (sem janela de console, matar a
árvore de processos inteira, conferir se quem responde na porta é mesmo o
Trimly) — o README de lá conta os porquês em detalhe.

| Item do menu | O que faz |
| --- | --- |
| **Abrir no Edge** | Abre o app. Com o servidor parado, sobe ele antes |
| Copiar link do celular | Copia a URL HTTPS do tailnet |
| Abrir no VS Code | Abre `Trimly.code-workspace` |
| Abrir a pasta do projeto | Abre a pasta do código-fonte no Explorer |
| **Publicar a versão nova** | Confere, faz backup e só então reinicia — ver abaixo |
| Reiniciar o servidor | Aplica migrações pendentes, recompila o front e sobe de novo |
| Fazer backup do banco | Roda `scripts\backup-banco.ps1` numa janela |
| Iniciar com o Windows | Liga e desliga a subida automática no login |
| Ver o log | `%LOCALAPPDATA%\Trimly\servidor.log` no Bloco de Notas |
| Sair | Encerra o servidor e tira o ícone |

| Ícone | Estado |
| --- | --- |
| colorido, **selo verde** | no ar |
| cinza, sem selo | subindo |
| cinza, **selo vermelho** | caiu ou não subiu — veja o log |

O selo fica no canto **inferior** direito, igual ao do NihongoHub: com os dois
ícones na mesma bandeja, o estado aparece sempre no mesmo lugar.

### O tray roda o app "de verdade", não o de desenvolvimento

O ícone sobe `npm run servir`: aplica migrações, compila o front e sobe a API,
que serve o front pronto na **porta 3200**. Uma porta, um processo, e o
service worker do PWA funcionando como em produção.

### Publicar uma versão nova

Depois de mexer no código (ou de um `git pull`), use **Publicar a versão
nova**. Ele abre uma janela que roda `scripts\publicar.ps1`: TypeScript,
testes, um build de conferência e o backup do banco — tudo com a versão antiga
ainda no ar. Só se tudo passar o tray reinicia o servidor, e o reinício aplica
as migrações. Se algo falha, a janela fica aberta com o erro e o app do celular
nem percebe.

**Reiniciar** sozinho derruba o servidor antes de compilar: um erro ali deixa o
app fora do ar até ser consertado. Serve para destravar, não para publicar.

O build de conferência vai para uma pasta temporária, e não para
`apps\web\dist`: é dali que o servidor no ar serve o app, e o Vite esvazia a
pasta antes de escrever.

O que vai ao ar é o que está na pasta — o branch atual, inclusive o que não foi
commitado. A janela mostra os dois. No celular, o app pega a versão nova na
próxima vez que for aberto (o service worker se atualiza sozinho).

Para mexer no código, `npm run dev` sobe o Vite (3210, recarga instantânea) e
a API em modo watch (3201) — portas diferentes, então dá para desenvolver com
o app do dia a dia no ar.

## Comandos

| Comando | O que faz |
| --- | --- |
| `Trimly.cmd` | Põe o Trimly na bandeja |
| `npm run dev` | Desenvolvimento: http://localhost:3210 |
| `npm run servir` | O que o tray roda: migra, compila e sobe na 3200 |
| `npm test` | Testes (API e web) |
| `npm run typecheck` | TypeScript nos dois apps |
| `npm run db:migrate` | Cria migração nova a partir do schema (dev) |
| `npm run db:studio` | Prisma Studio |
| `npm run icons` | Regenera os ícones a partir do SVG |
| `npm run backup` | Dump em `backups\`, verificado depois de gravar |

## Como está montado

```
apps/
  api/                    Fastify + Prisma 7 (porta 3200; 3201 em dev)
    prisma/schema.prisma  Tabelas, com prefixo por módulo (wl_...)
    src/server.ts         Sobe a API e serve o front compilado
    src/lib/datas.ts      Dia do calendário ⇄ coluna DATE
    src/lib/validacao.ts  As peças de Zod que todo módulo usa
    src/wl/rotas.ts       /api/wl/*
    src/wl/jejum.ts       /api/wl/jejum/*
  web/                    React 19 + Vite + Tailwind 4 + vite-plugin-pwa
    src/main.tsx          Rotas: cada módulo é uma rota de primeiro nível
    src/modal.tsx         Janela modal, sobre o <dialog> nativo
    src/modulos/wl/       O módulo WL, em duas telas:
      pagina.tsx            /wl       jejum + nota do dia + calendário
      peso.tsx              /wl/peso  pesagens, meta, IMC e gráfico
      acoes.tsx             O cadastro de ações, numa modal aberta de /wl
      grupos.tsx            Os tipos de dia, noutra modal de /wl
      dia.tsx               O cartão de pontuação e as ações do dia
      calendario.tsx        O mês em quadradinhos
      grafico.tsx           A linha do peso, em SVG puro
      jejum.tsx             O cronômetro no topo, e o histórico noutra modal
      calculos.ts           As contas, puras e testadas
      jejum-calculos.ts     Durações e agrupamento por dia, idem
    scripts/gerar-icones.mjs
scripts/
  tray.ps1                Ícone da bandeja
  criar-banco.ps1         Usuário + banco + .env + migrações
  publicar.ps1            Confere e faz backup antes de a versão nova ir ao ar
  publicar-no-tailnet.ps1 tailscale serve na 8443
  backup-banco.ps1        pg_dump com verificação
```

### Módulo novo

1. Tabelas no `schema.prisma` com prefixo próprio, e `npm run db:migrate`.
2. `apps/api/src/<modulo>/rotas.ts`, registrado em `server.ts` com prefixo `/api/<modulo>`.
3. `apps/web/src/modulos/<modulo>/`, uma rota em `main.tsx` e um cartão em `paginas/inicio.tsx`.

A tela de primeiro nível é a do uso diário. O que se ajusta de vez em quando
fica a um toque de distância, e não no meio do caminho — como sub-rota quando
é um assunto inteiro (`/wl/peso`), ou como modal quando é uma pausa no meio do
que se estava fazendo (o cadastro de ações). A modal usa o `<dialog>` nativo:
Esc, foco preso dentro e fundo inerte já vêm prontos, e reimplementar isso à
mão é onde a acessibilidade costuma se perder.

## Decisões que vale conhecer

**Pesagem é um dia, não um instante.** A coluna é `DATE` e a API troca
`AAAA-MM-DD`. Quem decide que dia é hoje é o celular de quem se pesou; o fuso
do servidor não entra na conta. Uma pesagem por dia: pesar de novo corrige
(é um `PUT` por dia — repetir a requisição com rede ruim é seguro).

**Peso é `DECIMAL(5,2)`, não float.** Float acumularia `0,1 + 0,2 =
0,30000000000000004` em qualquer soma.

**`timezone=UTC` na connection string.** O driver manda timestamps sem fuso, e
com a sessão em `America/Sao_Paulo` o Postgres os gravaria 3 horas deslocados,
em silêncio — bug real que o NihongoHub pegou.

**Os dados não vão para o cache do service worker.** Ele guarda só a casca do
app; `/api` sempre vai à rede, porque um peso servido do cache seria um peso
velho mostrado como atual.

**Ganho de peso não fica vermelho.** A variação mostra o sinal (`+0,3`), mas
em cor neutra: o app é para acompanhar, não para dar bronca numa oscilação
normal de água.

**Gráfico sem biblioteca.** Uma série, um eixo e a linha da meta cabem em ~100
linhas de SVG; uma lib de gráficos custaria centenas de KB no celular. O eixo
X é proporcional ao tempo — uma semana sem pesar aparece como um intervalo
longo, e não escondida. A meta só entra no gráfico quando está a até 5 kg do
menor peso; mais longe, achataria a linha num risco sem relevo.

**Prisma fixado em `^7.10.0`.** A tag `latest` do pacote aponta para um RC da
versão 8.

### A pontuação do dia

**Um dia perfeito vale 100%.** O denominador é a soma do que as ações positivas
valem, contando o alvo diário de cada uma (8 copos de água a 0,5 ponto entram
como 4). As negativas descontam, e a nota fica presa entre 0 e 100: abaixo não
haveria fundo, e acima a barra deixaria de significar "completo".

**Ação repetível precisa de alvo diário.** Sem ele, "1 copo de água, +0,5" não
teria denominador — dois copos ou vinte dariam dias igualmente indefinidos. O
alvo é o que fecha a conta; nas ações de marcar uma vez só, ele é 1.

**O dia tem um grupo, e é ele que decide tudo.** Dia de trabalho pede hábitos
diferentes de fim de semana, e fim de semana fora de casa pede outros. Cada
grupo é um tipo de dia; o grupo escolhido decide tanto as ações que aparecem
quanto o denominador — um sábado deixa de ser cobrado pelas metas de uma
segunda. Uma ação pode estar em vários grupos (`wl_acao_grupo` é muitos para
muitos), e **ação fora de grupo não aparece em dia nenhum**: é o preço de o
grupo ser recorte de verdade, e a tela do cadastro avisa quando alguma fica
solta.

**O grupo do dia vem do dia da semana, até alguém dizer o contrário.** Cada
grupo declara em que dias entra sozinho (`dias_da_semana`, 0 = domingo), e
quem resolve é o servidor, em `resolverGrupo` — a regra num lugar só, porque
em dois ela divergiria. O dia da semana sai da própria coluna `DATE`, que não
tem hora nem fuso: ler `getUTCDay()` ali é exato. Grupo que depende de onde
você vai passar o fim de semana fica sem dias marcados e só entra à mão.

Trocar o grupo de um dia **não apaga o que já foi marcado**: uma ação fora do
grupo novo some da tela, mas o registro fica e volta se a troca for desfeita.
Apagar seria perder trabalho por um toque que pode ter sido engano.

**Ação com opções entra pela melhor, não pela soma.** Uma ação pode ter
alternativas — "qual refeição?", "qual treino?" —, cada uma com seus pontos, e
escolhe-se uma por dia. No denominador entra só a **melhor** opção; somar todas
faria um 100% inatingível, já que fazer duas é impossível. Escolher uma que
vale menos rende crédito parcial, que é o comportamento desejado.

Opção negativa é permitida (um seletor de deslizes, "qual besteira comi?"), e
por isso a contribuição da ação para o dia perfeito é o máximo **ou zero**, o
que for maior: uma ação só de alternativas ruins não tem como somar, só
descontar quando escolhida.

Numa ação com opções o `pontos` da própria ação fica nulo — os pontos moram nas
opções. É a API que garante os dois feitios, porque o banco precisaria de
gatilho para isso. Houve um cadastro de "refeições" à parte antes disso; virou
caso particular deste mecanismo, e a migração converteu o que já existia.

**O passado não se mexe.** Cada registro guarda quanto valia o que foi marcado
na época (`pontos_na_epoca` — da opção escolhida, quando há uma), e cada dia
guarda o denominador que vigorava nele (`wl_dia.pontos_possiveis`). Sem isso, cadastrar um hábito novo hoje rebaixaria
em silêncio a nota de todos os dias anteriores — e um calendário que muda
sozinho não serve para olhar para trás. Reabrir um dia o refotografa inteiro:
numerador e denominador voltam juntos ao cadastro de agora, porque congelar só
um dos dois daria nota acima de 100% (ação nova somando sem entrar no total) ou
menor do que o dia mereceu.

**Mas hoje não é passado.** Mudar quanto vale um hábito ao meio-dia tem que
valer para o dia inteiro — senão a nota de hoje ficaria presa no preço de
quando você marcou a primeira coisa de manhã. Por isso o front chama
`POST /api/wl/dias/:dia/refotografar` depois de mexer no cadastro, passando o
dia que o aparelho considera hoje. Quem decide que dia é hoje continua sendo o
celular de quem está usando, nunca o fuso do servidor. Os dias anteriores
seguem parados; os **futuros** que já têm linha (grupo escolhido de antemão,
algo marcado) vão junto, porque ainda nem começaram.

**Dá para planejar os dias que vêm.** O calendário abre o futuro, e escolher o
grupo de um dia sem nada marcado fica gravado — é a única situação em que um
dia sem registro tem linha em `wl_dia`. Fora da média do mês, que só conta até
hoje.

**Dia sem registro é neutro, não é zero.** Ele aparece apagado no calendário e
fica fora das médias: o `/dias` só devolve dia que tem registro, mesmo que ele
tenha linha só para guardar o grupo. Esquecer de anotar não é
o mesmo que um dia ruim, e tratar os dois igual puniria justamente quem passou
o fim de semana longe do celular.

**Ação ou opção com histórico se arquiva, não se apaga.** A chave estrangeira é
RESTRICT e a API responde 409 explicando o porquê: apagar deixaria dias com
nota sem explicação. Arquivada, a ação some da tela do dia e continua
explicando o passado — e ainda dá para desmarcá-la num dia antigo, só não
marcar de novo. Opção que some do formulário segue a mesma regra: é apagada se
nunca foi escolhida, e arquivada se já.

### Jejum

O jejum é um bloco do WL, no topo da tela: enquanto um corre, o cronômetro é a
informação viva da página. Chegou a nascer como módulo próprio e foi trazido
para dentro — acompanhar jejum é acompanhar peso, não outro assunto. O
histórico e o lançamento à mão ficam numa modal, senão a lista empurraria a
nota do dia para fora da primeira tela.

**Jejum é instante, não dia.** É a diferença para o resto do app: pesagem é "o
dia 30", mas jejum é "das 20h07 às 12h15". Por isso `TIMESTAMPTZ`, e não a
coluna `DATE` das pesagens.

**O dia de um jejum é o dia em que ele começou**, mesmo que atravesse a
meia-noite — das 20h de segunda ao meio-dia de terça conta inteiro para
segunda. É como se fala ("comecei meu 16h na segunda") e é o que mantém cada
jejum numa linha só. Dividir pela meia-noite daria totais fisicamente mais
exatos, ao custo de o intervalo deixar de ser uma linha.

**O dia vem numa coluna própria, e não extraído de `inicio`.** A conexão roda
em UTC, então `inicio::date` jogaria um jejum começado às 21h de Brasília para
o dia seguinte, em silêncio. Quem decide o dia é o aparelho de quem jejua — a
mesma regra das pesagens.

**Só um jejum em aberto por vez,** garantido por índice único parcial
(`WHERE fim IS NULL`) e não só pela API: a trava fica no banco, onde um segundo
aparelho também esbarra nela. Intervalos sobrepostos são recusados com 409,
porque duas linhas no mesmo horário fariam o total do dia contar a mesma hora
duas vezes.

**A duração não sai da API.** Enquanto o jejum corre, ela depende de "agora", e
"agora" é o relógio de quem está olhando. O servidor entrega os instantes; a
contagem é função pura no front, testada com o `agora` entrando como
parâmetro.

**Dá para lançar e corrigir à mão.** Quem dorme e esquece de parar não precisa
apagar o registro inteiro: acerta o horário. O cronômetro é o caminho do dia a
dia, o formulário é a rede de segurança.

## Próximos passos

- Média móvel de 7 dias no gráfico (suaviza a oscilação diária)
- Sequência de dias bons (streak) e média móvel da pontuação
- Jejum: média de horas por semana, e o jejum mais longo
- Grupo sugerido também pelo histórico (dois sábados seguidos na mesma casa)
- Previsão de quando a meta será atingida, pela tendência recente
- Medidas corporais (cintura, etc.) no WL
- Próximos módulos do Trimly
