import { useEffect, useRef } from "react";

/**
 * A janela modal do app, sobre o `<dialog>` nativo.
 *
 * Nativo e não uma div com `position: fixed`: o `showModal()` já entrega foco
 * preso dentro da janela, o resto da página inerte para leitor de tela e o
 * `::backdrop`. Reimplementar isso à mão é onde acessibilidade costuma se
 * perder — e seria muito mais código que este arquivo inteiro.
 *
 * Só o × fecha. Clique fora e Esc estão desligados de propósito: fechar sem
 * querer no meio de um cadastro perde o que estava digitado, e aqui dentro
 * sempre há um formulário aberto.
 */
export function Modal({
  aberto,
  titulo,
  aoFechar,
  children,
}: {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    // `open` evita chamar showModal() num diálogo já aberto, que lança.
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  // Sem isto o fundo rola por trás da janela no celular, e ao fechar a página
  // aparece num lugar diferente de onde estava.
  //
  // A trava vai no <html>, o mesmo elemento que leva o `scrollbar-gutter:
  // stable` do app.css — é o par que impede a página de saltar para o lado
  // quando a barra de rolagem some.
  useEffect(() => {
    if (!aberto) return;
    const raiz = document.documentElement;
    const antes = raiz.style.overflow;
    raiz.style.overflow = "hidden";
    return () => {
      raiz.style.overflow = antes;
    };
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      // O `cancel` é o pedido de fechar que o Esc dispara. Barrado aqui, a
      // janela fica imune ao toque acidental — e o × continua à mão.
      onCancel={(e) => e.preventDefault()}
      // Ainda dispara quando fechamos por código, no efeito acima: é por aqui
      // que o estado do pai confirma o fechamento em vez de dessincronizar.
      onClose={aoFechar}
      aria-label={titulo}
      className="m-auto max-h-[85dvh] w-[min(32rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-borda bg-fundo p-0 text-tinta backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-3 border-b border-borda bg-superficie px-4 py-3">
        <h2 className="font-semibold">{titulo}</h2>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="size-8 rounded-full border border-borda text-tinta-2"
        >
          ×
        </button>
      </div>
      {/*
        O conteúdo só existe enquanto a janela está aberta.

        O <dialog> fica montado o tempo todo (o showModal() precisa dele no
        DOM), e sem isto o painel de dentro guardaria o estado de uma abertura
        para a outra — clicar em "Editar", fechar e reabrir devolvia a janela
        no meio da edição. Desmontando, toda abertura começa limpa.
      */}
      <div className="max-h-[calc(85dvh-3.5rem)] overflow-y-auto p-4">{aberto && children}</div>
    </dialog>
  );
}
