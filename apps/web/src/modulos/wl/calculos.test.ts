import { describe, expect, it } from "vitest";
import {
  diaLocal,
  diasDoProjeto,
  emLibras,
  faixaDaPontuacao,
  formatarDias,
  formatarImc,
  formatarPeso,
  formatarVariacao,
  imc,
  lerPeso,
  marcasDoEixo,
  mediaPontuacao,
  mudarMes,
  acoesDoGrupo,
  opcoesAtivas,
  ordenarAcoes,
  podeSomar,
  pontosPossiveis,
  ordenarProjetos,
  periodoDoProjeto,
  pesagensDoProjeto,
  pontuarDia,
  reordenar,
  reordenarSubconjunto,
  resumir,
  semanasDoMes,
  somarPontos,
  temOpcoes,
  type Acao,
  type Opcao,
  type Pesagem,
  type Projeto,
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
  grupos: [],
  ...campos,
});

const umaOpcao = (pontos: number, ativa = true): Opcao => ({
  id: 1,
  nome: "o",
  pontos,
  ativa,
  ordem: 0,
});

/*
 * Uma pesagem de mentira a partir do dia.
 *
 * O id vem de um contador e o instante, do meio-dia do próprio dia — os dois
 * derivados para quem chama escrever só `p("2026-09-05", 86)`. Nem a hora nem
 * o id interessam a quase nenhum destes testes, e repeti-los em cada linha
 * esconderia o que cada caso prova. Quem precisa de hora passa `hora`.
 *
 * Meio-dia e não meia-noite: em fuso negativo, meia-noite local cai no dia
 * anterior em UTC, e um teste passaria ou falharia conforme a máquina.
 */
let proximoId = 1;
const p = (
  dia: string,
  pesoKg: number,
  { padronizada = true, hora = "12:00", projetoId = null as number | null } = {},
): Pesagem => ({
  id: proximoId++,
  dia,
  medidoEm: new Date(`${dia}T${hora}`).toISOString(),
  pesoKg,
  padronizada,
  projetoId,
  nota: null,
});

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

describe("emLibras", () => {
  it("converte pelo valor exato da definição", () => {
    // Uma libra é 0,45359237 kg por acordo internacional, não por arredondamento.
    expect(emLibras(1)).toBeCloseTo(2.2046226218, 9);
    expect(emLibras(0.45359237)).toBeCloseTo(1, 12);
  });

  it("converte os pesos que estão na tela", () => {
    expect(emLibras(95.9)).toBeCloseTo(211.42, 2);
    expect(emLibras(62.6)).toBeCloseTo(138.01, 2);
  });

  it("zero continua zero, e a conta é proporcional", () => {
    expect(emLibras(0)).toBe(0);
    expect(emLibras(200)).toBeCloseTo(2 * emLibras(100), 9);
  });

  it("o valor cortado em 2,2046 erraria o que a tela mostra", () => {
    /*
     * Por que a constante é escrita como `1 / 0.45359237` e não como 2,2046.
     *
     * Com quatro casas, 95,9 kg dá 211,4211 lb; com o valor exato, 211,4231. A
     * tela mostra uma casa decimal, então a diferença não aparece HOJE — mas
     * aparece em qualquer peso que caia perto da virada do arredondamento, e
     * descobrir isso por um décimo errado no histórico seria pior.
     */
    const cortado = 95.9 * 2.2046;
    expect(Math.abs(emLibras(95.9) - cortado)).toBeGreaterThan(0.001);
  });

  it("formata com a mesma regra do quilo", () => {
    // Uma casa e vírgula, pela mesma função — a unidade muda, o feitio não.
    expect(formatarPeso(emLibras(95.9))).toBe("211,4");
    expect(formatarPeso(emLibras(100))).toBe("220,5");
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
    const r = resumir(serie, 80)!;
    expect(r.variacao).toBe(-5);
    expect(r.faltam).toBe(5);
    expect(r.progresso).toBe(0.5);
  });

  it("guarda as duas pontas, que é o que a tela mostra", () => {
    const r = resumir(serie, 80)!;
    expect(r.inicial.pesoKg).toBe(90);
    expect(r.atual.pesoKg).toBe(85);
  });

  it("limita o progresso entre 0 e 100%", () => {
    expect(resumir([p("2026-09-01", 90), p("2026-09-02", 92)], 80)!.progresso).toBe(0);
    expect(resumir([p("2026-09-01", 90), p("2026-09-02", 78)], 80)!.progresso).toBe(1);
  });

  it("não divide por zero quando já começou na meta", () => {
    expect(resumir([p("2026-09-01", 80)], 80)!.progresso).toBe(1);
  });
});

describe("imc", () => {
  it("calcula a partir do peso e da altura em cm", () => {
    expect(imc(85, 180)).toBeCloseTo(26.23, 2);
    expect(imc(70.4, 170)).toBeCloseTo(24.36, 2);
  });

  it("devolve null sem altura, porque o perfil é opcional", () => {
    expect(imc(85, null)).toBeNull();
    // Zero também: altura 0 faria a divisão estourar para o infinito.
    expect(imc(85, 0)).toBeNull();
  });

  it("é de UM peso — as duas pontas do projeto dão IMCs diferentes", () => {
    // É por isso que o IMC deixou de ser campo do resumo: a tela mostra o da
    // primeira pesagem ao lado do da última, e um campo só não diria os dois.
    expect(imc(84.1, 170)!).toBeCloseTo(29.1, 1);
    expect(imc(70.4, 170)!).toBeCloseTo(24.4, 1);
  });
});

describe("formatarImc", () => {
  it("usa uma casa decimal e vírgula", () => {
    expect(formatarImc(24.36)).toBe("24,4");
    expect(formatarImc(31.94)).toBe("31,9");
  });

  it("mantém a casa decimal no número redondo", () => {
    // Sem o mínimo, 25 sairia "25" e a coluna de números perdia o alinhamento.
    expect(formatarImc(25)).toBe("25,0");
  });
});

describe("várias pesagens no mesmo dia", () => {
  /*
   * O caso que o modelo passou a permitir: pesar de manhã e de novo à noite.
   *
   * A API devolve em ordem de instante crescente, e é dessa ordem que
   * `resumir` tira a inicial (a primeira) e o peso atual (a última). Com duas
   * no mesmo dia, isso tem de continuar valendo DENTRO do dia — era aqui que
   * uma ordenação por dia só daria empate e o "atual" sairia ao sabor da sorte.
   */
  const doisNoDia = [
    p("2026-06-01", 90, { hora: "06:00" }),
    p("2026-09-30", 85, { hora: "06:30" }),
    p("2026-09-30", 86.4, { hora: "21:00" }),
  ];

  it("o peso atual é a última pesagem no tempo, não a primeira do dia", () => {
    const r = resumir(doisNoDia, null)!;
    expect(r.atual.pesoKg).toBe(86.4);
    expect(r.atual.medidoEm).toBe(doisNoDia[2]!.medidoEm);
  });

  it("a variação conta da primeira à última, atravessando o dia repetido", () => {
    expect(resumir(doisNoDia, null)!.variacao).toBeCloseTo(-3.6, 10);
  });


  it("uma pesagem tardia não muda o dia a que ela pertence", () => {
    // 22h em fuso negativo já é o dia seguinte em UTC. O `dia` é guardado à
    // parte justamente para não depender disso — e é por ele que o calendário
    // e os recortes de projeto perguntam.
    const tardia = p("2026-09-30", 85, { hora: "22:30" });
    expect(tardia.dia).toBe("2026-09-30");
    expect(tardia.medidoEm.slice(0, 10)).not.toBe(tardia.dia);
  });
});

describe("os recortes de projeto", () => {
  /*
   * A forma que o histórico de verdade tem: dois projetos e um punhado de
   * pesagens soltas — as importadas de outro app, que ainda não foram
   * repartidas. As soltas são a razão de `projetoId` aceitar nulo.
   */
  const lista = [
    p("2019-03-01", 80, { projetoId: null }),
    p("2019-03-10", 79, { projetoId: null }),
    p("2026-10-03", 95.9, { projetoId: 7 }),
    p("2026-10-15", 92.3, { projetoId: 7 }),
    p("2026-10-20", 91, { projetoId: 9 }),
  ];

  describe("pesagensDoProjeto", () => {
    it("recorta pelo projeto", () => {
      expect(pesagensDoProjeto(lista, 7).map((x) => x.pesoKg)).toEqual([95.9, 92.3]);
      expect(pesagensDoProjeto(lista, 9).map((x) => x.pesoKg)).toEqual([91]);
    });

    it("com null traz as que estão fora de projeto", () => {
      // Não é caso de borda: é a fila de trabalho de quem vai repartir o
      // histórico importado em projetos.
      expect(pesagensDoProjeto(lista, null).map((x) => x.pesoKg)).toEqual([80, 79]);
    });

    it("projeto sem pesagem devolve lista vazia", () => {
      expect(pesagensDoProjeto(lista, 999)).toEqual([]);
    });

    it("não altera a lista recebida", () => {
      const antes = [...lista];
      pesagensDoProjeto(lista, 7);
      expect(lista).toEqual(antes);
    });
  });

  describe("periodoDoProjeto", () => {
    it("vai da primeira à última pesagem", () => {
      expect(periodoDoProjeto(pesagensDoProjeto(lista, 7))).toEqual({
        de: "2026-10-03",
        ate: "2026-10-15",
      });
    });

    it("uma pesagem só começa e termina no mesmo dia", () => {
      expect(periodoDoProjeto(pesagensDoProjeto(lista, 9))).toEqual({
        de: "2026-10-20",
        ate: "2026-10-20",
      });
    });

    it("devolve null sem pesagem nenhuma", () => {
      // O projeto acabou de ser criado: existe, mas ainda não tem período. Dar
      // a ele a data de criação diria que começou num dia em que ninguém pesou.
      expect(periodoDoProjeto([])).toBeNull();
    });
  });

  describe("diasDoProjeto", () => {
    it("conta as duas pontas", () => {
      // 03 a 15 de outubro são 13 dias contando os dois extremos.
      expect(diasDoProjeto(pesagensDoProjeto(lista, 7))).toBe(13);
    });

    it("uma pesagem só é um dia, não zero", () => {
      expect(diasDoProjeto(pesagensDoProjeto(lista, 9))).toBe(1);
    });

    it("atravessa a virada do ano", () => {
      const virada = [p("2025-12-30", 90, { projetoId: 1 }), p("2026-01-02", 89, { projetoId: 1 })];
      expect(diasDoProjeto(virada)).toBe(4);
    });

    it("devolve null sem pesagem nenhuma", () => {
      expect(diasDoProjeto([])).toBeNull();
    });
  });

  describe("formatarDias", () => {
    it("usa o singular em um dia", () => {
      // O cartão dizia "1 dias" — acontece sempre que alguém pesa duas vezes na
      // mesma manhã e nunca mais volta ao projeto.
      expect(formatarDias(1)).toBe("1 dia");
    });

    it("usa o plural no resto", () => {
      expect(formatarDias(0)).toBe("0 dias");
      expect(formatarDias(2)).toBe("2 dias");
      expect(formatarDias(186)).toBe("186 dias");
    });
  });

  describe("ordenarProjetos", () => {
    const pj = (id: number, nome: string): Projeto => ({ id, nome, pesoAlvo: null, nota: null });

    it("põe o mais recente na frente, pelo período e não pelo id", () => {
      /*
       * O caso real que motivou isto: o projeto de 2026 foi criado PRIMEIRO
       * (id 1) e os reconstruídos do histórico vieram depois (ids maiores).
       * Por id, o projeto em andamento caía no fim da fila.
       */
      const projetos = [pj(3, "jan/2025"), pj(2, "dez/2018"), pj(1, "atual 2026")];
      const pesagens = [
        p("2018-12-27", 76, { projetoId: 2 }),
        p("2019-06-30", 72, { projetoId: 2 }),
        p("2025-01-04", 84, { projetoId: 3 }),
        p("2026-10-15", 92, { projetoId: 1 }),
      ];
      expect(ordenarProjetos(projetos, pesagens).map((x) => x.nome)).toEqual([
        "atual 2026",
        "jan/2025",
        "dez/2018",
      ]);
    });

    it("projeto sem pesagem vem primeiro", () => {
      // Acabou de ser criado: é nele que se vai pesar.
      const projetos = [pj(1, "antigo"), pj(2, "recém-criado")];
      const pesagens = [p("2026-10-15", 92, { projetoId: 1 })];
      expect(ordenarProjetos(projetos, pesagens).map((x) => x.nome)).toEqual([
        "recém-criado",
        "antigo",
      ]);
    });

    it("empate no fim do período desempata pelo id maior", () => {
      const projetos = [pj(1, "um"), pj(2, "dois")];
      const pesagens = [
        p("2026-10-15", 92, { projetoId: 1 }),
        p("2026-10-15", 91, { projetoId: 2 }),
      ];
      expect(ordenarProjetos(projetos, pesagens).map((x) => x.nome)).toEqual(["dois", "um"]);
    });

    it("dois sem pesagem desempatam pelo id maior", () => {
      const projetos = [pj(1, "um"), pj(2, "dois")];
      expect(ordenarProjetos(projetos, [])).toEqual([pj(2, "dois"), pj(1, "um")]);
    });

    it("não altera a lista recebida", () => {
      const projetos = [pj(1, "um"), pj(2, "dois"), pj(3, "três")];
      const antes = [...projetos];
      ordenarProjetos(projetos, [p("2026-01-01", 90, { projetoId: 1 })]);
      expect(projetos).toEqual(antes);
    });

    it("aguenta lista vazia", () => {
      expect(ordenarProjetos([], [])).toEqual([]);
    });
  });

  describe("resumir sem meta", () => {
    it("dá as pontas e a variação, mas não faltam nem progresso", () => {
      // É o caso de "sem projeto" e dos projetos reconstruídos do passado: sem
      // alvo não há o que faltar, mas o peso ainda variou entre as duas pontas.
      const r = resumir(pesagensDoProjeto(lista, null), null)!;
      expect(r.variacao).toBe(-1);
      expect(r.faltam).toBeNull();
      expect(r.progresso).toBeNull();
    });
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

describe("acoesDoGrupo", () => {
  const trabalho = umaAcao({ id: 1, grupos: [1] });
  const fimDeSemana = umaAcao({ id: 2, grupos: [2] });
  const sempre = umaAcao({ id: 3, grupos: [1, 2] });
  const solta = umaAcao({ id: 4, grupos: [] });
  const todas = [trabalho, fimDeSemana, sempre, solta];

  it("traz só as do grupo pedido", () => {
    expect(acoesDoGrupo(todas, 1).map((a) => a.id)).toEqual([1, 3]);
    expect(acoesDoGrupo(todas, 2).map((a) => a.id)).toEqual([2, 3]);
  });

  it("ação sem grupo não aparece em grupo nenhum", () => {
    expect(acoesDoGrupo(todas, 1)).not.toContain(solta);
    expect(acoesDoGrupo(todas, 2)).not.toContain(solta);
  });

  it("sem grupo escolhido, nenhuma ação vale", () => {
    expect(acoesDoGrupo(todas, null)).toEqual([]);
  });

  it("grupo que não existe não traz nada", () => {
    expect(acoesDoGrupo(todas, 99)).toEqual([]);
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

describe("reordenar", () => {
  const abc = ["a", "b", "c", "d"];

  it("leva um item para tras e para frente", () => {
    expect(reordenar(abc, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(reordenar(abc, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("move entre vizinhos, que e o caso das setas", () => {
    expect(reordenar(abc, 1, 0)).toEqual(["b", "a", "c", "d"]);
    expect(reordenar(abc, 2, 3)).toEqual(["a", "b", "d", "c"]);
  });

  it("nao mexe quando a origem e o destino sao o mesmo", () => {
    expect(reordenar(abc, 2, 2)).toEqual(abc);
  });

  it("devolve a lista intacta com indice fora da faixa", () => {
    // O arrasto pode pedir uma posicao que a lista ja nao tem, se uma linha
    // saiu no meio do gesto. Embaralhar ali seria pior que nao fazer nada.
    expect(reordenar(abc, -1, 2)).toEqual(abc);
    expect(reordenar(abc, 0, 9)).toEqual(abc);
    expect(reordenar(abc, 9, 0)).toEqual(abc);
    expect(reordenar([], 0, 0)).toEqual([]);
  });

  it("nao altera a lista recebida", () => {
    const original = [...abc];
    reordenar(abc, 0, 3);
    expect(abc).toEqual(original);
  });

  it("preserva todos os itens, so a ordem muda", () => {
    const movido = reordenar(abc, 1, 3);
    expect([...movido].sort()).toEqual([...abc].sort());
    expect(movido).toHaveLength(abc.length);
  });
});

describe("reordenarSubconjunto", () => {
  // P = positiva, N = negativa. A tela reordena so dentro de um tipo.
  const lista = ["P1", "N1", "P2", "P3", "N2"];
  const positiva = (x: string) => x.startsWith("P");

  it("move dentro do subconjunto usando indices do subconjunto", () => {
    // P1 esta na posicao 0 das positivas; mandar para 2 deixa P2, P3, P1.
    // As vagas das positivas na lista completa sao 0, 2 e 3.
    expect(reordenarSubconjunto(lista, positiva, 0, 2)).toEqual(["P2", "N1", "P3", "P1", "N2"]);
  });

  it("nao tira do lugar quem esta fora do subconjunto", () => {
    const fora = (x: string) => !positiva(x);
    const depois = reordenarSubconjunto(lista, positiva, 0, 2);
    // As negativas continuam nas mesmas posicoes da lista completa.
    expect(depois.filter(fora)).toEqual(lista.filter(fora));
    expect(depois.indexOf("N1")).toBe(lista.indexOf("N1"));
    expect(depois.indexOf("N2")).toBe(lista.indexOf("N2"));
  });

  it("devolve a lista intacta quando nao ha o que mover", () => {
    expect(reordenarSubconjunto(lista, positiva, 1, 1)).toEqual(lista);
    expect(reordenarSubconjunto(lista, positiva, 0, 9)).toEqual(lista);
    // Indice valido na lista completa mas nao no subconjunto: so ha 3 positivas.
    expect(reordenarSubconjunto(lista, positiva, 0, 4)).toEqual(lista);
  });

  it("aguenta subconjunto vazio ou de um so", () => {
    expect(reordenarSubconjunto(lista, (x) => x === "nada", 0, 1)).toEqual(lista);
    expect(reordenarSubconjunto(lista, (x) => x === "N1", 0, 0)).toEqual(lista);
  });

  it("preserva todos os itens", () => {
    const depois = reordenarSubconjunto(lista, positiva, 2, 0);
    expect([...depois].sort()).toEqual([...lista].sort());
  });

  it("nao altera a lista recebida", () => {
    const original = [...lista];
    reordenarSubconjunto(lista, positiva, 0, 2);
    expect(lista).toEqual(original);
  });
});
