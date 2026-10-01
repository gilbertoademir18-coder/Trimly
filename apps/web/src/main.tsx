import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import "./app.css";
import { Layout } from "./layout.tsx";
import { PaginaWl } from "./modulos/wl/pagina.tsx";
import { PaginaPeso } from "./modulos/wl/peso.tsx";
import { Inicio } from "./paginas/inicio.tsx";

// Cada módulo do Trimly é uma rota de primeiro nível. Módulo novo = uma linha
// aqui e um cartão na tela inicial (`paginas/inicio.tsx`).
const roteador = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Inicio /> },
      { path: "wl", element: <PaginaWl /> },
      // O peso é uma tela à parte; o cadastro de ações é uma modal dentro
      // de /wl, porque mexer nele é uma pausa e não um destino.
      { path: "wl/peso", element: <PaginaPeso /> },
      // /wl/acoes existiu por um tempo e virou modal. Quem tiver o endereço
      // guardado cai em /wl em vez de numa tela de rota não encontrada.
      { path: "wl/acoes", element: <Navigate to="/wl" replace /> },
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
