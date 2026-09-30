import { describe, expect, it } from "vitest";
import { dateParaDia, diaParaDate } from "./datas.ts";

describe("diaParaDate", () => {
  it("converte um dia válido para meia-noite UTC", () => {
    expect(diaParaDate("2026-09-30")?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("recusa dias que não existem em vez de rolar para o mês seguinte", () => {
    expect(diaParaDate("2026-02-31")).toBeNull();
    expect(diaParaDate("2026-13-01")).toBeNull();
  });

  it("aceita 29 de fevereiro só em ano bissexto", () => {
    expect(diaParaDate("2028-02-29")).not.toBeNull();
    expect(diaParaDate("2026-02-29")).toBeNull();
  });

  it("recusa formatos diferentes de AAAA-MM-DD", () => {
    expect(diaParaDate("30/09/2026")).toBeNull();
    expect(diaParaDate("2026-9-30")).toBeNull();
    expect(diaParaDate("2026-09-30T10:00")).toBeNull();
  });
});

describe("dateParaDia", () => {
  it("faz a volta completa", () => {
    expect(dateParaDia(diaParaDate("2026-01-05")!)).toBe("2026-01-05");
  });
});
