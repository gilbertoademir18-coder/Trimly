import type { FastifyInstance } from "fastify";
import { z } from "zod";
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
}
