import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

// O .env mora na raiz do monorepo. Carregado antes de importar as rotas, que
// trazem o Prisma — e ele lê DATABASE_URL ao criar o cliente.
const RAIZ = path.resolve(import.meta.dirname, "../../..");
try {
  process.loadEnvFile(path.join(RAIZ, ".env"));
} catch {
  // Sem .env: o erro útil ("DATABASE_URL não está definida") vem do Prisma.
}

const { rotasWl } = await import("./wl/rotas.ts");
const { rotasJejum } = await import("./wl/jejum.ts");

// 3200 é a do app de verdade (a que o ícone da bandeja sobe). O `npm run dev`
// usa a 3201, para dar para mexer no código com o app do dia a dia no ar.
const MODO_DEV = process.argv.includes("--dev");
const PORTA = Number(process.env.PORT ?? (MODO_DEV ? 3201 : 3200));
const WEB_DIST = path.join(RAIZ, "apps/web/dist");

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

// Todo erro sai no mesmo formato `{ erro }` que as validações usam — é o campo
// que o front mostra na tela. O detalhe técnico fica no log, não no celular.
app.setErrorHandler((erro: Error & { statusCode?: number; code?: string }, req, reply) => {
  const status = erro.statusCode ?? 500;
  if (status < 500) return reply.code(status).send({ erro: erro.message });

  req.log.error(erro);
  // Pelo código, e não pela mensagem: o texto vem do Postgres no idioma da
  // instalação ("autenticação do tipo senha falhou..."). P10xx são os erros
  // de conexão do Prisma; ECONNREFUSED é o Postgres parado.
  const semBanco =
    erro.code?.startsWith("P10") || /ECONNREFUSED|DatabaseNotReachable/.test(JSON.stringify(erro.cause ?? ""));
  return reply.code(500).send({
    erro: semBanco
      ? "Sem conexão com o banco de dados. O PostgreSQL está rodando?"
      : "Erro no servidor. Veja o log pelo ícone da bandeja.",
  });
});

// O ícone da bandeja pergunta aqui se quem ouve na porta é mesmo o Trimly.
app.get("/api/saude", async () => ({ app: "Trimly", ok: true }));

await app.register(rotasWl, { prefix: "/api/wl" });
await app.register(rotasJejum, { prefix: "/api/wl/jejum" });

/*
 * O front pronto (`npm run build`) é servido por este mesmo processo: uma
 * porta só para o Tailscale publicar, e o PWA vem da mesma origem da API —
 * sem CORS, sem segundo servidor para o ícone vigiar.
 *
 * Em desenvolvimento (`npm run dev`) quem serve o front é o Vite, com recarga
 * instantânea, e ele repassa `/api` para cá.
 */
if (!MODO_DEV && existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });

  app.setNotFoundHandler((req, reply) => {
    // Rota da API que não existe é 404 de verdade, em JSON. Todo o resto é
    // rota do React: devolve o index.html e o roteador do navegador resolve.
    if (req.url.startsWith("/api/")) {
      return reply.code(404).send({ erro: "Rota não encontrada." });
    }
    // Arquivo que não existe (`.js`, `.css`, `.png`...) também é 404. Com o
    // index.html no lugar, um service worker que se atualiza entre um build e
    // o reinício guardaria esse HTML como o JS do app — e a tela ficaria
    // branca até alguém limpar o cache na mão. Com 404 a instalação falha e
    // fica valendo a versão anterior, que funciona.
    if (/^[^?]*\.[a-z0-9]+(\?|$)/i.test(req.url)) {
      return reply.code(404).send();
    }
    return reply.header("Cache-Control", "no-cache").sendFile("index.html");
  });
} else if (!MODO_DEV) {
  app.log.warn(`Front não encontrado em ${WEB_DIST} — rode "npm run build". Servindo só a API.`);
}

// 0.0.0.0 e não localhost: o `tailscale serve` chega por 127.0.0.1, mas assim
// também dá para abrir direto pelo IP do tailnet se o serve estiver fora.
await app.listen({ port: PORTA, host: "0.0.0.0" });
