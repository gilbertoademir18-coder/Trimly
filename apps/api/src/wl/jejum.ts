import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { dateParaDia } from "../lib/datas.ts";
import { prisma } from "../lib/prisma.ts";
import { Dia, Instante, primeiroErro } from "../lib/validacao.ts";

/**
 * As rotas de jejum do WL, montadas em `/api/wl/jejum`.
 *
 * Arquivo próprio, e não dentro de `rotas.ts`: é o mesmo módulo, mas outro
 * assunto, e o rotas.ts já cuida de pesagens, ações e pontuação.
 *
 * Um jejum é um intervalo entre dois instantes, não um dia — é a diferença
 * para o resto do WL, onde pesagem é "o dia 30". O dia a que ele pertence é o
 * do início, e vem decidido pelo aparelho: o relógio de quem jejua é a
 * verdade, nunca o fuso do servidor.
 */

// 16 h = 960 min. O teto de 7 dias existe só para barrar engano de digitação:
// quem jejua 10 080 minutos tem problema maior que um app.
const MetaMin = z
  .number({ error: "precisa ser um número" })
  .int("em minutos inteiros")
  .min(1, "pelo menos 1 minuto")
  .max(60 * 24 * 7, "acima de 7 dias — erro de digitação?")
  .nullish()
  .transform((m) => m ?? null);

const Nota = z
  .string()
  .trim()
  .max(500, "no máximo 500 caracteres")
  .nullish()
  .transform((n) => n || null);

/*
 * Criar cobre os dois caminhos: iniciar agora (sem `fim`) e lançar um jejum
 * que já acabou (com `fim`). É a mesma linha no banco, e separar em duas rotas
 * só duplicaria validação.
 */
const CorpoNovo = z
  .object({
    dia: Dia,
    inicio: Instante,
    fim: Instante.nullish().transform((f) => f ?? null),
    metaMin: MetaMin,
    nota: Nota,
  })
  .refine((j) => j.fim === null || j.fim > j.inicio, {
    message: "o fim vem antes do início",
    path: ["fim"],
  });

const CorpoEdicao = CorpoNovo;

const Intervalo = z
  .object({
    de: z.string({ error: "informe de=AAAA-MM-DD" }).pipe(Dia),
    ate: z.string({ error: "informe ate=AAAA-MM-DD" }).pipe(Dia),
  })
  .refine((i) => i.de <= i.ate, { message: "o início vem depois do fim", path: ["de"] });

type LinhaJejum = {
  id: number;
  dia: Date;
  inicio: Date;
  fim: Date | null;
  metaMin: number | null;
  nota: string | null;
};

/*
 * A duração não sai daqui: ela depende de "agora" enquanto o jejum corre, e
 * "agora" é o relógio de quem está olhando. A API entrega os instantes; o
 * front conta os minutos, numa função pura e testada.
 */
const paraJson = (j: LinhaJejum) => ({
  id: j.id,
  dia: dateParaDia(j.dia),
  inicio: j.inicio.toISOString(),
  fim: j.fim?.toISOString() ?? null,
  metaMin: j.metaMin,
  nota: j.nota,
});

/**
 * Confere se o intervalo encosta em algum outro.
 *
 * Jejuns não se sobrepõem no mundo real, e deixar dois no mesmo horário faria
 * o total do dia contar a mesma hora duas vezes. Um jejum em aberto conta como
 * se fosse até o infinito: nada pode começar depois dele enquanto estiver
 * correndo.
 */
async function conflita(inicio: Date, fim: Date | null, ignorarId?: number) {
  // Dois intervalos se sobrepõem quando cada um começa antes de o outro
  // acabar. Jejum em aberto não tem fim, então o lado dele da comparação
  // simplesmente sai — é o mesmo que comparar com o infinito.
  const contagem = await prisma.wlJejum.count({
    where: {
      ...(ignorarId === undefined ? {} : { id: { not: ignorarId } }),
      // o outro acaba depois de este começar (ou não acaba)
      OR: [{ fim: null }, { fim: { gt: inicio } }],
      // este acaba depois de o outro começar
      ...(fim === null ? {} : { inicio: { lt: fim } }),
    },
  });
  return contagem > 0;
}

export async function rotasJejum(app: FastifyInstance) {
  /** O jejum em andamento, ou `null`. É o que a tela pergunta ao abrir. */
  app.get("/atual", async () => {
    const aberto = await prisma.wlJejum.findFirst({ where: { fim: null } });
    return aberto ? paraJson(aberto) : null;
  });

  app.get("/intervalos", async (req, reply) => {
    const periodo = Intervalo.safeParse(req.query);
    if (!periodo.success) return reply.code(400).send({ erro: primeiroErro(periodo.error) });

    const intervalos = await prisma.wlJejum.findMany({
      where: { dia: { gte: periodo.data.de, lte: periodo.data.ate } },
      orderBy: [{ dia: "desc" }, { inicio: "desc" }],
    });
    return intervalos.map(paraJson);
  });

  app.post("/intervalos", async (req, reply) => {
    const corpo = CorpoNovo.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    if (await conflita(corpo.data.inicio, corpo.data.fim)) {
      return reply.code(409).send({
        erro:
          corpo.data.fim === null
            ? "Já existe um jejum em andamento. Pare o atual antes de começar outro."
            : "Este intervalo se sobrepõe a outro jejum já registrado.",
      });
    }

    const criado = await prisma.wlJejum.create({ data: corpo.data });
    return reply.code(201).send(paraJson(criado));
  });

  /*
   * Edita qualquer campo — e é por aqui que se para um jejum, mandando o
   * `fim`. Uma rota só para "parar" seria um caso particular desta, com a
   * mesma validação repetida.
   */
  app.put<{ Params: { id: string } }>("/intervalos/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ erro: "Id inválido." });
    const corpo = CorpoEdicao.safeParse(req.body);
    if (!corpo.success) return reply.code(400).send({ erro: primeiroErro(corpo.error) });

    const existe = await prisma.wlJejum.findUnique({ where: { id } });
    if (!existe) return reply.code(404).send({ erro: "Jejum não encontrado." });

    if (await conflita(corpo.data.inicio, corpo.data.fim, id)) {
      return reply.code(409).send({ erro: "Este intervalo se sobrepõe a outro jejum." });
    }

    const atualizado = await prisma.wlJejum.update({ where: { id }, data: corpo.data });
    return paraJson(atualizado);
  });

  app.delete<{ Params: { id: string } }>("/intervalos/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ erro: "Id inválido." });

    // deleteMany pelo mesmo motivo das pesagens: apagar o que já não existe é
    // sucesso, não erro.
    await prisma.wlJejum.deleteMany({ where: { id } });
    return reply.code(204).send();
  });
}
