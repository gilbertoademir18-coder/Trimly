-- CreateTable
CREATE TABLE "jejum_intervalo" (
    "id" SERIAL NOT NULL,
    "dia" DATE NOT NULL,
    "inicio" TIMESTAMPTZ NOT NULL,
    "fim" TIMESTAMPTZ,
    "meta_min" INTEGER,
    "nota" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "jejum_intervalo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jejum_intervalo_dia_idx" ON "jejum_intervalo"("dia");

-- Restrições escritas à mão: o schema do Prisma não expressa CHECK nem índice
-- parcial. Mesma decisão das migrações anteriores.

-- Jejum que termina antes de começar é erro de digitação, não dado.
ALTER TABLE "jejum_intervalo" ADD CONSTRAINT "jejum_intervalo_fim_depois_do_inicio"
    CHECK ("fim" IS NULL OR "fim" > "inicio");

-- Meta de zero minuto (ou negativa) não é meta.
ALTER TABLE "jejum_intervalo" ADD CONSTRAINT "jejum_intervalo_meta_positiva"
    CHECK ("meta_min" IS NULL OR "meta_min" > 0);

-- No máximo um jejum em andamento. O índice é sobre uma constante, restrito às
-- linhas em aberto: duas delas colidiriam na mesma chave. É a trava no banco,
-- e não só na API — um segundo aparelho não consegue abrir outro por fora.
CREATE UNIQUE INDEX "jejum_intervalo_um_aberto" ON "jejum_intervalo" ((TRUE)) WHERE "fim" IS NULL;
