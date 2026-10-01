import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Versão nova do app é aplicada sozinha na próxima abertura: num app de
      // uma pessoa só, perguntar "atualizar?" é só um toque a mais.
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Trimly",
        short_name: "Trimly",
        description: "Acompanhamento de desenvolvimento pessoal.",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f7f8f6",
        theme_color: "#0f766e",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // O Android recorta este em círculo; por isso ele tem margem extra.
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // O atalho aponta para a tela onde a ação acontece. "Registrar peso"
        // levava a /wl, que depois virou a tela de pontuação — e o atalho
        // passaria a abrir a tela errada em silêncio.
        shortcuts: [
          { name: "Pontuação de hoje", short_name: "Hoje", url: "/wl" },
          { name: "Registrar peso", short_name: "Pesar", url: "/wl/peso" },
        ],
      },
      workbox: {
        // O service worker guarda a casca do app (HTML, JS, CSS, ícones) para
        // abrir na hora. Os dados, não: `/api` sempre vai à rede, porque um
        // peso servido do cache seria um peso velho mostrado como atual.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 3210,
    strictPort: true,
    // Em desenvolvimento a API roda na 3201 (ver apps/api/src/server.ts).
    proxy: { "/api": "http://127.0.0.1:3201" },
  },
});
