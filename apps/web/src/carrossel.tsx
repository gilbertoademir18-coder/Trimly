import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Folga para o arredondamento do navegador.
 *
 * Posições de rolagem são fracionárias em tela com zoom ou densidade
 * fracionária. Sem a folga, o item em que a faixa JÁ está contaria como
 * próximo (por 0,3px de diferença) e o toque na seta não sairia do lugar.
 */
const FOLGA = 1;

/**
 * Para onde rolar ao tocar uma seta, andando UM item.
 *
 * `paradas` são as posições de rolagem que encostam cada item na borda
 * esquerda da faixa, em ordem crescente; `atual` é onde a faixa está; `fim` é
 * a rolagem máxima.
 *
 * Item e não uma fração da largura: os cartões têm larguras diferentes, então
 * rolar "80% da tela" parava no meio de um deles. Encostar o próximo na borda
 * é o que faz cada toque terminar numa posição que alguém escolheria.
 *
 * Sem próximo item — o último já encostado, sobrando só o rabo da faixa —, vai
 * até a ponta: assim o toque final mostra o que faltava, em vez de não fazer
 * nada com a seta ainda acesa.
 *
 * O resultado é limitado a [0, fim] porque a última parada costuma passar do
 * fim: não há rolagem que encoste o último cartão na borda esquerda quando ele
 * é o que fecha a faixa.
 */
export function proximaParada(
  paradas: number[],
  atual: number,
  sentido: -1 | 1,
  fim: number,
): number {
  const alvo =
    sentido === 1
      ? paradas.find((x) => x > atual + FOLGA)
      : paradas.findLast((x) => x < atual - FOLGA);
  const destino = alvo ?? (sentido === 1 ? fim : 0);
  return Math.max(0, Math.min(destino, fim));
}

/**
 * Uma faixa que rola de lado, com setas em vez de barra de rolagem.
 *
 * Não roda sozinha: as setas só andam quando alguém as toca. Carrossel que gira
 * no automático troca o conteúdo debaixo do dedo de quem estava lendo.
 *
 * As setas ficam NO FLUXO, uma de cada lado, e a faixa ocupa o meio. Não flutuam
 * sobre o conteúdo: por cima, elas tapavam justamente a ficha da ponta, que é a
 * que se quer ler para decidir se vale rolar.
 *
 * E são um ACRÉSCIMO, não o único caminho: a faixa continua `overflow-x: auto`,
 * então arrastar com o dedo, girar a roda com shift e o `Tab` levando o foco a
 * um item fora da vista seguem funcionando. Só a barra fica escondida — era ela
 * que incomodava.
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
   * Há o que rolar de cada lado? É o que acende cada seta.
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
     * Observa o tamanho da faixa E o de cada item: a fila também muda de
     * largura quando um item é criado ou apagado, sem a janela mexer. Sem isto,
     * a seta ficava acesa apontando para o nada.
     */
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    for (const filho of el.children) observador.observe(filho);
    return () => observador.disconnect();
  }, [medir, children]);

  /** Mede o DOM e entrega a decisão a `proximaParada`, que é pura e testada. */
  function andar(sentido: -1 | 1) {
    const el = faixa.current;
    if (!el) return;

    /*
     * A posição de cada item DENTRO do conteúdo rolável. Medida assim e não por
     * `offsetLeft`, que é relativo ao ancestral posicionado mais próximo — um
     * `relative` em qualquer avô daria números de outro sistema de coordenadas.
     *
     * O respiro lateral (`px-1`, que existe para o anel de foco não ser cortado)
     * sai da conta: sem descontá-lo, cada toque deixaria o item uns pixels à
     * esquerda de onde devia parar.
     */
    const esquerda = el.getBoundingClientRect().left;
    const respiro = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const paradas = [...el.children].map(
      (f) => f.getBoundingClientRect().left - esquerda + el.scrollLeft - respiro,
    );

    const fim = el.scrollWidth - el.clientWidth;
    el.scrollTo({
      left: proximaParada(paradas, el.scrollLeft, sentido, fim),
      behavior: "smooth",
    });
  }

  return (
    <div className="flex items-center gap-1">
      {/*
        As setas ficam sempre no lugar, e apagam quando não há para onde ir.
        Apagar e não sumir: elas ocupam espaço no fluxo, e esconder uma faria a
        faixa mudar de largura e os cartões saltarem de lado.
      */}
      <Seta lado="esquerda" rotulo={rotuloAnterior} ativa={podeVoltar} aoTocar={() => andar(-1)} />

      <div
        ref={faixa}
        onScroll={medir}
        // `sem-barra` esconde a barra sem desligar a rolagem (veja app.css).
        className="sem-barra flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth px-1 py-1"
      >
        {children}
      </div>

      <Seta lado="direita" rotulo={rotuloProximo} ativa={podeAvancar} aoTocar={() => andar(1)} />
    </div>
  );
}

function Seta({
  lado,
  rotulo,
  ativa,
  aoTocar,
}: {
  lado: "esquerda" | "direita";
  rotulo: string;
  ativa: boolean;
  aoTocar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoTocar}
      disabled={!ativa}
      aria-label={rotulo}
      className="size-8 shrink-0 rounded-full border border-borda bg-superficie text-sm text-tinta-2 transition-opacity hover:text-tinta disabled:opacity-30"
    >
      <span aria-hidden="true">{lado === "esquerda" ? "‹" : "›"}</span>
    </button>
  );
}
