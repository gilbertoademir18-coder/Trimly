-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "wl_pesagem" (
    "data" DATE NOT NULL,
    "peso_kg" DECIMAL(5,2) NOT NULL,
    "nota" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wl_pesagem_pkey" PRIMARY KEY ("data")
);

-- CreateTable
CREATE TABLE "wl_meta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "peso_alvo" DECIMAL(5,2) NOT NULL,
    "altura_cm" INTEGER,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wl_meta_pkey" PRIMARY KEY ("id")
);

-- Adicionado à mão: a meta é linha única (o schema do Prisma não expressa CHECK).
ALTER TABLE "wl_meta" ADD CONSTRAINT "wl_meta_linha_unica" CHECK ("id" = 1);
