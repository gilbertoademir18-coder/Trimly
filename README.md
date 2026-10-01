# Trimly

App de acompanhamento de desenvolvimento pessoal, em módulos. O primeiro é o
**WL**: pesagens, meta, evolução e a pontuação de cada dia.

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
service worker do PWA funcionando como em produção. Depois de um `git pull`,
**Reiniciar** é tudo o que se precisa.

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
    src/wl/rotas.ts       /api/wl/*
  web/                    React 19 + Vite + Tailwind 4 + vite-plugin-pwa
    src/main.tsx          Rotas: cada módulo é uma rota de primeiro nível
    src/modal.tsx         Janela modal, sobre o <dialog> nativo
    src/modulos/wl/       O módulo WL, em duas telas:
      pagina.tsx            /wl       nota do dia + calendário
      peso.tsx              /wl/peso  pesagens, meta, IMC e gráfico
      acoes.tsx             O cadastro de ações, numa modal aberta de /wl
      refeicoes.tsx         O cardápio, noutra modal de /wl
      dia.tsx               O cartão de pontuação: ações e refeição do dia
      calendario.tsx        O mês em quadradinhos
      grafico.tsx           A linha do peso, em SVG puro
      calculos.ts           As contas, puras e testadas
    scripts/gerar-icones.mjs
scripts/
  tray.ps1                Ícone da bandeja
  criar-banco.ps1         Usuário + banco + .env + migrações
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

**A refeição do dia entra pela melhor, não pela soma.** O cardápio tem várias
refeições, cada uma com seus pontos, mas só cabe uma por dia — e é por isso que
ela é coluna de `wl_dia`, e não uma tabela de ligação: "uma por dia" vira
estrutura em vez de regra que alguém esquece de aplicar. No denominador entra
só a **melhor** refeição cadastrada; somar todas faria um 100% que ninguém
alcança, já que seguir duas é impossível. Escolher uma que vale menos rende
crédito parcial, que é o comportamento desejado. Os pontos são sempre positivos:
uma refeição que descontasse quebraria esse máximo.

**O passado não se mexe.** Cada registro guarda quantos pontos a ação valia na
época (`pontos_na_epoca`), a refeição escolhida guarda o seu
(`refeicao_pontos_na_epoca`), e cada dia guarda o denominador que vigorava nele
(`wl_dia.pontos_possiveis`). Sem isso, cadastrar um hábito novo hoje rebaixaria
em silêncio a nota de todos os dias anteriores — e um calendário que muda
sozinho não serve para olhar para trás. Reabrir um dia o refotografa inteiro:
numerador e denominador voltam juntos ao cadastro de agora, porque congelar só
um dos dois daria nota acima de 100% (ação nova somando sem entrar no total) ou
menor do que o dia mereceu.

**Dia sem registro é neutro, não é zero.** Ele não ganha linha em `wl_dia`,
aparece apagado no calendário e fica fora das médias. Esquecer de anotar não é
o mesmo que um dia ruim, e tratar os dois igual puniria justamente quem passou
o fim de semana longe do celular.

**Ação ou refeição com histórico se arquiva, não se apaga.** A chave estrangeira é RESTRICT
e a API responde 409 explicando o porquê: apagar deixaria dias com nota sem
explicação. Arquivada, a ação some da tela do dia e continua explicando o
passado — e ainda dá para desmarcá-la num dia antigo, só não marcar de novo.

## Próximos passos

- Média móvel de 7 dias no gráfico (suaviza a oscilação diária)
- Sequência de dias bons (streak) e média móvel da pontuação
- Previsão de quando a meta será atingida, pela tendência recente
- Medidas corporais (cintura, etc.) no WL
- Próximos módulos do Trimly
