import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";
import { dateParaDia } from "../lib/datas.ts";
import { prisma } from "../lib/prisma.ts";
import { Dia, primeiroErro } from "../lib/validacao.ts";

/**
 * Rotas do módulo WL, montadas em `/api/wl`.
 *
 * O peso viaja como número em kg. No banco ele é DECIMAL(5,2) — float
 * acumularia 0,1 + 0,2 = 0,30000000000000004 nas somas —, e é aqui, na saída,
 * que vira número de novo.
 */

// Limites largos de propósito: só barram erro de digitação (72 virando 7,2 ou
// 720), sem opinar sobre o peso de ninguém.
const Peso = z
  .number({ error: "precisa ser um número" })
  .min(20, "abaixo de 20 kg — erro de digitação?")
  .max(400, "acima de 400 kg — erro de digitação?");

const CorpoPesagem = z.object({
  pesoKg: Peso,
  nota: z
    .string()
    .trim()
    .max(500, "no máximo 500 caracteres")
    .nullish()
    .transform((n) => n || null),
});

const CorpoMeta = z.object({
  pesoAlvo: Peso,
  alturaCm: z
    .number()
    .int("em centímetros, sem vírgula")
    .min(100, "em centímetros: 175, não 1,75")
    .max(250, "acima de 250 cm — erro de digitação?")
    .nullish(),
});

type LinhaPesagem = { data: Date; pesoKg: { toNumber(): number }; nota: string | null };
type LinhaMeta = { pesoAlvo: { toNumber(): number }; alturaCm: number | null };

const pesagemParaJson = (p: LinhaPesagem) => ({
  data: dateParaDia(p.data),
  pesoKg: p.pesoKg.toNumber(),
  nota: p.nota,
});

const metaParaJson = (m: LinhaMeta) => ({ pesoAlvo: m.pesoAlvo.toNumber(), alturaCm: m.alturaCm });

// Pontos cabem em DECIMAL(5,2) e o sinal é quem diz se a ação soma ou
// desconta. Zero é barrado aqui e no banco: ação que não vale nada só ocupa
// espaço na tela do dia.
const Pontos = z
  .number({ error: "precisa ser um número" })
  .min(-999.99, "entre -999,99 e 999,99")
  .max(999.99, "entre -999,99 e 999,99")
  .refine((v) => v !== 0, "uma ação que vale zero não muda a nota de nenhum dia")
  .refine((v) => Number.isInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-9,
    "no máximo duas casas decimais");

/*
 * Uma opção de uma ação. `id` ausente é opção nova; presente, é edição — o
 * formulário manda a lista inteira e o servidor concilia.
 */
const CorpoOpcao = z.object({
  id: z.number().int().min(1).optional(),
  nome: z.string().trim().min(1, "diga o nome da opção").max(80, "no máximo 80 caracteres"),
  pontos: Pontos,
  ativa: z.boolean().default(true),
});

const CorpoGrupo = z.object({
  nome: z.string().trim().min(1, "diga o nome do grupo").max(80, "no máximo 80 caracteres"),
  /*
   * 0 = domingo … 6 = sábado. Vazio é "só manual": o grupo do fim de semana na
   * casa de alguém não tem como ser adivinhado pelo calendário.
   */
  diasDaSemana: z
    .array(z.number().int().min(0, "0 a 6").max(6, "0 a 6"))
    .max(7, "no máximo sete dias")
    .default([])
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  ativo: z.boolean().default(true),
  ordem: z.number().int().min(0).max(999).default(0),
});

const CorpoGrupoDoDia = z.object({
  /** `null` tira o grupo do dia e o devolve ao que o dia da semana sugere. */
  grupoId: z.number().int().min(1).nullable(),
});

type LinhaGrupo = {
  id: number;
  nome: string;
  diasDaSemana: number[];
  ativo: boolean;
  ordem: number;
};

const grupoParaJson = (g: LinhaGrupo) => ({
  id: g.id,
  nome: g.nome,
  diasDaSemana: g.diasDaSemana,
  ativo: g.ativo,
  ordem: g.ordem,
});

/*
 * Uma ação é de um de dois feitios, e o que separa os dois é ter opções:
 *
 *   sem opções  pontos próprios, pode ser repetível com alvo diário
 *   com opções  os pontos moram nas opções, e escolhe-se uma por dia
 *
 * As combinações impossíveis são barradas aqui, e não só na tela: a API é a
 * fronteira que o banco não consegue guardar sozinho (seria preciso gatilho).
 */
const CorpoAcao = z
  .object({
    nome: z.string().trim().min(1, "diga o nome da ação").max(80, "no máximo 80 caracteres"),
    pontos: Pontos.nullish().transform((p) => p ?? null),
    repetivel: z.boolean().default(false),
    alvoDiario: z
      .number()
      .int("em vezes por dia, sem vírgula")
      .min(1, "pelo menos 1")
      .max(99, "no máximo 99")
      .default(1),
    ativa: z.boolean().default(true),
    ordem: z.number().int().min(0).max(999).default(0),
    opcoes: z.array(CorpoOpcao).max(50, "no máximo 50 opções").default([]),
    /*
     * Os grupos em que a ação aparece. Lista vazia é ação que não aparece em
     * dia nenhum — permitido, porque é o estado natural de quem acabou de
     * criar a ação e ainda não a encaixou.
     */
    grupos: z.array(z.number().int().min(1)).max(50).default([]),
  })
  .refine((a) => a.repetivel || a.alvoDiario === 1, {
    message: "alvo maior que 1 só faz sentido em ação repetível",
    path: ["alvoDiario"],
  })
  .refine((a) => a.opcoes.length > 0 || a.pontos !== null, {
    message: "diga quantos pontos a ação vale, ou cadastre opções",
    path: ["pontos"],
  })
  .refine((a) => a.opcoes.length === 0 || a.pontos === null, {
    message: "numa ação com opções os pontos ficam nas opções",
    path: ["pontos"],
  })
  .refine((a) => a.opcoes.length === 0 || !a.repetivel, {
    message: "ação com opções escolhe uma por dia: não pode ser repetível",
    path: ["repetivel"],
  });

/*
 * Quantidade zero é o pedido para apagar o registro — a mesma rota marca,
 * corrige e desmarca. `opcaoId` só vale nas ações que têm opções.
 */
const CorpoRegistro = z.object({
  quantidade: z.number().int("sem vírgula").min(0, "não pode ser negativa").max(99, "no máximo 99"),
  opcaoId: z
    .number()
    .int()
    .min(1)
    .nullish()
    .transform((o) => o ?? null),
});

const Intervalo = z
  .object({
    de: z.string({ error: "informe de=AAAA-MM-DD" }).pipe(Dia),
    ate: z.string({ error: "informe ate=AAAA-MM-DD" }).pipe(Dia),
  })
  .refine((i) => i.de <= i.ate, { message: "o início vem depois do fim", path: ["de"] });

type LinhaOpcao = {
  id: number;
  nome: string;
  pontos: { toNumber(): number };
  ativa: boolean;
  ordem: number;
};

type LinhaAcao = {
  id: number;
  nome: string;
  pontos: { toNumber(): number } | null;
  repetivel: boolean;
  alvoDiario: number;
  ativa: boolean;
  ordem: number;
  opcoes?: LinhaOpcao[];
  grupos?: { grupoId: number }[];
};

const opcaoParaJson = (o: LinhaOpcao) => ({
  id: o.id,
  nome: o.nome,
  pontos: o.pontos.toNumber(),
  ativa: o.ativa,
  ordem: o.ordem,
});

const acaoParaJson = (a: LinhaAcao) => ({
  id: a.id,
  nome: a.nome,
  // `null` quando os pontos moram nas opções.
  pontos: a.pontos?.toNumber() ?? null,
  repetivel: a.repetivel,
  alvoDiario: a.alvoDiario,
  ativa: a.ativa,
  ordem: a.ordem,
  opcoes: (a.opcoes ?? []).map(opcaoParaJson),
  grupos: (a.grupos ?? []).map((g) => g.grupoId),
});

/** As opções sempre vêm na ordem do formulário. */
const COM_OPCOES = {
  opcoes: { orderBy: [{ ordem: "asc" }, { nome: "asc" }] },
  grupos: { select: { grupoId: true } },
} satisfies Prisma.WlAcaoInclude;

/**
 * Regrava os grupos de uma ação.
 *
 * Apaga e recria em vez de conciliar: a ligação não guarda nada além dos dois
 * ids, então não há o que preservar — e isto é mais curto que comparar listas.
 */
async function salvarGruposDaAcao(tx: Prisma.TransactionClient, acaoId: number, grupos: number[]) {
  await tx.wlAcaoGrupo.deleteMany({ where: { acaoId } });
  const unicos = [...new Set(grupos)];
  if (unicos.length > 0) {
    await tx.wlAcaoGrupo.createMany({ data: unicos.map((grupoId) => ({ acaoId, grupoId })) });
  }
}

/**
 * O grupo que vale num dia: o que já estava gravado, ou o que o dia da semana
 * sugere.
 *
 * O dia da semana sai da própria coluna DATE, que não tem hora nem fuso — ler
 * `getUTCDay()` aqui é exato, diferente do que seria num TIMESTAMPTZ.
 *
 * Empate entre grupos que cobrem o mesmo dia resolve por `ordem` e depois id:
 * alguém tem que ganhar, e a regra precisa ser estável entre uma chamada e
 * outra.
 */
async function resolverGrupo(tx: Prisma.TransactionClient, data: Date, jaGravado: number | null) {
  if (jaGravado !== null) return jaGravado;

  const doDia = await tx.wlGrupo.findMany({
    where: { ativo: true, diasDaSemana: { has: data.getUTCDay() } },
    orderBy: [{ ordem: "asc" }, { id: "asc" }],
    take: 1,
  });
  return doDia[0]?.id ?? null;
}

/**
 * Concilia a lista de opções que o formulário mandou com a que está no banco.
 *
 * Opção que sumiu do formulário é apagada se nunca foi escolhida, e arquivada
 * se já — apagar deixaria o dia que a escolheu com nota sem explicação, o
 * mesmo motivo que vale para as ações.
 */
async function salvarOpcoes(
  tx: Prisma.TransactionClient,
  acaoId: number,
  opcoes: { id?: number; nome: string; pontos: number; ativa: boolean }[],
) {
  const existentes = await tx.wlAcaoOpcao.findMany({ where: { acaoId } });
  const mandadas = new Set(opcoes.map((o) => o.id).filter((id): id is number => id !== undefined));

  for (const e of existentes) {
    if (mandadas.has(e.id)) continue;
    const usos = await tx.wlRegistro.count({ where: { opcaoId: e.id } });
    if (usos === 0) await tx.wlAcaoOpcao.delete({ where: { id: e.id } });
    else if (e.ativa) await tx.wlAcaoOpcao.update({ where: { id: e.id }, data: { ativa: false } });
  }

  // A ordem sai da posição no formulário: arrastar lá é reordenar aqui.
  for (const [i, o] of opcoes.entries()) {
    const dados = { nome: o.nome, pontos: o.pontos, ativa: o.ativa, ordem: i };
    if (o.id === undefined) await tx.wlAcaoOpcao.create({ data: { acaoId, ...dados } });
    else await tx.wlAcaoOpcao.update({ where: { id: o.id }, data: dados });
  }
}

/**
 * Quanto vale um dia perfeito com o cadastro de agora.
 *
 * Conta só as ações do grupo do dia: um sábado não é cobrado pelas metas de
 * uma segunda. Sem grupo não há o que medir, e o total é zero.
 *
 * As ações sem opções entram pelo alvo diário (8 copos de água a 0,5 somam 4).
 * As com opções entram pela MELHOR opção, e não pela soma: só cabe uma por
 * dia, então somar todas faria um 100% que ninguém consegue alcançar. O
 * GREATEST(..., 0) existe para a ação cujas opções são todas negativas (um
 * seletor de deslizes): ela não tem como somar para o dia perfeito.
 *
 * A conta fica no Postgres: multiplicar e somar `numeric` lá é exato, e trazer
 * o cadastro inteiro para somar em JS seria pior nos dois quesitos. O
 * `::float8` é de propósito — com driver adapter, numeric cru pode voltar como
 * texto. A soma acontece em numeric (exata) e só o resultado vira número, a
 * mesma fronteira do `.toNumber()` do resto.
 */
async function calcularPossiveis(
  tx: Prisma.TransactionClient,
  grupoId: number | null,
): Promise<number> {
  if (grupoId === null) return 0;

  const linhas = await tx.$queryRaw<{ total: number }[]>`
    SELECT (
      COALESCE((
        SELECT SUM(a."pontos" * a."alvo_diario")
        FROM "wl_acao" a
        JOIN "wl_acao_grupo" ag ON ag."acao_id" = a."id"
        WHERE a."ativa" AND a."pontos" > 0 AND ag."grupo_id" = ${grupoId}
      ), 0)
      + COALESCE((
        SELECT SUM(GREATEST(m."melhor", 0))
        FROM (
          SELECT MAX(o."pontos") AS "melhor"
          FROM "wl_acao_opcao" o
          JOIN "wl_acao" a ON a."id" = o."acao_id"
          JOIN "wl_acao_grupo" ag ON ag."acao_id" = a."id"
          WHERE a."ativa" AND o."ativa" AND ag."grupo_id" = ${grupoId}
          GROUP BY o."acao_id"
        ) m
      ), 0)
    )::float8 AS total
  `;
  return linhas[0]!.total;
}

/**
 * Regrava a foto do dia e devolve o total possível.
 *
 * Um dia guarda o cadastro como ele estava quando você mexeu nele pela última
 * vez: os registros voltam a valer o que a ação (ou a opção) vale agora, e o
 * denominador é recalculado na mesma transação. Congelar só uma parte daria
 * dia acima de 100% (item novo somando sem entrar no total) ou nota menor do
 * que o dia mereceu. Dia em que você não encosta nunca muda — era esse o ponto
 * de congelar.
 */
async function refotografarDia(tx: Prisma.TransactionClient, data: Date) {
  const [registros, dia] = await Promise.all([
    tx.wlRegistro.findMany({ where: { data }, include: { acao: true, opcao: true } }),
    tx.wlDia.findUnique({ where: { data } }),
  ]);

  // Dia sem registro não ganha linha em `wl_dia`: ele fica neutro no
  // calendário, em vez de virar um zero que puxa a média para baixo só porque
  // ninguém anotou nada. A exceção é o dia em que alguém escolheu o grupo —
  // típico de deixar a semana que vem planejada. A linha guarda a escolha, e o
  // calendário continua tratando o dia como neutro (ele só lê dias com
  // registro).
  if (registros.length === 0 && dia?.grupoId == null) {
    await tx.wlDia.deleteMany({ where: { data } });
    return null;
  }

  for (const r of registros) {
    // Numa ação com opções quem vale é a opção escolhida; nas demais, a ação.
    const agora = r.opcao?.pontos ?? r.acao.pontos;
    if (agora !== null && !r.pontosNaEpoca.equals(agora)) {
      await tx.wlRegistro.update({
        where: { data_acaoId: { data, acaoId: r.acaoId } },
        data: { pontosNaEpoca: agora },
      });
    }
  }

  // Dia já gravado mantém o grupo que tinha; dia novo recebe o que o dia da
  // semana sugere. Reabrir um dia antigo (sem grupo) atribui um — faz parte de
  // refotografar, que é sempre o cadastro de agora.
  const grupoId = await resolverGrupo(tx, data, dia?.grupoId ?? null);
  const total = await calcularPossiveis(tx, grupoId);

  await tx.wlDia.upsert({
    where: { data },
    create: { data, pontosPossiveis: total, grupoId },
    update: { pontosPossiveis: total, grupoId },
  });
  return total;
}

/**
 * O dia como a tela precisa dele: os registros e o denominador em vigor.
 *
 * A porcentagem não sai daqui. Ela é uma conta pura, mora em `calculos.ts` no
 * front e é testada lá — a API entrega os fatos, uma vez só, e quem mostra
 * decide como mostrar.
 */
async function lerDia(data: Date) {
  const [dia, registros] = await Promise.all([
    prisma.wlDia.findUnique({ where: { data } }),
    prisma.wlRegistro.findMany({ where: { data }, orderBy: { acaoId: "asc" } }),
  ]);

  /*
   * `grupoEfetivoId` é o que a tela usa para saber quais ações mostrar: o
   * gravado, ou o que o dia da semana sugere enquanto ninguém escolheu. A
   * regra fica aqui, e não no front, para não existir em dois lugares e
   * divergir.
   */
  const grupoEfetivoId = await resolverGrupo(prisma, data, dia?.grupoId ?? null);

  return {
    data: dateParaDia(data),
    pontosPossiveis: dia ? dia.pontosPossiveis.toNumber() : null,
    grupoId: dia?.grupoId ?? null,
    grupoEfetivoId,
    registros: registros.map((r) => ({
      acaoId: r.acaoId,
      opcaoId: r.opcaoId,
      quantidade: r.quantidade,
      pontosNaEpoca: r.pontosNaEpoca.toNumber(),
    })),
  };
}

export async function rotasWl(app: FastifyInstance) {
  app.get("/pesagens", async () => {
    const pesagens = await prisma.wlPesagem.findMany({ orderBy: { data: "asc" } });
    return pesagens.map(pesagemParaJson);
  });

  // PUT pelo dia, e não POST: pesar de novo no mesmo dia corrige a pesagem
  // em vez de duplicar. Repetir a requisição (rede ruim no celular) é seguro.
  app.put<{ Params: { dia: string } }>("/pesagens/:dia", async (req, reply) => {
    const dia = Dia.safeParse(req.params.dia);
    if (!dia.success) return reply.code(400).send({ erro: primeiroErro(dia.error) });
    const corpo = CorpoPesagem.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const pesagem = await prisma.wlPesagem.upsert({
      where: { data: dia.data },
      create: { data: dia.data, ...corpo.data },
      update: corpo.data,
    });
    return pesagemParaJson(pesagem);
  });

  app.delete<{ Params: { dia: string } }>("/pesagens/:dia", async (req, reply) => {
    const dia = Dia.safeParse(req.params.dia);
    if (!dia.success) return reply.code(400).send({ erro: primeiroErro(dia.error) });

    // deleteMany em vez de delete: apagar o que já não existe é sucesso, não
    // erro — o resultado desejado ("não há pesagem neste dia") foi atingido.
    await prisma.wlPesagem.deleteMany({ where: { data: dia.data } });
    return reply.code(204).send();
  });

  app.get("/meta", async () => {
    const meta = await prisma.wlMeta.findUnique({ where: { id: 1 } });
    return meta ? metaParaJson(meta) : null;
  });

  app.put("/meta", async (req, reply) => {
    const corpo = CorpoMeta.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const dados = { pesoAlvo: corpo.data.pesoAlvo, alturaCm: corpo.data.alturaCm ?? null };
    const meta = await prisma.wlMeta.upsert({
      where: { id: 1 },
      create: { id: 1, ...dados },
      update: dados,
    });
    return metaParaJson(meta);
  });

  // -------------------------------------------------------------------------
  // Cadastro de ações
  // -------------------------------------------------------------------------

  // Devolve arquivadas também: a tela do cadastro precisa delas para
  // desarquivar, e a do dia filtra por `ativa`.
  app.get("/acoes", async () => {
    const acoes = await prisma.wlAcao.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: COM_OPCOES,
    });
    return acoes.map(acaoParaJson);
  });

  app.post("/acoes", async (req, reply) => {
    const corpo = CorpoAcao.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const { opcoes, grupos, ...dados } = corpo.data;
    const acao = await prisma.$transaction(async (tx) => {
      const criada = await tx.wlAcao.create({ data: dados });
      await salvarOpcoes(tx, criada.id, opcoes);
      await salvarGruposDaAcao(tx, criada.id, grupos);
      return tx.wlAcao.findUniqueOrThrow({ where: { id: criada.id }, include: COM_OPCOES });
    });
    return reply.code(201).send(acaoParaJson(acao));
  });

  // Mudar os pontos vale de hoje em diante. Os dias já registrados guardam o
  // que a ação valia na época e só são reavaliados se você reabrir o dia.
  app.put<{ Params: { id: string } }>("/acoes/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ erro: "Id inválido." });
    const corpo = CorpoAcao.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const existe = await prisma.wlAcao.findUnique({ where: { id }, include: { opcoes: true } });
    if (!existe) return reply.code(404).send({ erro: "Ação não encontrada." });

    const { opcoes, grupos, ...dados } = corpo.data;

    // Opção de outra ação no corpo seria um jeito silencioso de roubá-la.
    const alheia = opcoes.find((o) => o.id !== undefined && !existe.opcoes.some((e) => e.id === o.id));
    if (alheia) return reply.code(400).send({ erro: "Opção que não é desta ação." });

    const acao = await prisma.$transaction(async (tx) => {
      await tx.wlAcao.update({ where: { id }, data: dados });
      await salvarOpcoes(tx, id, opcoes);
      await salvarGruposDaAcao(tx, id, grupos);
      return tx.wlAcao.findUniqueOrThrow({ where: { id }, include: COM_OPCOES });
    });
    return acaoParaJson(acao);
  });

  app.delete<{ Params: { id: string } }>("/acoes/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ erro: "Id inválido." });

    // Apagar uma ação com histórico deixaria dias com nota sem explicação —
    // e o banco barraria de qualquer forma (a chave é RESTRICT). Arquivar faz
    // ela sumir da tela do dia e continuar explicando o passado.
    const usos = await prisma.wlRegistro.count({ where: { acaoId: id } });
    if (usos > 0) {
      return reply.code(409).send({
        erro: `Esta ação já aparece em ${usos} ${usos === 1 ? "dia" : "dias"}. Arquive em vez de apagar, para o histórico continuar explicável.`,
      });
    }

    // deleteMany pelo mesmo motivo das pesagens: apagar o que já não existe é
    // sucesso, não erro.
    await prisma.wlAcao.deleteMany({ where: { id } });
    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // Grupos de ações
  // -------------------------------------------------------------------------

  app.get("/grupos", async () => {
    const grupos = await prisma.wlGrupo.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
    return grupos.map(grupoParaJson);
  });

  app.post("/grupos", async (req, reply) => {
    const corpo = CorpoGrupo.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const grupo = await prisma.wlGrupo.create({ data: corpo.data });
    return reply.code(201).send(grupoParaJson(grupo));
  });

  app.put<{ Params: { id: string } }>("/grupos/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ erro: "Id inválido." });
    const corpo = CorpoGrupo.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const existe = await prisma.wlGrupo.findUnique({ where: { id } });
    if (!existe) return reply.code(404).send({ erro: "Grupo não encontrado." });

    const grupo = await prisma.wlGrupo.update({ where: { id }, data: corpo.data });
    return grupoParaJson(grupo);
  });

  app.delete<{ Params: { id: string } }>("/grupos/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ erro: "Id inválido." });

    // Só conta dia com registro: o que tem apenas o grupo escolhido é um
    // plano, não histórico.
    const dias = await prisma.wlDia.findMany({ where: { grupoId: id }, select: { data: true } });
    const comRegistro = await prisma.wlRegistro.findMany({
      where: { data: { in: dias.map((d) => d.data) } },
      distinct: ["data"],
      select: { data: true },
    });
    const usos = comRegistro.length;
    if (usos > 0) {
      return reply.code(409).send({
        erro: `Este grupo já valeu em ${usos} ${usos === 1 ? "dia" : "dias"}. Arquive em vez de apagar, para o histórico continuar explicável.`,
      });
    }

    // Os dias planejados com este grupo voltam a seguir o dia da semana — a
    // linha deles só existia para guardar a escolha. As ligações com as ações
    // caem junto (a chave é CASCADE): elas não são dado em si, só a ligação.
    await prisma.$transaction([
      prisma.wlDia.deleteMany({ where: { grupoId: id } }),
      prisma.wlGrupo.deleteMany({ where: { id } }),
    ]);
    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // Pontuação dos dias
  // -------------------------------------------------------------------------

  /*
   * O calendário pede um intervalo e recebe só os dias que têm registro. Dia
   * sem registro é dia neutro: ele não vem, e a tela o desenha apagado em vez
   * de fingir um zero. Por isso o JOIN, e não LEFT JOIN: um dia que só tem o
   * grupo escolhido também tem linha em `wl_dia`, e não pode virar 0%.
   */
  app.get("/dias", async (req, reply) => {
    const intervalo = Intervalo.safeParse(req.query);
    if (!intervalo.success) return reply.code(400).send({ erro: primeiroErro(intervalo.error) });

    const linhas = await prisma.$queryRaw<{ data: Date; pontos: number; possiveis: number }[]>`
      SELECT d."data",
             COALESCE(SUM(r."pontos_na_epoca" * r."quantidade"), 0)::float8 AS pontos,
             d."pontos_possiveis"::float8 AS possiveis
      FROM "wl_dia" d
      JOIN "wl_registro" r ON r."data" = d."data"
      WHERE d."data" BETWEEN ${intervalo.data.de} AND ${intervalo.data.ate}
      GROUP BY d."data", d."pontos_possiveis"
      ORDER BY d."data"
    `;

    return linhas.map((l) => ({
      data: dateParaDia(l.data),
      pontos: l.pontos,
      pontosPossiveis: l.possiveis,
    }));
  });

  /*
   * Tira a foto do dia de novo, com o cadastro de agora.
   *
   * Editar uma ação não mexe nos dias por si só — é o que mantém o passado
   * parado. Mas o dia de hoje ainda está sendo vivido: mudar quanto vale um
   * hábito ao meio-dia tem que valer para o dia inteiro, que é o "de hoje em
   * diante" prometido na tela do cadastro.
   *
   * Quem chama é o front, depois de mexer no cadastro, e passando o dia que o
   * aparelho considera hoje — a mesma regra do resto do WL: quem decide que dia
   * é hoje é o celular de quem está usando, nunca o fuso do servidor.
   *
   * Os dias depois dele vão junto: um dia futuro já planejado (grupo escolhido,
   * algo marcado) ainda nem começou, e tem que chegar com o cadastro de agora.
   *
   * Não muda o que foi marcado, só o quanto vale. Repetir é inofensivo.
   */
  app.post<{ Params: { dia: string } }>("/dias/:dia/refotografar", async (req, reply) => {
    const dia = Dia.safeParse(req.params.dia);
    if (!dia.success) return reply.code(400).send({ erro: primeiroErro(dia.error) });

    await prisma.$transaction(async (tx) => {
      const adiante = await tx.wlDia.findMany({ where: { data: { gt: dia.data } }, select: { data: true } });
      for (const data of [dia.data, ...adiante.map((d) => d.data)]) {
        await refotografarDia(tx, data);
      }
    });
    return lerDia(dia.data);
  });

  /*
   * O grupo do dia: escolher, trocar e tirar na mesma requisição. `null` tira,
   * e o dia volta a seguir o que o dia da semana sugere.
   */
  app.put<{ Params: { dia: string } }>("/dias/:dia/grupo", async (req, reply) => {
    const dia = Dia.safeParse(req.params.dia);
    if (!dia.success) return reply.code(400).send({ erro: primeiroErro(dia.error) });
    const corpo = CorpoGrupoDoDia.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const { grupoId } = corpo.data;
    if (grupoId !== null) {
      const grupo = await prisma.wlGrupo.findUnique({ where: { id: grupoId } });
      if (!grupo) return reply.code(404).send({ erro: "Grupo não encontrado." });
      if (!grupo.ativo) {
        return reply.code(409).send({ erro: "Este grupo está arquivado. Reative-o para voltar a usá-lo." });
      }
    }

    await prisma.$transaction(async (tx) => {
      /*
       * Trocar o grupo não apaga o que já foi marcado: uma ação que não está no
       * grupo novo some da tela, mas o registro fica — e volta a aparecer se o
       * grupo for desfeito. Apagar seria perder trabalho por uma troca que
       * pode ter sido engano.
       */
      const existente = await tx.wlDia.findUnique({ where: { data: dia.data } });
      if (existente) {
        await tx.wlDia.update({ where: { data: dia.data }, data: { grupoId } });
      } else if (grupoId !== null) {
        const possiveis = await calcularPossiveis(tx, grupoId);
        await tx.wlDia.create({ data: { data: dia.data, pontosPossiveis: possiveis, grupoId } });
      }
      await refotografarDia(tx, dia.data);
    });

    return lerDia(dia.data);
  });

  app.get<{ Params: { dia: string } }>("/dias/:dia", async (req, reply) => {
    const dia = Dia.safeParse(req.params.dia);
    if (!dia.success) return reply.code(400).send({ erro: primeiroErro(dia.error) });
    return lerDia(dia.data);
  });

  /*
   * Marcar, corrigir e desmarcar são a mesma requisição: PUT da quantidade,
   * pela mesma razão do PUT das pesagens — repetir com rede ruim no celular é
   * seguro. Quantidade 0 apaga o registro.
   */
  app.put<{ Params: { dia: string; acaoId: string } }>("/dias/:dia/acoes/:acaoId", async (req, reply) => {
    const dia = Dia.safeParse(req.params.dia);
    if (!dia.success) return reply.code(400).send({ erro: primeiroErro(dia.error) });
    const acaoId = Number(req.params.acaoId);
    if (!Number.isInteger(acaoId) || acaoId < 1) return reply.code(400).send({ erro: "Id inválido." });
    const corpo = CorpoRegistro.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const { quantidade, opcaoId } = corpo.data;
    const acao = await prisma.wlAcao.findUnique({ where: { id: acaoId }, include: { opcoes: true } });
    if (!acao) return reply.code(404).send({ erro: "Ação não encontrada." });

    // Desmarcar uma arquivada continua valendo: é assim que se limpa um dia
    // depois de arquivar a ação. Só marcar é que não.
    if (!acao.ativa && quantidade > 0) {
      return reply.code(409).send({ erro: "Esta ação está arquivada. Reative-a para voltar a usá-la." });
    }

    /*
     * Quanto o registro vai valer. Numa ação com opções é a opção escolhida;
     * nas demais, a própria ação. É aqui que as duas formas se encontram, e
     * daqui para baixo o resto da rota não precisa saber qual delas era.
     */
    const temOpcoes = acao.opcoes.length > 0;
    let pontos = acao.pontos;

    if (temOpcoes) {
      if (quantidade > 1) {
        return reply.code(400).send({ erro: `"${acao.nome}" tem opções: escolhe-se uma por dia.` });
      }
      if (quantidade === 1) {
        if (opcaoId === null) return reply.code(400).send({ erro: "Diga qual opção foi escolhida." });
        const opcao = acao.opcoes.find((o) => o.id === opcaoId);
        if (!opcao) return reply.code(404).send({ erro: "Opção não encontrada nesta ação." });
        if (!opcao.ativa) {
          return reply.code(409).send({ erro: "Esta opção está arquivada. Reative-a para voltar a usá-la." });
        }
        pontos = opcao.pontos;
      }
    } else {
      if (opcaoId !== null) {
        return reply.code(400).send({ erro: `"${acao.nome}" não tem opções.` });
      }
      if (!acao.repetivel && quantidade > 1) {
        return reply.code(400).send({ erro: `"${acao.nome}" não é repetível: conta no máximo uma vez por dia.` });
      }
    }

    // Só acontece se o cadastro tiver escapado das validações do CorpoAcao.
    if (quantidade > 0 && pontos === null) {
      return reply.code(409).send({ erro: `"${acao.nome}" está sem pontos e sem opções.` });
    }

    await prisma.$transaction(async (tx) => {
      if (quantidade === 0) {
        await tx.wlRegistro.deleteMany({ where: { data: dia.data, acaoId } });
      } else {
        const dados = { quantidade, opcaoId: temOpcoes ? opcaoId : null, pontosNaEpoca: pontos! };
        await tx.wlRegistro.upsert({
          where: { data_acaoId: { data: dia.data, acaoId } },
          create: { data: dia.data, acaoId, ...dados },
          update: dados,
        });
      }
      await refotografarDia(tx, dia.data);
    });

    // O dia inteiro de volta: a tela atualiza a nota sem uma segunda viagem.
    return lerDia(dia.data);
  });
}
