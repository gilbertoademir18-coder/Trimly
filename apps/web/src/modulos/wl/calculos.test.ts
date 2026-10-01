import { describe, expect, it } from "vitest";
import {
  diaLocal,
  faixaDaPontuacao,
  filtrarPeriodo,
  formatarVariacao,
  lerPeso,
  marcasDoEixo,
  mediaPontuacao,
  mudarMes,
  ordenarAcoes,
  pontosDoDia,
  pontosPossiveis,
  pontuarDia,
  resumir,
  semanasDoMes,
  somarPontos,
  type Acao,
  type Pesagem,
  type Refeicao,
} from "./calculos.ts";

const p = (data: string, pesoKg: number): Pesagem => ({ data, pesoKg, nota: null });

describe("lerPeso", () => {
  it("aceita vírgula e ponto como decimal", () => {
    expect(lerPeso("72,5")).toBe(72.5);
    expect(lerPeso("72.55")).toBe(72.55);
    expect(lerPeso(" 80 ")).toBe(80);
  });

  it("recusa o que não é peso", () => {
    expect(lerPeso("")).toBeNull();
    expect(lerPeso("abc")).toBeNull();
    expect(lerPeso("72,555")).toBeNull();
    expect(lerPeso("-70")).toBeNull();
    expect(lerPeso("1.000")).toBeNull();
  });
});

describe("diaLocal", () => {
  it("usa o dia do fuso local, não o UTC", () => {
    // 23h do dia 30 no horário local continua sendo dia 30 — em UTC já seria 1º.
    expect(diaLocal(new Date(2026, 8, 30, 23, 30))).toBe("2026-09-30");
  });
});

describe("formatarVariacao", () => {
  it("mostra o sinal e trata o zero sem sinal", () => {
    expect(formatarVariacao(-1.24)).toBe("−1,2");
    expect(formatarVariacao(0.8)).toBe("+0,8");
    expect(formatarVariacao(0.04)).toBe("0,0");
  });
});

describe("resumir", () => {
  const serie = [p("2026-09-01", 90), p("2026-09-15", 87), p("2026-09-30", 85)];

  it("devolve null sem pesagens", () => {
    expect(resumir([], null)).toBeNull();
  });

  it("calcula variação, quanto falta e progresso", () => {
    const r = resumir(serie, { pesoAlvo: 80, alturaCm: null })!;
    expect(r.variacao).toBe(-5);
    expect(r.faltam).toBe(5);
    expect(r.progresso).toBe(0.5);
    expect(r.imc).toBeNull();
  });

  it("limita o progresso entre 0 e 100%", () => {
    expect(resumir([p("2026-09-01", 90), p("2026-09-02", 92)], { pesoAlvo: 80, alturaCm: null })!.progresso).toBe(0);
    expect(resumir([p("2026-09-01", 90), p("2026-09-02", 78)], { pesoAlvo: 80, alturaCm: null })!.progresso).toBe(1);
  });

  it("não divide por zero quando já começou na meta", () => {
    expect(resumir([p("2026-09-01", 80)], { pesoAlvo: 80, alturaCm: null })!.progresso).toBe(1);
  });

  it("calcula o IMC quando há altura", () => {
    expect(resumir(serie, { pesoAlvo: 80, alturaCm: 180 })!.imc).toBeCloseTo(26.23, 2);
  });
});

describe("filtrarPeriodo", () => {
  const serie = [p("2026-06-01", 90), p("2026-09-05", 86), p("2026-09-30", 85)];

  it("corta pelos últimos N dias a partir de hoje", () => {
    expect(filtrarPeriodo(serie, "30d", "2026-09-30").map((x) => x.data)).toEqual(["2026-09-05", "2026-09-30"]);
    expect(filtrarPeriodo(serie, "tudo", "2026-09-30")).toHaveLength(3);
  });
});

describe("marcasDoEixo", () => {
  it("gera marcas redondas que cobrem o intervalo", () => {
    expect(marcasDoEixo(84.3, 86.8)).toEqual([84, 84.5, 85, 85.5, 86, 86.5, 87]);
    expect(marcasDoEixo(71.2, 90.4)).toEqual([70, 75, 80, 85, 90, 95]);
  });

  it("não quebra com um valor só", () => {
    expect(marcasDoEixo(80, 80)).toEqual([80]);
  });
});

describe("somarPontos", () => {
  const reg = (pontosNaEpoca: number, quantidade = 1) => ({ acaoId: 1, quantidade, pontosNaEpoca });

  it("soma positivos e negativos", () => {
    expect(somarPontos([reg(3), reg(4), reg(-2)])).toBe(5);
  });

  it("multiplica pela quantidade", () => {
    expect(somarPontos([reg(1, 8), reg(-2, 3)])).toBe(2);
  });

  it("não acumula erro de float", () => {
    // Em float puro isto daria 0.30000000000000004.
    expect(somarPontos([reg(0.1), reg(0.2)])).toBe(0.3);
    expect(somarPontos([reg(0.07, 3)])).toBe(0.21);
  });

  it("dia vazio vale zero", () => {
    expect(somarPontos([])).toBe(0);
  });
});

describe("pontosPossiveis", () => {
  const acao = (p: Partial<Acao>): Acao => ({
    id: 1, nome: "x", pontos: 1, repetivel: false, alvoDiario: 1, ativa: true, ordem: 0, ...p,
  });

  it("soma só as positivas e ativas", () => {
    expect(pontosPossiveis([acao({ pontos: 3 }), acao({ pontos: 4 }), acao({ pontos: -2 })])).toBe(7);
    expect(pontosPossiveis([acao({ pontos: 3 }), acao({ pontos: 4, ativa: false })])).toBe(3);
  });

  it("conta a repetível pelo alvo diário", () => {
    expect(pontosPossiveis([acao({ pontos: 1, repetivel: true, alvoDiario: 8 })])).toBe(8);
  });

  it("cadastro vazio vale zero", () => {
    expect(pontosPossiveis([])).toBe(0);
  });
});

describe("ordenarAcoes", () => {
  const acao = (id: number, pontos: number): Acao => ({
    id, nome: "a" + id, pontos, repetivel: false, alvoDiario: 1, ativa: true, ordem: 0,
  });

  it("põe as que somam antes das que descontam", () => {
    const ordenadas = ordenarAcoes([acao(1, -2), acao(2, 3), acao(3, -1), acao(4, 5)]);
    expect(ordenadas.map((a) => a.id)).toEqual([2, 4, 1, 3]);
  });

  it("preserva a ordem do cadastro dentro de cada grupo", () => {
    const ordenadas = ordenarAcoes([acao(1, 3), acao(2, 4), acao(3, -1), acao(4, -2)]);
    expect(ordenadas.map((a) => a.id)).toEqual([1, 2, 3, 4]);
  });

  it("não mexe no array que recebeu", () => {
    const original = [acao(1, -2), acao(2, 3)];
    ordenarAcoes(original);
    expect(original.map((a) => a.id)).toEqual([1, 2]);
  });

  it("aguenta lista vazia e lista de um tipo só", () => {
    expect(ordenarAcoes([])).toEqual([]);
    expect(ordenarAcoes([acao(1, -2), acao(2, -3)]).map((a) => a.id)).toEqual([1, 2]);
  });
});

describe("pontosPossiveis com refeições", () => {
  const acao = (pontos: number): Acao => ({
    id: 1, nome: "a", pontos, repetivel: false, alvoDiario: 1, ativa: true, ordem: 0,
  });
  const refeicao = (pontos: number, ativa = true): Refeicao => ({
    id: 1, nome: "r", descricao: null, pontos, ativa, ordem: 0,
  });

  it("conta a melhor refeição, e não a soma delas", () => {
    // Só cabe uma por dia: somar 4 + 2 + 3 faria um 100% inatingível.
    expect(pontosPossiveis([acao(6)], [refeicao(4), refeicao(2), refeicao(3)])).toBe(10);
  });

  it("ignora refeição arquivada ao escolher a melhor", () => {
    expect(pontosPossiveis([acao(6)], [refeicao(9, false), refeicao(2)])).toBe(8);
  });

  it("sem refeição cadastrada, o denominador é só o das ações", () => {
    expect(pontosPossiveis([acao(6)], [])).toBe(6);
    expect(pontosPossiveis([acao(6)])).toBe(6);
  });
});

describe("pontosDoDia", () => {
  const dia = (registros: { pontosNaEpoca: number; quantidade: number }[], refeicao: number | null) => ({
    data: "2026-09-10",
    pontosPossiveis: 10,
    refeicaoId: refeicao === null ? null : 1,
    refeicaoPontosNaEpoca: refeicao,
    registros: registros.map((r, i) => ({ acaoId: i + 1, ...r })),
  });

  it("soma as ações marcadas e a refeição escolhida", () => {
    expect(pontosDoDia(dia([{ pontosNaEpoca: 6, quantidade: 1 }], 4))).toBe(10);
  });

  it("dia sem refeição conta só as ações", () => {
    expect(pontosDoDia(dia([{ pontosNaEpoca: 6, quantidade: 1 }], null))).toBe(6);
  });

  it("dia só com refeição conta só ela", () => {
    expect(pontosDoDia(dia([], 4))).toBe(4);
  });

  it("não acumula erro de float", () => {
    expect(pontosDoDia(dia([{ pontosNaEpoca: 0.1, quantidade: 1 }], 0.2))).toBe(0.3);
  });
});

describe("pontuarDia", () => {
  it("é a fração do dia perfeito", () => {
    expect(pontuarDia(5, 10)).toBe(50);
    expect(pontuarDia(12, 12)).toBe(100);
  });

  it("não passa de 100 nem cai abaixo de 0", () => {
    // Beber 20 copos não torna o dia melhor que completo...
    expect(pontuarDia(20, 12)).toBe(100);
    // ...e um dia só de deslizes para no chão, não vira nota negativa.
    expect(pontuarDia(-8, 12)).toBe(0);
  });

  it("devolve null quando não há o que medir", () => {
    expect(pontuarDia(0, null)).toBeNull();
    // Cadastro sem nenhuma ação positiva: dividir por zero daria infinito.
    expect(pontuarDia(5, 0)).toBeNull();
  });
});

describe("mediaPontuacao", () => {
  const dia = (data: string, pontos: number, pontosPossiveis = 10) => ({ data, pontos, pontosPossiveis });

  it("é a média das notas do período", () => {
    expect(mediaPontuacao([dia("2026-09-01", 8), dia("2026-09-02", 6)])).toBe(70);
  });

  it("ignora dia sem nota em vez de contá-lo como zero", () => {
    // O dia sem denominador não entra na conta: a média continua 70, e não 46,7.
    expect(mediaPontuacao([dia("2026-09-01", 8), dia("2026-09-02", 6), dia("2026-09-03", 0, 0)])).toBe(70);
  });

  it("devolve null sem nenhum dia medido", () => {
    expect(mediaPontuacao([])).toBeNull();
  });
});

describe("faixaDaPontuacao", () => {
  it("separa as cinco faixas pelas bordas", () => {
    expect([0, 24, 25, 49, 50, 69, 70, 89, 90, 100].map(faixaDaPontuacao)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
});

describe("semanasDoMes", () => {
  it("alinha o primeiro dia no dia da semana certo", () => {
    // 1º de setembro de 2026 é uma terça: duas células vazias antes.
    const semanas = semanasDoMes(2026, 9);
    expect(semanas[0]!.slice(0, 3)).toEqual([null, null, "2026-09-01"]);
  });

  it("entrega linhas sempre de sete dias", () => {
    for (const mes of [1, 2, 9, 12]) {
      for (const semana of semanasDoMes(2026, mes)) expect(semana).toHaveLength(7);
    }
  });

  it("acerta o tamanho do mês, inclusive fevereiro bissexto", () => {
    const dias = (ano: number, mes: number) => semanasDoMes(ano, mes).flat().filter(Boolean).length;
    expect(dias(2026, 2)).toBe(28);
    expect(dias(2028, 2)).toBe(29);
    expect(dias(2026, 4)).toBe(30);
    expect(dias(2026, 12)).toBe(31);
  });

  it("não empresta dias dos meses vizinhos", () => {
    for (const d of semanasDoMes(2026, 9).flat()) {
      if (d) expect(d.startsWith("2026-09")).toBe(true);
    }
  });
});

describe("mudarMes", () => {
  it("anda para frente e para trás", () => {
    expect(mudarMes(2026, 5, 1)).toEqual({ ano: 2026, mes: 6 });
    expect(mudarMes(2026, 5, -1)).toEqual({ ano: 2026, mes: 4 });
  });

  it("vira o ano nas duas direções", () => {
    expect(mudarMes(2026, 12, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(mudarMes(2026, 1, -1)).toEqual({ ano: 2025, mes: 12 });
  });
});
