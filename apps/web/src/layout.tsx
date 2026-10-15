import { createContext, use, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Outlet, useMatches } from "react-router";

/**
 * O que cada rota declara sobre si no `handle`, e que o cabeçalho lê.
 *
 * Fica na rota e não na página porque quem monta o caminho é o roteador: a tela
 * de peso não tem como saber que está pendurada sob o WL, e ter de contar isso
 * a ela seria repetir, em cada página, o que `main.tsx` já diz.
 */
export type PuxadorDaRota = { titulo: string };

const temTitulo = (h: unknown): h is PuxadorDaRota =>
  typeof h === "object" && h !== null && typeof (h as PuxadorDaRota).titulo === "string";

/*
 * Onde o botão principal da página vai parar: um nó do DOM, no cabeçalho.
 *
 * Um nó e não um pedaço de estado com o botão dentro. Guardar JSX em estado
 * pediria que a página reenviasse o botão a cada render — e, como JSX novo é
 * sempre um objeto novo, o efeito que o enviasse dispararia sempre, caindo em
 * laço. Com o portal, o botão continua montado na árvore da PÁGINA (onde estão
 * o `onClick` e o estado que ele mexe) e só é PINTADO lá em cima.
 */
const ContextoDaAcao = createContext<HTMLElement | null>(null);

/**
 * O botão principal de uma tela, pintado no cabeçalho do app.
 *
 * Use uma vez por página, com o botão dentro. Página sem ação não usa, e o
 * canto do cabeçalho fica vazio.
 */
export function AcaoDaPagina({ children }: { children: React.ReactNode }) {
  const destino = use(ContextoDaAcao);
  // Nulo no primeiro render, antes de o `ref` do cabeçalho ter sido chamado.
  return destino ? createPortal(children, destino) : null;
}

/*
 * Uma coluna de celular até o `lg`; dali em diante a largura do MediaFlow
 * (`max-w-7xl`), e cada tela decide como dividir o espaço em colunas. Só
 * alargar, sem dividir, esticaria cartões feitos para 400px até 1200px.
 */
export function Layout() {
  /*
   * `useState` com ref de função, e não `useRef`: mexer num ref não redesenha
   * nada, e a página precisa ser redesenhada quando o nó existir para o portal
   * encontrá-lo. Custa um render a mais na montagem.
   */
  const [destinoDaAcao, setDestinoDaAcao] = useState<HTMLElement | null>(null);

  /*
   * As migalhas saem das rotas casadas, de cima para baixo: `/wl` e depois
   * `/wl/peso` dão "WL › Peso". Só entram as que declararam `titulo`.
   */
  const migalhas = useMatches()
    .map((m) => ({ caminho: m.pathname, ...(temTitulo(m.handle) ? m.handle : null) }))
    .filter((m): m is { caminho: string; titulo: string } => "titulo" in m);

  const atual = migalhas.at(-1);

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 lg:max-w-7xl lg:px-6 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      {/*
        Uma linha só: marca, caminho e a ação da tela. Antes eram duas — esta e
        um cabeçalho interno com "← WL" e o título —, o que gastava duas faixas
        da primeira tela do celular para dizer onde se está.

        `gap-3` e `min-w-0` para o caminho encolher antes do botão: num celular
        estreito, é melhor perder um pedaço de "Trimly" do que o "Registrar
        peso", que é o que se veio fazer.
      */}
      <header className="mb-6 flex items-center justify-between gap-3">
        <nav aria-label="Caminho" className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-tinta"
          >
            <img src="/favicon.svg" alt="" className="size-7 rounded-lg" />
            Trimly
          </Link>

          {migalhas.map((m) => {
            const ehAtual = m.caminho === atual?.caminho;
            return (
              <span key={m.caminho} className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden="true" className="shrink-0 text-tinta-3">
                  ›
                </span>
                {/*
                  A migalha do fim é texto, não link: ela aponta para a página em
                  que já se está, e um link que não leva a lugar nenhum é uma
                  parada morta no caminho do Tab.

                  `aria-current="page"` é o que diz isso a quem usa leitor de
                  tela, já que a diferença de peso da fonte não é lida.
                */}
                {ehAtual ? (
                  <span aria-current="page" className="truncate font-medium text-tinta">
                    {m.titulo}
                  </span>
                ) : (
                  <Link to={m.caminho} className="truncate text-tinta-2 hover:text-tinta">
                    {m.titulo}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>

        {/*
          O canto da ação. Fica sempre no DOM, mesmo vazio: é ele que o portal
          de `AcaoDaPagina` procura, e um nó que só existe quando há ação nunca
          estaria lá no momento em que a página o procura.
        */}
        <div ref={setDestinoDaAcao} className="shrink-0" />
      </header>

      {/*
        O `h1` da página, só para leitor de tela.

        Mora aqui porque o título já está no `handle` da rota — pedi-lo também a
        cada página seria dizer a mesma coisa duas vezes, com o risco de as duas
        discordarem. A migalha do fim não serve de `h1`: ela é um item de
        navegação, e o cabeçalho da página é outra coisa.
      */}
      {atual && <h1 className="sr-only">{atual.titulo}</h1>}

      <main className="flex-1">
        <ContextoDaAcao value={destinoDaAcao}>
          <Outlet />
        </ContextoDaAcao>
      </main>
    </div>
  );
}
