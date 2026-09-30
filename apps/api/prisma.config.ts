import path from "node:path";
import { defineConfig } from "prisma/config";

// O .env mora na raiz do monorepo, e não aqui: é um arquivo só para a API,
// os scripts e o ícone da bandeja. O `?? ""` é para `prisma generate`, que não
// precisa de banco e roda no `npm install` antes de existir .env.
try {
  process.loadEnvFile(path.join(import.meta.dirname, "../../.env"));
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] ?? "" },
});
