import { describe, expect, it } from "vitest";
import { proximaParada } from "./carrossel.tsx";

/*
 * O carrossel em si é DOM e só se vê no navegador. A DECISÃO de para onde rolar,
 * não: ela é aritmética, e é onde moram os casos que quebram.
 *
 * O cenário é a fila de projetos: cartões de larguras diferentes, encostados uns
 * nos outros. `paradas` são as rolagens que põem cada cartão na borda esquerda.
 */
const paradas = [0, 120, 260, 380, 540];
// A faixa mostra 300px por vez; o conteúdo todo tem 660 (540 + o último cartão).
const FIM = 360;

describe("proximaParada", () => {
  it("avança um cartão por vez, e não uma fração da tela", () => {
    expect(proximaParada(paradas, 0, 1, FIM)).toBe(120);
    expect(proximaParada(paradas, 120, 1, FIM)).toBe(260);
    expect(proximaParada(paradas, 260, 1, FIM)).toBe(360);
  });

  it("volta um cartão por vez", () => {
    expect(proximaParada(paradas, 260, -1, FIM)).toBe(120);
    expect(proximaParada(paradas, 120, -1, FIM)).toBe(0);
  });

  it("não trava no cartão em que já está, com rolagem fracionária", () => {
    /*
     * O caso que a folga de 1px resolve. Em tela com zoom, a rolagem para em
     * 120,4 em vez de 120; sem a folga, a própria parada 120 contaria como
     * "próxima" e o toque na seta não sairia do lugar.
     */
    expect(proximaParada(paradas, 120.4, 1, FIM)).toBe(260);
    expect(proximaParada(paradas, 119.6, 1, FIM)).toBe(260);
  });

  it("no fim da faixa vai até a ponta, em vez de não fazer nada", () => {
    // Já passou da última parada alcançável: o que falta é só o rabo do último
    // cartão, e é ele que o toque precisa revelar.
    expect(proximaParada(paradas, 350, 1, FIM)).toBe(FIM);
  });

  it("no começo, voltar não passa de zero", () => {
    expect(proximaParada(paradas, 0, -1, FIM)).toBe(0);
    expect(proximaParada(paradas, 0.4, -1, FIM)).toBe(0);
  });

  it("limita ao fim quando a parada do último cartão não é alcançável", () => {
    /*
     * A última parada (540) está além da rolagem máxima (360): não existe
     * rolagem que encoste o último cartão na borda esquerda quando é ele que
     * fecha a faixa. Sem o limite, a conta devolveria 540 e a seta pareceria
     * quebrada — o navegador pararia em 360 e um segundo toque não faria nada.
     */
    expect(proximaParada(paradas, 300, 1, FIM)).toBe(360);
    expect(proximaParada(paradas, 300, 1, FIM)).toBeLessThanOrEqual(FIM);
  });

  it("aguenta faixa sem item nenhum", () => {
    expect(proximaParada([], 0, 1, 0)).toBe(0);
    expect(proximaParada([], 0, -1, 0)).toBe(0);
  });

  it("aguenta faixa que cabe inteira na tela", () => {
    // Nada a rolar: `fim` é zero, e os dois sentidos param em zero. Na tela as
    // setas estão apagadas aqui, mas a conta não pode depender disso.
    expect(proximaParada([0, 120], 0, 1, 0)).toBe(0);
    expect(proximaParada([0, 120], 0, -1, 0)).toBe(0);
  });
});
