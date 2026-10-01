import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";
import { dateParaDia, diaParaDate } from "../lib/datas.ts";
import { prisma } from "../lib/prisma.ts";

/**
 * Rotas do módulo WL, montadas em `/api/wl`.
 *
 * O peso viaja como número em kg. No banco ele é DECIMAL(5,2) — float
 * acumularia 0,1 + 0,2 = 0,30000000000000004 nas somas —, e é aqui, na saída,
 * que vira número de novo.
 */

const Dia = z.string().transform((valor, ctx) => {
  const data = diaParaDate(valor);
  if (!data) {
    ctx.addIssue({ code: "custom", message: "Data inválida: use AAAA-MM-DD." });
    return z.NEVER;
  }
  return data;
});

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

function primeiroErro(erro: z.ZodError | undefined): string {
  const problema = erro?.issues[0];
  if (!problema) return "Requisição inválida.";
  const campo = problema.path.join(".");
  return campo ? `${campo}: ${problema.message}` : problema.message;
}

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

const CorpoAcao = z
  .object({
    nome: z.string().trim().min(1, "diga o nome da ação").max(80, "no máximo 80 caracteres"),
    pontos: Pontos,
    repetivel: z.boolean().default(false),
    alvoDiario: z
      .number()
      .int("em vezes por dia, sem vírgula")
      .min(1, "pelo menos 1")
      .max(99, "no máximo 99")
      .default(1),
    ativa: z.boolean().default(true),
    ordem: z.number().int().min(0).max(999).default(0),
  })
  .refine((a) => a.repetivel || a.alvoDiario === 1, {
    message: "alvo maior que 1 só faz sentido em ação repetível",
    path: ["alvoDiario"],
  });

const CorpoRefeicao = z.object({
  nome: z.string().trim().min(1, "diga o nome da refeição").max(80, "no máximo 80 caracteres"),
  descricao: z
    .string()
    .trim()
    .max(1000, "no máximo 1000 caracteres")
    .nullish()
    .transform((d) => d || null),
  // Positivo e nunca zero: o "dia perfeito" conta a melhor refeição
  // cadastrada, e um valor negativo quebraria esse máximo.
  pontos: Pontos.refine((v) => v > 0, "a refeição soma pontos: use um valor positivo"),
  ativa: z.boolean().default(true),
  ordem: z.number().int().min(0).max(999).default(0),
});

// `null` tira a refeição do dia. Mesma ideia da quantidade zero nos registros:
// uma rota só escolhe, troca e desmarca.
const CorpoRefeicaoDoDia = z.object({
  refeicaoId: z.number().int().min(1).nullable(),
});

type LinhaRefeicao = {
  id: number;
  nome: string;
  descricao: string | null;
  pontos: { toNumber(): number };
  ativa: boolean;
  ordem: number;
};

const refeicaoParaJson = (r: LinhaRefeicao) => ({
  id: r.id,
  nome: r.nome,
  descricao: r.descricao,
  pontos: r.pontos.toNumber(),
  ativa: r.ativa,
  ordem: r.ordem,
});

// Quantidade zero não é um registro de "fiz zero vezes": é o pedido para
// apagar o registro. Assim a mesma rota marca, corrige e desmarca.
const CorpoRegistro = z.object({
  quantidade: z.number().int("sem vírgula").min(0, "não pode ser negativa").max(99, "no máximo 99"),
});

const Intervalo = z
  .object({
    de: z.string({ error: "informe de=AAAA-MM-DD" }).pipe(Dia),
    ate: z.string({ error: "informe ate=AAAA-MM-DD" }).pipe(Dia),
  })
  .refine((i) => i.de <= i.ate, { message: "o início vem depois do fim", path: ["de"] });

type LinhaAcao = {
  id: number;
  nome: string;
  pontos: { toNumber(): number };
  repetivel: boolean;
  alvoDiario: number;
  ativa: boolean;
  ordem: number;
};

const acaoParaJson = (a: LinhaAcao) => ({
  id: a.id,
  nome: a.nome,
  pontos: a.pontos.toNumber(),
  repetivel: a.repetivel,
  alvoDiario: a.alvoDiario,
  ativa: a.ativa,
  ordem: a.ordem,
});

/**
 * Quanto vale um dia perfeito com o cadastro de agora.
 *
 * As ações positivas entram pelo alvo diário (8 copos de água a 0,5 somam 4).
 * As refeições entram pela MELHOR delas, e não pela soma: só cabe uma por dia,
 * então somar todas faria um 100% que ninguém consegue alcançar.
 *
 * A conta fica no Postgres: multiplicar e somar `numeric` lá é exato, e trazer
 * o cadastro inteiro para somar em JS seria pior nos dois quesitos. O
 * `::float8` é de propósito — com driver adapter, numeric cru pode voltar como
 * texto. A soma acontece em numeric (exata) e só o resultado vira número, a
 * mesma fronteira do `.toNumber()` do resto.
 */
async function calcularPossiveis(tx: Prisma.TransactionClient): Promise<number> {
  const linhas = await tx.$queryRaw<{ total: number }[]>`
    SELECT (
      COALESCE((SELECT SUM("pontos" * "alvo_diario") FROM "wl_acao" WHERE "ativa" AND "pontos" > 0), 0)
      + COALESCE((SELECT MAX("pontos") FROM "wl_refeicao" WHERE "ativa"), 0)
    )::float8 AS total
  `;
  return linhas[0]!.total;
}

/**
 * Regrava a foto do dia e devolve o total possível.
 *
 * Um dia guarda o cadastro como ele estava quando você mexeu nele pela última
 * vez: os registros e a refeição voltam a valer o que valem agora, e o
 * denominador é recalculado na mesma transação. Congelar só uma parte daria
 * dia acima de 100% (item novo somando sem entrar no total) ou nota menor do
 * que o dia mereceu. Dia em que você não encosta nunca muda — era esse o ponto
 * de congelar.
 */
async function refotografarDia(tx: Prisma.TransactionClient, data: Date) {
  const [registros, dia] = await Promise.all([
    tx.wlRegistro.findMany({ where: { data }, include: { acao: true } }),
    tx.wlDia.findUnique({ where: { data }, include: { refeicao: true } }),
  ]);
  const refeicao = dia?.refeicao ?? null;

  // Dia sem nada não ganha linha em `wl_dia`: ele fica neutro no calendário,
  // em vez de virar um zero que puxa a média para baixo só porque ninguém
  // anotou nada.
  if (registros.length === 0 && !refeicao) {
    await tx.wlDia.deleteMany({ where: { data } });
    return null;
  }

  for (const r of registros) {
    if (!r.pontosNaEpoca.equals(r.acao.pontos)) {
      await tx.wlRegistro.update({
        where: { data_acaoId: { data, acaoId: r.acaoId } },
        data: { pontosNaEpoca: r.acao.pontos },
      });
    }
  }

  const total = await calcularPossiveis(tx);

  await tx.wlDia.upsert({
    where: { data },
    create: { data, pontosPossiveis: total },
    update: {
      pontosPossiveis: total,
      // A refeição é reprecificada junto com os registros: a foto do dia é uma só.
      refeicaoPontosNaEpoca: refeicao ? refeicao.pontos : null,
    },
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
  return {
    data: dateParaDia(data),
    pontosPossiveis: dia ? dia.pontosPossiveis.toNumber() : null,
    refeicaoId: dia?.refeicaoId ?? null,
    refeicaoPontosNaEpoca: dia?.refeicaoPontosNaEpoca?.toNumber() ?? null,
    registros: registros.map((r) => ({
      acaoId: r.acaoId,
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
    const acoes = await prisma.wlAcao.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
    return acoes.map(acaoParaJson);
  });

  app.post("/acoes", async (req, reply) => {
    const corpo = CorpoAcao.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const acao = await prisma.wlAcao.create({ data: corpo.data });
    return reply.code(201).send(acaoParaJson(acao));
  });

  // Mudar os pontos vale de hoje em diante. Os dias já registrados guardam o
  // que a ação valia na época e só são reavaliados se você reabrir o dia.
  app.put<{ Params: { id: string } }>("/acoes/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ erro: "Id inválido." });
    const corpo = CorpoAcao.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const existe = await prisma.wlAcao.findUnique({ where: { id } });
    if (!existe) return reply.code(404).send({ erro: "Ação não encontrada." });

    const acao = await prisma.wlAcao.update({ where: { id }, data: corpo.data });
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
  // Cadastro de refeições
  // -------------------------------------------------------------------------

  app.get("/refeicoes", async () => {
    const refeicoes = await prisma.wlRefeicao.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
    return refeicoes.map(refeicaoParaJson);
  });

  app.post("/refeicoes", async (req, reply) => {
    const corpo = CorpoRefeicao.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const refeicao = await prisma.wlRefeicao.create({ data: corpo.data });
    return reply.code(201).send(refeicaoParaJson(refeicao));
  });

  // Como nas ações: mexer nos pontos vale de hoje em diante.
  app.put<{ Params: { id: string } }>("/refeicoes/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ erro: "Id inválido." });
    const corpo = CorpoRefeicao.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const existe = await prisma.wlRefeicao.findUnique({ where: { id } });
    if (!existe) return reply.code(404).send({ erro: "Refeição não encontrada." });

    const refeicao = await prisma.wlRefeicao.update({ where: { id }, data: corpo.data });
    return refeicaoParaJson(refeicao);
  });

  app.delete<{ Params: { id: string } }>("/refeicoes/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ erro: "Id inválido." });

    const usos = await prisma.wlDia.count({ where: { refeicaoId: id } });
    if (usos > 0) {
      return reply.code(409).send({
        erro: `Esta refeição já aparece em ${usos} ${usos === 1 ? "dia" : "dias"}. Arquive em vez de apagar, para o histórico continuar explicável.`,
      });
    }

    await prisma.wlRefeicao.deleteMany({ where: { id } });
    return reply.code(204).send();
  });

  // -------------------------------------------------------------------------
  // Pontuação dos dias
  // -------------------------------------------------------------------------

  /*
   * O calendário pede um intervalo e recebe só os dias que têm registro. Dia
   * sem linha é dia neutro: ele não vem, e a tela o desenha apagado em vez de
   * fingir um zero.
   */
  app.get("/dias", async (req, reply) => {
    const intervalo = Intervalo.safeParse(req.query);
    if (!intervalo.success) return reply.code(400).send({ erro: primeiroErro(intervalo.error) });

    const linhas = await prisma.$queryRaw<{ data: Date; pontos: number; possiveis: number }[]>`
      SELECT d."data",
             (COALESCE(SUM(r."pontos_na_epoca" * r."quantidade"), 0)
              + COALESCE(MAX(d."refeicao_pontos_na_epoca"), 0))::float8 AS pontos,
             d."pontos_possiveis"::float8 AS possiveis
      FROM "wl_dia" d
      LEFT JOIN "wl_registro" r ON r."data" = d."data"
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
   * A refeição do dia: escolher, trocar e tirar na mesma requisição. `null`
   * tira — e o dia some do calendário se não sobrar mais nada nele.
   */
  app.put<{ Params: { dia: string } }>("/dias/:dia/refeicao", async (req, reply) => {
    const dia = Dia.safeParse(req.params.dia);
    if (!dia.success) return reply.code(400).send({ erro: primeiroErro(dia.error) });
    const corpo = CorpoRefeicaoDoDia.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const { refeicaoId } = corpo.data;
    const refeicao =
      refeicaoId === null ? null : await prisma.wlRefeicao.findUnique({ where: { id: refeicaoId } });

    if (refeicaoId !== null) {
      if (!refeicao) return reply.code(404).send({ erro: "Refeição não encontrada." });
      // Tirar uma arquivada continua valendo; escolher, não. Mesma regra das ações.
      if (!refeicao.ativa) {
        return reply.code(409).send({ erro: "Esta refeição está arquivada. Reative-a para voltar a usá-la." });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (refeicao) {
        // O dia pode não existir ainda, e `pontos_possiveis` é obrigatório:
        // por isso o denominador é calculado antes de criar a linha.
        const possiveis = await calcularPossiveis(tx);
        await tx.wlDia.upsert({
          where: { data: dia.data },
          create: {
            data: dia.data,
            pontosPossiveis: possiveis,
            refeicaoId: refeicao.id,
            refeicaoPontosNaEpoca: refeicao.pontos,
          },
          update: { refeicaoId: refeicao.id, refeicaoPontosNaEpoca: refeicao.pontos },
        });
      } else {
        // updateMany e não update: tirar a refeição de um dia que nem existe é
        // sucesso, não erro — o resultado desejado já vale.
        await tx.wlDia.updateMany({
          where: { data: dia.data },
          data: { refeicaoId: null, refeicaoPontosNaEpoca: null },
        });
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

    const { quantidade } = corpo.data;
    const acao = await prisma.wlAcao.findUnique({ where: { id: acaoId } });
    if (!acao) return reply.code(404).send({ erro: "Ação não encontrada." });

    // Desmarcar uma arquivada continua valendo: é assim que se limpa um dia
    // depois de arquivar a ação. Só marcar é que não.
    if (!acao.ativa && quantidade > 0) {
      return reply.code(409).send({ erro: "Esta ação está arquivada. Reative-a para voltar a usá-la." });
    }
    if (!acao.repetivel && quantidade > 1) {
      return reply.code(400).send({ erro: `"${acao.nome}" não é repetível: conta no máximo uma vez por dia.` });
    }

    await prisma.$transaction(async (tx) => {
      if (quantidade === 0) {
        await tx.wlRegistro.deleteMany({ where: { data: dia.data, acaoId } });
      } else {
        await tx.wlRegistro.upsert({
          where: { data_acaoId: { data: dia.data, acaoId } },
          create: { data: dia.data, acaoId, quantidade, pontosNaEpoca: acao.pontos },
          update: { quantidade, pontosNaEpoca: acao.pontos },
        });
      }
      await refotografarDia(tx, dia.data);
    });

    // O dia inteiro de volta: a tela atualiza a nota sem uma segunda viagem.
    return lerDia(dia.data);
  });
}
