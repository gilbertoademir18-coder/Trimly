import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "./app.css";
import { Layout } from "./layout.tsx";
import { PaginaWl } from "./modulos/wl/pagina.tsx";
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
    ],
  },
]);

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <RouterProvider router={roteador} />
  </StrictMode>,
);
