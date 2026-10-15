import { useRef, useState } from "react";

/**
 * Arrastar para reordenar uma lista, sobre Pointer Events.
 *
 * Pointer e não o drag-and-drop nativo do HTML5: aquele simplesmente não
 * dispara em toque, e o Trimly vive no celular. `pointerdown/move/up` trata
 * dedo e mouse pelo mesmo caminho, sem biblioteca nova.
 *
 * Quem usa diz o que fazer (`aoMover`) e, se quiser, o que fazer quando o dedo
 * larga (`aoLargar`) — é onde mora um "salva no servidor", que não deve rodar a
 * cada pixel do caminho.
 *
 * O teclado não passa por aqui: a alça é só para o ponteiro, e quem navega por
 * Tab reordena pelas setas que cada linha oferece ao lado dela.
 */
export function useArrastavel({
  aoMover,
  aoLargar,
}: {
  /** Chamado a cada troca de posição durante o gesto. */
  aoMover: (de: number, para: number) => void;
  /** Chamado uma vez, ao soltar, com a posição em que a linha parou. */
  aoLargar?: (parouEm: number) => void;
}) {
  /*
   * O ref é a verdade durante o gesto; o estado existe só para pintar a linha.
   *
   * Eventos de ponteiro chegam mais rápido que renders: lendo o índice do
   * estado, o segundo movimento decidiria com base no primeiro ainda não
   * aplicado — a linha passava da posição e voltava.
   */
  const arrastandoRef = useRef<number | null>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const linhas = useRef<(HTMLElement | null)[]>([]);

  /** Põe no `ref` de cada linha, para saber onde elas estão na tela. */
  const refDaLinha = (i: number) => (el: HTMLElement | null) => {
    linhas.current[i] = el;
  };

  /** Espalhe na alça: `<span {...alca(i)}>⠿</span>`. */
  const alca = (i: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      // A captura é o que mantém o resto do gesto chegando neste elemento
      // mesmo com o dedo fora dele. Sem ela o arrasto morre no primeiro pixel
      // para fora da alça.
      e.currentTarget.setPointerCapture(e.pointerId);
      arrastandoRef.current = i;
      setArrastando(i);
    },

    onPointerMove: (e: React.PointerEvent) => {
      const de = arrastandoRef.current;
      if (de === null) return;

      // Em cima de qual linha está o dedo? Mede-se o que está na tela, em vez
      // de contar altura × índice: as linhas crescem quando o texto quebra.
      const para = linhas.current.findIndex((el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        // Linha já fora do DOM devolve um retângulo zerado, que casaria com um
        // dedo no topo absoluto da tela. A altura confere que ela é real.
        if (r.height === 0) return false;
        return e.clientY >= r.top && e.clientY <= r.bottom;
      });

      if (para === -1 || para === de) return;
      aoMover(de, para);
      arrastandoRef.current = para;
      setArrastando(para);
    },

    onPointerUp: () => soltar(),
    onPointerCancel: () => soltar(),

    // `touch-none` (touch-action: none) é o que faz o arrasto existir no
    // celular: sem ele o navegador entende o gesto como rolagem e nunca manda
    // os eventos. `cursor-grab` é só o enfeite no desktop.
    className: "cursor-grab touch-none active:cursor-grabbing",
  });

  function soltar() {
    const parouEm = arrastandoRef.current;
    arrastandoRef.current = null;
    setArrastando(null);
    if (parouEm !== null) aoLargar?.(parouEm);
  }

  /** O índice da linha em viagem, para destacá-la. `null` fora do gesto. */
  return { arrastando, refDaLinha, alca };
}
