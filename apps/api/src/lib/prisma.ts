import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

/**
 * Cliente Prisma compartilhado.
 *
 * O Prisma 7 não tem mais query engine binário: a conexão passa por um driver
 * adapter em JavaScript, que precisa ser fornecido explicitamente.
 */
function criarCliente(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não está definida. Confira o arquivo .env na raiz do projeto.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });
}

export const prisma = criarCliente();
