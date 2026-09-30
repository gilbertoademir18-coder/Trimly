import { describe, expect, it } from "vitest";
import {
  diaLocal,
  filtrarPeriodo,
  formatarVariacao,
  lerPeso,
  marcasDoEixo,
  resumir,
  type Pesagem,
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
