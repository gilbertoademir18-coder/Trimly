import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Uma faixa que rola de lado, com setas em vez de barra de rolagem.
 *
 * Não roda sozinha: as setas só andam quando alguém as toca. Carrossel que gira
 * no automático troca o conteúdo debaixo do dedo de quem estava lendo.
 *
 * As setas são um ACRÉSCIMO, não o único caminho: a faixa continua sendo
 * `overflow-x: auto`, então arrastar com o dedo, girar a roda com shift e o
 * `Tab` levando o foco a um item fora da vista seguem funcionando. Só a barra
 * fica escondida — era ela que incomodava.
 */
export function Carrossel({
  rotuloAnterior = "Ver anteriores",
  rotuloProximo = "Ver próximos",
  children,
}: {
  rotuloAnterior?: string;
  rotuloProximo?: string;
  children: React.ReactNode;
}) {
  const faixa = useRef<HTMLDivElement>(null);
  const [podeVoltar, setPodeVoltar] = useState(false);
  const [podeAvancar, setPodeAvancar] = useState(false);

  /*
   * Há o que rolar de cada lado? É o que decide se cada seta aparece.
   *
   * A folga de 1px é para o arredondamento do navegador: em telas com zoom ou
   * densidade fracionária, a soma da rolagem com a largura visível para um
   * pouquinho antes da largura total, e a seta de avançar ficaria acesa para
   * sempre num fim de faixa.
   */
  const medir = useCallback(() => {
    const el = faixa.current;
    if (!el) return;
    setPodeVoltar(el.scrollLeft > 1);
    setPodeAvancar(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = faixa.current;
    if (!el) return;
    medir();
    /*
     * Observa o tamanho, e não só o `resize` da janela: a faixa também muda de
     * largura quando um projeto é criado ou apagado, sem a janela mexer. Sem
     * isto, a seta ficava acesa apontando para o nada.
     */
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    for (const filho of el.children) observador.observe(filho);
    return () => observador.disconnect();
  }, [medir, children]);

  /** Anda quase uma tela por toque — a sobra deixa uma âncora do que já se via. */
  function andar(sentido: -1 | 1) {
    const el = faixa.current;
    if (!el) return;
    el.scrollBy({ left: sentido * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={faixa}
        onScroll={medir}
        // `sem-barra` esconde a barra sem desligar a rolagem (veja app.css).
        className="sem-barra -mx-1 flex gap-2 overflow-x-auto scroll-smooth px-1 py-1"
      >
        {children}
      </div>

      {/*
        As setas flutuam sobre as pontas da faixa, e só aparecem quando há o que
        rolar para aquele lado. Escondidas em vez de desabilitadas: seta apagada
        numa lista que cabe inteira na tela é enfeite que confunde.

        `pointer-events-none` no véu e `auto` no botão para o vão ao redor da
        seta não roubar o clique da ficha que está embaixo.
      */}
      {podeVoltar && (
        <Seta lado="esquerda" rotulo={rotuloAnterior} aoTocar={() => andar(-1)} />
      )}
      {podeAvancar && <Seta lado="direita" rotulo={rotuloProximo} aoTocar={() => andar(1)} />}
    </div>
  );
}

function Seta({
  lado,
  rotulo,
  aoTocar,
}: {
  lado: "esquerda" | "direita";
  rotulo: string;
  aoTocar: () => void;
}) {
  const esquerda = lado === "esquerda";
  return (
    <div
      className={
        "pointer-events-none absolute inset-y-0 flex items-center " +
        (esquerda ? "left-0 pr-6" : "right-0 pl-6")
      }
    >
      {/*
        O degradê é o que avisa que há mais conteúdo passando por baixo: sem ele
        a seta parece boiar sobre uma ficha cortada no meio, sem explicação.
      */}
      <div
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-y-0 w-14 " +
          (esquerda
            ? "left-0 bg-gradient-to-r from-fundo to-transparent"
            : "right-0 bg-gradient-to-l from-fundo to-transparent")
        }
      />
      <button
        type="button"
        onClick={aoTocar}
        aria-label={rotulo}
        className="pointer-events-auto relative size-8 rounded-full border border-borda bg-superficie text-sm text-tinta-2 shadow-sm hover:text-tinta"
      >
        <span aria-hidden="true">{esquerda ? "‹" : "›"}</span>
      </button>
    </div>
  );
}
