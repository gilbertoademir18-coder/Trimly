import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import "./app.css";
import { Layout } from "./layout.tsx";
import { PaginaAcoes } from "./modulos/wl/acoes.tsx";
import { PaginaWl } from "./modulos/wl/pagina.tsx";
import { PaginaPeso } from "./modulos/wl/peso.tsx";

/*
 * Cada módulo do Trimly é uma rota de primeiro nível. Módulo novo = um ramo
 * aqui e um cartão na tela inicial (`paginas/inicio.tsx`, hoje fora do ar).
 *
 * O `handle.titulo` de cada rota é o que vira migalha no cabeçalho e `h1` da
 * página (veja `layout.tsx`). Está aqui e não na página porque quem sabe a
 * hierarquia é o roteador: a tela de peso não tem como saber que está pendurada
 * sob o WL.
 */
const roteador = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      // Enquanto o WL for o único módulo, a tela inicial seria só um cartão
      // apontando para ele. Quando chegar o segundo módulo, volta a ser
      // `<Inicio />` (`paginas/inicio.tsx`) e ganha o seu `handle`.
      { index: true, element: <Navigate to="/wl" replace /> },
      {
        /*
         * Ramo sem `element`: ele não desenha nada, só agrupa. Serve para o
         * caminho da URL e a árvore de rotas dizerem a mesma coisa — sem isso,
         * `/wl/peso` seria irmã de `/wl` e não filha, e o cabeçalho não teria
         * como montar "WL › Peso".
         */
        path: "wl",
        handle: { titulo: "WL" },
        children: [
          { index: true, element: <PaginaWl /> },
          // Peso e ações são telas à parte: as duas têm formulário, listas e
          // histórico, e não cabiam numa janela sem virar rolagem dentro de
          // rolagem. O cadastro de ações já foi modal daqui — voltou a ser tela
          // quando cresceu (formulário, editor de opções e quatro listas).
          { path: "peso", element: <PaginaPeso />, handle: { titulo: "Peso" } },
          { path: "acoes", element: <PaginaAcoes />, handle: { titulo: "Ações" } },
        ],
      },
      // /jejum chegou a existir como módulo próprio e virou um bloco do WL.
      { path: "jejum", element: <Navigate to="/wl" replace /> },
    ],
  },
]);

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <RouterProvider router={roteador} />
  </StrictMode>,
);
