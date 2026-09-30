/**
 * As contas do WL. Funções puras: sem React, sem fetch, sem relógio escondido
 * — "hoje" entra como parâmetro, e é isso que deixa os testes determinísticos.
 */

export type Pesagem = { data: string; pesoKg: number; nota: string | null };
export type Meta = { pesoAlvo: number; alturaCm: number | null };

/**
 * Lê o peso como a pessoa digita: `72,5`, `72.5`, ` 72 `. Devolve `null` para
 * o que não for número. Vírgula é o separador decimal daqui, e o teclado
 * numérico do celular em pt-BR oferece justamente ela.
 */
export function lerPeso(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(limpo)) return null;
  return Number(limpo);
}

/** O dia de hoje no fuso de quem está usando, como `AAAA-MM-DD`. */
export function diaLocal(agora: Date = new Date()): string {
  const a = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, "0");
  const d = String(agora.getDate()).padStart(2, "0");
  return `${a}-${m}-${d}`;
}

/** `"2026-09-30"` → `"30/09"` (ou `"30/09/2026"` com `comAno`). */
export function formatarDia(dia: string, comAno = false): string {
  const [a, m, d] = dia.split("-");
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
}

/** 72.5 → `"72,5"`; 72 → `"72,0"`. Uma casa: a balança de casa não vê mais que isso. */
export function formatarPeso(kg: number): string {
  return kg.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Diferença com sinal sempre visível: `+1,2` / `−0,8` / `0,0`. */
export function formatarVariacao(kg: number): string {
  const arredondado = Math.round(kg * 10) / 10;
  if (arredondado === 0) return "0,0";
  const sinal = arredondado > 0 ? "+" : "−";
  return sinal + formatarPeso(Math.abs(arredondado));
}

export type Resumo = {
  atual: Pesagem;
  inicial: Pesagem;
  /** atual − inicial. Negativo é perda. */
  variacao: number;
  /** Quanto falta até a meta (positivo = ainda acima dela). `null` sem meta. */
  faltam: number | null;
  /** 0 a 1: quanto do caminho inicial → meta já foi percorrido. `null` sem meta. */
  progresso: number | null;
  imc: number | null;
};

/**
 * O retrato do momento. `pesagens` precisa estar em ordem crescente de data,
 * que é como a API entrega.
 */
export function resumir(pesagens: Pesagem[], meta: Meta | null): Resumo | null {
  const inicial = pesagens[0];
  const atual = pesagens.at(-1);
  if (!inicial || !atual) return null;

  let faltam: number | null = null;
  let progresso: number | null = null;
  if (meta) {
    faltam = atual.pesoKg - meta.pesoAlvo;
    const caminho = inicial.pesoKg - meta.pesoAlvo;
    // Começou já na meta (ou abaixo): não há caminho a percorrer, e dividir
    // por ele daria infinito. Estar na meta é 100%.
    progresso = caminho <= 0 ? 1 : limitar((inicial.pesoKg - atual.pesoKg) / caminho, 0, 1);
  }

  const imc = meta?.alturaCm ? atual.pesoKg / (meta.alturaCm / 100) ** 2 : null;

  return { atual, inicial, variacao: atual.pesoKg - inicial.pesoKg, faltam, progresso, imc };
}

export type Periodo = "30d" | "90d" | "tudo";

/** As pesagens dos últimos N dias, contando a partir de `hoje`. */
export function filtrarPeriodo(pesagens: Pesagem[], periodo: Periodo, hoje: string): Pesagem[] {
  if (periodo === "tudo") return pesagens;
  const dias = periodo === "30d" ? 30 : 90;
  const corte = new Date(`${hoje}T00:00:00Z`);
  corte.setUTCDate(corte.getUTCDate() - dias);
  const inicio = corte.toISOString().slice(0, 10);
  // Comparar `AAAA-MM-DD` como texto funciona: a ordem alfabética é a cronológica.
  return pesagens.filter((p) => p.data >= inicio);
}

/**
 * Marcas "redondas" para o eixo do peso, cobrindo [min, max] com folga.
 * Passo de 0,5, 1, 2, 5 ou 10 kg: o menor que não passe de ~7 linhas.
 */
export function marcasDoEixo(min: number, max: number): number[] {
  const amplitude = Math.max(max - min, 1);
  const passo = [0.5, 1, 2, 5, 10].find((p) => amplitude / p <= 5) ?? 10;
  const de = Math.floor(min / passo) * passo;
  const ate = Math.ceil(max / passo) * passo;
  const marcas: number[] = [];
  for (let v = de; v <= ate + 1e-9; v += passo) marcas.push(Math.round(v * 10) / 10);
  return marcas;
}

function limitar(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
