import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import "./app.css";
import { Layout } from "./layout.tsx";
import { PaginaAcoes } from "./modulos/wl/acoes.tsx";
import { PaginaWl } from "./modulos/wl/pagina.tsx";
import { PaginaPeso } from "./modulos/wl/peso.tsx";

// Cada módulo do Trimly é uma rota de primeiro nível. Módulo novo = uma linha
// aqui e um cartão na tela inicial (`paginas/inicio.tsx`, hoje fora do ar).
const roteador = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      // Enquanto o WL for o único módulo, a tela inicial seria só um cartão
      // apontando para ele. Quando chegar o segundo módulo, volta a ser
      // `<Inicio />` (`paginas/inicio.tsx`) e o item "Início" volta ao menu.
      { index: true, element: <Navigate to="/wl" replace /> },
      { path: "wl", element: <PaginaWl /> },
      // Peso e ações são telas à parte: as duas têm formulário, listas e
      // histórico, e não cabiam numa janela sem virar rolagem dentro de
      // rolagem. O cadastro de ações já foi modal daqui — voltou a ser tela
      // quando cresceu (formulário, editor de opções e quatro listas).
      { path: "wl/peso", element: <PaginaPeso /> },
      { path: "wl/acoes", element: <PaginaAcoes /> },
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
