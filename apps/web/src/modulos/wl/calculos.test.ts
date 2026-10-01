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
  opcoesAtivas,
  ordenarAcoes,
  podeSomar,
  pontosPossiveis,
  pontuarDia,
  resumir,
  semanasDoMes,
  somarPontos,
  temOpcoes,
  type Acao,
  type Opcao,
  type Pesagem,
} from "./calculos.ts";

/** Uma ação comum, sem opções. */
const umaAcao = (campos: Partial<Acao> = {}): Acao => ({
  id: 1,
  nome: "a",
  pontos: 1,
  repetivel: false,
  alvoDiario: 1,
  ativa: true,
  ordem: 0,
  opcoes: [],
  ...campos,
});

const umaOpcao = (pontos: number, ativa = true): Opcao => ({
  id: 1,
  nome: "o",
  pontos,
  ativa,
  ordem: 0,
});

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
  const reg = (pontosNaEpoca: number, quantidade = 1) => ({
    acaoId: 1,
    opcaoId: null,
    quantidade,
    pontosNaEpoca,
  });

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
  it("soma só as positivas e ativas", () => {
    expect(
      pontosPossiveis([umaAcao({ pontos: 3 }), umaAcao({ pontos: 4 }), umaAcao({ pontos: -2 })]),
    ).toBe(7);
    expect(pontosPossiveis([umaAcao({ pontos: 3 }), umaAcao({ pontos: 4, ativa: false })])).toBe(3);
  });

  it("conta a repetível pelo alvo diário", () => {
    expect(pontosPossiveis([umaAcao({ pontos: 1, repetivel: true, alvoDiario: 8 })])).toBe(8);
  });

  it("cadastro vazio vale zero", () => {
    expect(pontosPossiveis([])).toBe(0);
  });
});

describe("ordenarAcoes", () => {
  const acao = (id: number, pontos: number): Acao => umaAcao({ id, nome: "a" + id, pontos });

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

  it("as com opções vêm antes das comuns, mesmo as positivas", () => {
    const comOpcoes = umaAcao({ id: 9, pontos: null, opcoes: [umaOpcao(5)] });
    expect(ordenarAcoes([acao(1, 20), comOpcoes]).map((a) => a.id)).toEqual([9, 1]);
  });

  it("os quatro grupos saem na ordem certa", () => {
    const opcoesSoma = umaAcao({ id: 1, pontos: null, opcoes: [umaOpcao(5)] });
    const opcoesDesconta = umaAcao({ id: 2, pontos: null, opcoes: [umaOpcao(-5)] });
    const comumSoma = acao(3, 4);
    const comumDesconta = acao(4, -4);
    const ordenadas = ordenarAcoes([comumDesconta, comumSoma, opcoesDesconta, opcoesSoma]);
    expect(ordenadas.map((a) => a.id)).toEqual([1, 2, 3, 4]);
  });

  it("ação só de opções negativas fica atrás das que somam, dentro do seu grupo", () => {
    const sóRuins = umaAcao({ id: 9, pontos: null, opcoes: [umaOpcao(-3)] });
    const boa = umaAcao({ id: 8, pontos: null, opcoes: [umaOpcao(3)] });
    expect(ordenarAcoes([sóRuins, boa]).map((a) => a.id)).toEqual([8, 9]);
  });
});

describe("pontosPossiveis com ações que têm opções", () => {
  const com = (...pontos: number[]): Acao =>
    umaAcao({
      pontos: null,
      opcoes: pontos.map((p, i) => ({ ...umaOpcao(p), id: i + 1 })),
    });

  it("conta a melhor opção, e não a soma delas", () => {
    // Só cabe uma por dia: somar 4 + 2 + 3 faria um 100% inatingível.
    expect(pontosPossiveis([umaAcao({ pontos: 6 }), com(4, 2, 3)])).toBe(10);
  });

  it("ignora opção arquivada ao escolher a melhor", () => {
    const acao = umaAcao({
      pontos: null,
      opcoes: [{ ...umaOpcao(9, false), id: 1 }, { ...umaOpcao(2), id: 2 }],
    });
    expect(pontosPossiveis([umaAcao({ pontos: 6 }), acao])).toBe(8);
  });

  it("ação só de opções negativas não soma para o dia perfeito", () => {
    // Um seletor de deslizes ("qual besteira comi?") só tem como descontar.
    expect(pontosPossiveis([umaAcao({ pontos: 6 }), com(-4, -2)])).toBe(6);
  });

  it("ação com opções arquivada não entra", () => {
    const acao = umaAcao({ pontos: null, ativa: false, opcoes: [umaOpcao(9)] });
    expect(pontosPossiveis([umaAcao({ pontos: 6 }), acao])).toBe(6);
  });

  it("o alvo diário não multiplica ação com opções", () => {
    // Escolhe-se uma por dia: repetir não existe aqui.
    const acao = umaAcao({ pontos: null, alvoDiario: 8, opcoes: [umaOpcao(5)] });
    expect(pontosPossiveis([acao])).toBe(5);
  });
});

describe("podeSomar", () => {
  it("é a ação positiva, e não a negativa", () => {
    expect(podeSomar(umaAcao({ pontos: 3 }))).toBe(true);
    expect(podeSomar(umaAcao({ pontos: -3 }))).toBe(false);
  });

  it("com opções, basta uma alternativa que some", () => {
    const mista = umaAcao({
      pontos: null,
      opcoes: [{ ...umaOpcao(-3), id: 1 }, { ...umaOpcao(5), id: 2 }],
    });
    expect(podeSomar(mista)).toBe(true);
  });

  it("ação só de alternativas ruins não soma", () => {
    // O seletor de deslizes: "Nenhuma" ali é o que se quer, não uma pendência.
    const sóRuins = umaAcao({ pontos: null, opcoes: [umaOpcao(-3)] });
    expect(podeSomar(sóRuins)).toBe(false);
  });

  it("opção boa arquivada não conta", () => {
    const acao = umaAcao({
      pontos: null,
      opcoes: [{ ...umaOpcao(9, false), id: 1 }, { ...umaOpcao(-2), id: 2 }],
    });
    expect(podeSomar(acao)).toBe(false);
  });
});

describe("temOpcoes e opcoesAtivas", () => {
  it("distingue a ação comum da que tem opções", () => {
    expect(temOpcoes(umaAcao())).toBe(false);
    expect(temOpcoes(umaAcao({ pontos: null, opcoes: [umaOpcao(3)] }))).toBe(true);
  });

  it("opcoesAtivas deixa as arquivadas de fora", () => {
    const acao = umaAcao({
      pontos: null,
      opcoes: [{ ...umaOpcao(3), id: 1 }, { ...umaOpcao(4, false), id: 2 }],
    });
    expect(opcoesAtivas(acao).map((o) => o.id)).toEqual([1]);
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
