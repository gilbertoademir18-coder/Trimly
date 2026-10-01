/**
 * As contas do jejum, dentro do WL. Funções puras: sem React, sem fetch, sem
 * relógio escondido — "agora" entra como parâmetro, e é isso que deixa os
 * testes determinísticos.
 *
 * Arquivo próprio e não dentro de `calculos.ts`: lá moram as contas de peso e
 * pontuação, e juntar tudo passaria de quatrocentas linhas sem que as duas
 * metades se falem.
 */
import { diaLocal, formatarDia } from "./calculos.ts";

// Reexportados para quem usa o jejum não precisar saber de onde vêm.
export { diaLocal, formatarDia };

export type Jejum = {
  id: number;
  /** O dia de calendário a que o jejum pertence: o do início. */
  dia: string;
  /** Instante ISO. */
  inicio: string;
  /** Instante ISO, ou `null` enquanto o jejum corre. */
  fim: string | null;
  /** A meta em minutos, ou `null` para jejum livre. */
  metaMin: number | null;
  nota: string | null;
};

/** As metas que o botão oferece. "Livre" é a ausência de meta, e por isso `null`. */
export const METAS: { rotulo: string; min: number | null }[] = [
  { rotulo: "16h", min: 16 * 60 },
  { rotulo: "18h", min: 18 * 60 },
  { rotulo: "20h", min: 20 * 60 },
  { rotulo: "24h", min: 24 * 60 },
  { rotulo: "Livre", min: null },
];

/** `true` enquanto o jejum não tem fim — é o que está correndo agora. */
export function emAndamento(j: Jejum): boolean {
  return j.fim === null;
}

/**
 * Quantos segundos o jejum durou — ou já dura, se ainda corre.
 *
 * Nunca negativo: um relógio ajustado para trás no meio de um jejum daria
 * duração negativa, e um cronômetro contando ao contrário é pior que um
 * parado em zero.
 */
export function duracaoSeg(j: Jejum, agora: Date = new Date()): number {
  const fim = j.fim === null ? agora : new Date(j.fim);
  const seg = Math.floor((fim.getTime() - new Date(j.inicio).getTime()) / 1000);
  return Math.max(0, seg);
}

/** `27015` → `"07:30:15"`. Horas não viram dias: um jejum de 30h mostra `30:00:00`. */
export function formatarRelogio(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * `58320` → `"16h 12min"`. Para o histórico, onde o segundo não interessa.
 *
 * Abaixo de uma hora mostra só os minutos, porque `"0h 40min"` faz o olho
 * tropeçar no zero.
 */
export function formatarDuracao(segundos: number): string {
  const totalMin = Math.floor(segundos / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m}min` : m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/**
 * Quanto da meta já foi cumprido, de 0 a 1. `null` em jejum livre.
 *
 * Passa de 1 quando a meta é batida e o jejum continua — quem corta é a tela,
 * que não tem barra maior que ela mesma; o número continua inteiro para quem
 * quiser dizer "132% da meta".
 */
export function progresso(j: Jejum, agora: Date = new Date()): number | null {
  if (j.metaMin === null) return null;
  return duracaoSeg(j, agora) / (j.metaMin * 60);
}

/** Quanto falta para a meta, em segundos. Negativo depois de batida; `null` sem meta. */
export function faltamSeg(j: Jejum, agora: Date = new Date()): number | null {
  if (j.metaMin === null) return null;
  return j.metaMin * 60 - duracaoSeg(j, agora);
}

/** `"2026-10-01T20:07:00.000Z"` → `"20:07"`, no fuso de quem está olhando. */
export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export type DiaDeJejum = { dia: string; jejuns: Jejum[]; totalSeg: number };

/**
 * Agrupa os jejuns por dia, do mais recente para o mais antigo.
 *
 * O dia é o do início, mesmo quando o jejum atravessa a meia-noite: um jejum
 * das 20h de segunda ao meio-dia de terça conta inteiro para segunda. É o que
 * bate com a forma como se fala ("comecei meu 16h na segunda") e o que mantém
 * cada jejum numa linha só.
 */
export function agruparPorDia(jejuns: Jejum[], agora: Date = new Date()): DiaDeJejum[] {
  const porDia = new Map<string, Jejum[]>();
  for (const j of jejuns) {
    const lista = porDia.get(j.dia) ?? [];
    lista.push(j);
    porDia.set(j.dia, lista);
  }

  return [...porDia.entries()]
    // Comparar `AAAA-MM-DD` como texto funciona: a ordem alfabética é a cronológica.
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dia, lista]) => ({
      dia,
      jejuns: [...lista].sort((a, b) => (a.inicio < b.inicio ? 1 : -1)),
      totalSeg: lista.reduce((soma, j) => soma + duracaoSeg(j, agora), 0),
    }));
}

/*
 * As duas pontes para o `<input type="datetime-local">`, que fala em hora
 * local sem fuso ("2026-10-01T20:07") enquanto o resto do app fala ISO em UTC.
 *
 * É a fronteira onde o erro de fuso nasce se alguém cortar a string na mão —
 * `iso.slice(0, 16)` mostraria 23:07 para quem jejuou às 20:07.
 */

/** Instante ISO → o texto que o campo entende, no fuso de quem está olhando. */
export function paraCampoLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * O texto do campo → instante ISO.
 *
 * `new Date("2026-10-01T20:07")` já interpreta como hora local, que é
 * exatamente o que o campo quis dizer.
 */
export function doCampoLocal(valor: string): string {
  return new Date(valor).toISOString();
}
