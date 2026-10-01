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

/* -------------------------------------------------------------------------
 * Pontuação do dia
 *
 * A regra: o "dia perfeito" é a soma do que todas as ações positivas valem, e
 * é ele que vale 100%. As negativas descontam. A nota fica presa entre 0 e
 * 100 — abaixo disso não haveria fundo, e acima a barra deixaria de significar
 * "completo".
 * ---------------------------------------------------------------------- */

/** Uma alternativa de uma ação com opções. Escolhe-se uma por dia. */
export type Opcao = {
  id: number;
  nome: string;
  descricao: string | null;
  /** Positivo soma, negativo desconta. Nunca zero. */
  pontos: number;
  ativa: boolean;
  ordem: number;
};

export type Acao = {
  id: number;
  nome: string;
  /** Positivo soma, negativo desconta. `null` quando os pontos estão nas opções. */
  pontos: number | null;
  repetivel: boolean;
  /** Quantas vezes num dia completo. 1 nas não repetíveis e nas que têm opções. */
  alvoDiario: number;
  ativa: boolean;
  ordem: number;
  /** Vazio nas ações comuns; com itens, a ação vira um seletor no dia. */
  opcoes: Opcao[];
};

export type Registro = {
  acaoId: number;
  /** A opção escolhida, nas ações que têm opções. */
  opcaoId: number | null;
  quantidade: number;
  pontosNaEpoca: number;
};

/** Um dia aberto na tela: o que foi marcado e o denominador que vigorava nele. */
export type Dia = {
  data: string;
  pontosPossiveis: number | null;
  registros: Registro[];
};

/** `true` quando a ação é um seletor de alternativas em vez de um botão. */
export function temOpcoes(a: Acao): boolean {
  return a.opcoes.length > 0;
}

/** As opções que ainda podem ser escolhidas, na ordem do cadastro. */
export function opcoesAtivas(a: Acao): Opcao[] {
  return a.opcoes.filter((o) => o.ativa);
}

/** Um dia como o calendário precisa dele: só os dois números. */
export type DiaResumido = { data: string; pontos: number; pontosPossiveis: number };

/**
 * A soma dos pontos de um dia.
 *
 * Soma em centésimos, e não em reais: `0,1 + 0,2` daria `0,30000000000000004`
 * em float, que é o mesmo motivo de o banco guardar DECIMAL. Os pontos chegam
 * com duas casas no máximo, então centésimo é sempre inteiro.
 */
export function somarPontos(registros: Registro[]): number {
  const centesimos = registros.reduce(
    (soma, r) => soma + Math.round(r.pontosNaEpoca * 100) * r.quantidade,
    0,
  );
  return centesimos / 100;
}

/**
 * Quanto uma ação pode render num dia perfeito, em centésimos de ponto.
 *
 * Com opções, é a MELHOR delas, e não a soma: só cabe uma por dia, então somar
 * todas faria um 100% que ninguém alcança. Nunca negativo — uma ação cujas
 * alternativas são todas ruins (um seletor de deslizes) não tem como somar
 * para o dia perfeito, só como descontar quando escolhida.
 */
function contribuicaoEmCentesimos(a: Acao): number {
  if (!a.ativa) return 0;

  if (temOpcoes(a)) {
    return opcoesAtivas(a).reduce((melhor, o) => Math.max(melhor, Math.round(o.pontos * 100)), 0);
  }

  if (a.pontos === null || a.pontos <= 0) return 0;
  return Math.round(a.pontos * 100) * a.alvoDiario;
}

/**
 * O "dia perfeito" segundo o cadastro de agora: o que daria 100% hoje.
 *
 * A tela do cadastro mostra este número para a conta não ser um mistério. O
 * valor que vale para um dia já registrado é o que veio do servidor, congelado
 * — este aqui é só o de hoje em diante.
 */
export function pontosPossiveis(acoes: Acao[]): number {
  return acoes.reduce((soma, a) => soma + contribuicaoEmCentesimos(a), 0) / 100;
}

/**
 * As ações na ordem em que a tela do dia as mostra: as que somam primeiro.
 *
 * O dia se marca de cima para baixo, e o que se quer fazer vem antes do que se
 * quer evitar — a lista começa pelo que dá para buscar, e não pelo que dá para
 * errar. Dentro de cada grupo vale a ordem do cadastro: `sort` é estável, e a
 * API já entrega por `ordem` e depois nome.
 */
export function ordenarAcoes(acoes: Acao[]): Acao[] {
  // Numa ação com opções, "soma" é ter ao menos uma alternativa que soma.
  const soma = (a: Acao) =>
    temOpcoes(a) ? opcoesAtivas(a).some((o) => o.pontos > 0) : (a.pontos ?? 0) > 0;
  return [...acoes].sort((a, b) => Number(soma(b)) - Number(soma(a)));
}

/**
 * A nota do dia, de 0 a 100.
 *
 * `null` quando não há o que medir: nenhum dia registrado, ou um cadastro sem
 * nenhuma ação positiva (dividir por zero daria infinito, e "0%" seria uma
 * mentira sobre um dia que ninguém mediu).
 */
export function pontuarDia(pontos: number, pontosPossiveis: number | null): number | null {
  if (pontosPossiveis === null || pontosPossiveis <= 0) return null;
  return limitar((pontos / pontosPossiveis) * 100, 0, 100);
}

/** 73,4 → `"73%"`. Sem casa decimal: a nota já é aproximada, e meio ponto
 *  percentual de hábito não quer dizer nada. */
export function formatarPontuacao(pct: number): string {
  return `${Math.round(pct)}%`;
}

/**
 * A média das notas do período, ignorando dias sem registro.
 *
 * Dia sem registro é neutro, não é zero: esquecer de anotar não é o mesmo que
 * um dia ruim, e tratá-los igual puniria justamente quem passou o fim de
 * semana longe do celular. `null` quando não há nenhum dia medido.
 */
export function mediaPontuacao(dias: DiaResumido[]): number | null {
  const notas = dias
    .map((d) => pontuarDia(d.pontos, d.pontosPossiveis))
    .filter((n): n is number => n !== null);
  if (notas.length === 0) return null;
  return notas.reduce((s, n) => s + n, 0) / notas.length;
}

/**
 * A faixa da nota, de 0 a 4, para o calendário escolher a intensidade da cor.
 *
 * Faixas e não gradiente contínuo: cinco tons dão para distinguir de relance
 * numa grade de quadradinhos, e um gradiente viraria mancha.
 */
export function faixaDaPontuacao(pct: number): 0 | 1 | 2 | 3 | 4 {
  if (pct >= 90) return 4;
  if (pct >= 70) return 3;
  if (pct >= 50) return 2;
  if (pct >= 25) return 1;
  return 0;
}

/**
 * As semanas de um mês, como linhas de sete dias.
 *
 * As bordas vêm como `null` em vez dos dias dos meses vizinhos: mostrar "30 de
 * agosto" apagado dentro de setembro convida a clicar no dia errado. Semana
 * começa no domingo, como nos calendários daqui.
 */
export function semanasDoMes(ano: number, mes: number): (string | null)[][] {
  // Dia 0 do mês seguinte é o último deste — o jeito sem tabela de bissextos.
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const comecaEm = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();

  const celulas: (string | null)[] = Array(comecaEm).fill(null);
  for (let d = 1; d <= diasNoMes; d++) {
    celulas.push(`${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (celulas.length % 7 !== 0) celulas.push(null);

  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

/** `"2026-10-01"` → `"outubro de 2026"`. */
export function formatarMes(ano: number, mes: number): string {
  return new Date(Date.UTC(ano, mes - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Anda `passo` meses a partir de um `{ ano, mes }`, virando o ano quando precisa. */
export function mudarMes(ano: number, mes: number, passo: number): { ano: number; mes: number } {
  const total = ano * 12 + (mes - 1) + passo;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}
