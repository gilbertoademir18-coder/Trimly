import { z } from "zod";
import { diaParaDate } from "./datas.ts";

/**
 * As peças de validação que todos os módulos usam.
 *
 * Moram aqui porque a mensagem de erro é a que aparece na tela: se cada módulo
 * escrevesse a sua, o app falaria de jeitos diferentes conforme a parte em que
 * você estivesse.
 */

/** `"2026-09-30"` → Date à meia-noite UTC. Recusa dia que não existe. */
export const Dia = z.string().transform((valor, ctx) => {
  const data = diaParaDate(valor);
  if (!data) {
    ctx.addIssue({ code: "custom", message: "Data inválida: use AAAA-MM-DD." });
    return z.NEVER;
  }
  return data;
});

/**
 * Um instante vindo como texto ISO (`2026-09-30T20:07:00.000Z`).
 *
 * Diferente de `Dia`: aqui a hora importa, e quem a manda é o aparelho de quem
 * está usando — o relógio dele é a verdade, como o calendário dele já era.
 */
export const Instante = z.string().transform((valor, ctx) => {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    ctx.addIssue({ code: "custom", message: "Instante inválido: use data e hora ISO." });
    return z.NEVER;
  }
  return data;
});

/** A primeira falha de uma validação, no formato que a tela mostra. */
export function primeiroErro(erro: z.ZodError | undefined): string {
  const problema = erro?.issues[0];
  if (!problema) return "Requisição inválida.";
  const campo = problema.path.join(".");
  return campo ? `${campo}: ${problema.message}` : problema.message;
}
