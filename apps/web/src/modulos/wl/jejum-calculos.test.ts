import { describe, expect, it } from "vitest";
import {
  agruparPorDia,
  doCampoLocal,
  duracaoSeg,
  emAndamento,
  faltamSeg,
  formatarDuracao,
  formatarRelogio,
  paraCampoLocal,
  progresso,
  type Jejum,
} from "./jejum-calculos.ts";

const j = (campos: Partial<Jejum> = {}): Jejum => ({
  id: 1,
  dia: "2026-09-30",
  inicio: "2026-09-30T23:00:00.000Z",
  fim: null,
  metaMin: null,
  nota: null,
  ...campos,
});

const em = (iso: string) => new Date(iso);

describe("duracaoSeg", () => {
  it("conta do início ao fim num jejum terminado", () => {
    const terminado = j({ inicio: "2026-09-30T23:00:00.000Z", fim: "2026-10-01T15:00:00.000Z" });
    expect(duracaoSeg(terminado)).toBe(16 * 3600);
  });

  it("conta até agora num jejum em andamento", () => {
    expect(duracaoSeg(j(), em("2026-10-01T06:30:00.000Z"))).toBe(7.5 * 3600);
  });

  it("ignora o `agora` quando o jejum já terminou", () => {
    const terminado = j({ fim: "2026-10-01T15:00:00.000Z" });
    // Daqui a uma semana a duração é a mesma: ela não corre mais.
    expect(duracaoSeg(terminado, em("2026-10-08T00:00:00.000Z"))).toBe(16 * 3600);
  });

  it("não devolve duração negativa", () => {
    // Relógio ajustado para trás no meio do jejum: para em zero, não conta ao contrário.
    expect(duracaoSeg(j(), em("2026-09-30T22:00:00.000Z"))).toBe(0);
  });
});

describe("emAndamento", () => {
  it("distingue o que corre do que terminou", () => {
    expect(emAndamento(j())).toBe(true);
    expect(emAndamento(j({ fim: "2026-10-01T15:00:00.000Z" }))).toBe(false);
  });
});

describe("formatarRelogio", () => {
  it("sempre com dois dígitos em cada campo", () => {
    expect(formatarRelogio(0)).toBe("00:00:00");
    expect(formatarRelogio(27015)).toBe("07:30:15");
  });

  it("não vira dias: um jejum longo mostra as horas inteiras", () => {
    expect(formatarRelogio(30 * 3600)).toBe("30:00:00");
  });
});

describe("formatarDuracao", () => {
  it("mostra horas e minutos", () => {
    expect(formatarDuracao(16 * 3600 + 12 * 60)).toBe("16h 12min");
  });

  it("some com o zero quando não há a outra parte", () => {
    expect(formatarDuracao(40 * 60)).toBe("40min");
    expect(formatarDuracao(16 * 3600)).toBe("16h");
  });

  it("despreza os segundos", () => {
    expect(formatarDuracao(59)).toBe("0min");
  });
});

describe("progresso e faltamSeg", () => {
  const com16h = j({ metaMin: 16 * 60 });

  it("é a fração da meta", () => {
    expect(progresso(com16h, em("2026-10-01T07:00:00.000Z"))).toBe(0.5);
    expect(faltamSeg(com16h, em("2026-10-01T07:00:00.000Z"))).toBe(8 * 3600);
  });

  it("passa de 1 quando a meta é batida e o jejum continua", () => {
    expect(progresso(com16h, em("2026-10-01T19:00:00.000Z"))).toBe(1.25);
    expect(faltamSeg(com16h, em("2026-10-01T19:00:00.000Z"))).toBe(-4 * 3600);
  });

  it("é null em jejum livre", () => {
    expect(progresso(j())).toBeNull();
    expect(faltamSeg(j())).toBeNull();
  });
});

describe("agruparPorDia", () => {
  const agora = em("2026-10-02T12:00:00.000Z");

  it("soma o total de cada dia", () => {
    const grupos = agruparPorDia(
      [
        j({ id: 1, dia: "2026-09-30", inicio: "2026-09-30T23:00:00.000Z", fim: "2026-10-01T07:00:00.000Z" }),
        j({ id: 2, dia: "2026-09-30", inicio: "2026-09-30T12:00:00.000Z", fim: "2026-09-30T16:00:00.000Z" }),
        j({ id: 3, dia: "2026-10-01", inicio: "2026-10-01T22:00:00.000Z", fim: "2026-10-02T06:00:00.000Z" }),
      ],
      agora,
    );
    expect(grupos.map((g) => [g.dia, g.totalSeg / 3600])).toEqual([
      ["2026-10-01", 8],
      ["2026-09-30", 12],
    ]);
  });

  it("mantém o jejum que atravessa a meia-noite no dia em que começou", () => {
    // Começou dia 30 às 23h e terminou dia 1º às 7h: conta inteiro para o dia 30.
    const grupos = agruparPorDia(
      [j({ dia: "2026-09-30", inicio: "2026-09-30T23:00:00.000Z", fim: "2026-10-01T07:00:00.000Z" })],
      agora,
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.dia).toBe("2026-09-30");
    expect(grupos[0]!.totalSeg).toBe(8 * 3600);
  });

  it("ordena os dias do mais recente para o mais antigo", () => {
    const grupos = agruparPorDia(
      [j({ id: 1, dia: "2026-09-28" }), j({ id: 2, dia: "2026-10-01" }), j({ id: 3, dia: "2026-09-30" })],
      agora,
    );
    expect(grupos.map((g) => g.dia)).toEqual(["2026-10-01", "2026-09-30", "2026-09-28"]);
  });

  it("dentro do dia, o mais recente primeiro", () => {
    const grupos = agruparPorDia(
      [
        j({ id: 1, inicio: "2026-09-30T08:00:00.000Z", fim: "2026-09-30T10:00:00.000Z" }),
        j({ id: 2, inicio: "2026-09-30T20:00:00.000Z", fim: "2026-09-30T22:00:00.000Z" }),
      ],
      agora,
    );
    expect(grupos[0]!.jejuns.map((x) => x.id)).toEqual([2, 1]);
  });

  it("conta o jejum em andamento até agora", () => {
    const grupos = agruparPorDia([j({ dia: "2026-10-02", inicio: "2026-10-02T08:00:00.000Z" })], agora);
    expect(grupos[0]!.totalSeg).toBe(4 * 3600);
  });

  it("lista vazia não vira grupo nenhum", () => {
    expect(agruparPorDia([], agora)).toEqual([]);
  });
});

describe("as pontes do campo datetime-local", () => {
  it("vai e volta sem perder o instante", () => {
    // Independente do fuso da máquina: o que importa é fechar o ciclo. Um
    // `iso.slice(0, 16)` ingênuo falharia aqui em qualquer fuso != UTC.
    const iso = "2026-10-01T23:07:00.000Z";
    expect(doCampoLocal(paraCampoLocal(iso))).toBe(iso);
  });

  it("o texto do campo tem o formato que o navegador espera", () => {
    expect(paraCampoLocal("2026-10-01T23:07:00.000Z")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("os segundos são zerados, porque o campo não os tem", () => {
    const comSegundos = "2026-10-01T23:07:45.000Z";
    expect(doCampoLocal(paraCampoLocal(comSegundos))).toBe("2026-10-01T23:07:00.000Z");
  });
});
