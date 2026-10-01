-- AlterTable
ALTER TABLE "wl_dia" ADD COLUMN     "refeicao_id" INTEGER,
ADD COLUMN     "refeicao_pontos_na_epoca" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "wl_refeicao" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "pontos" DECIMAL(5,2) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wl_refeicao_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "wl_dia" ADD CONSTRAINT "wl_dia_refeicao_id_fkey" FOREIGN KEY ("refeicao_id") REFERENCES "wl_refeicao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restrições escritas à mão: o schema do Prisma não expressa CHECK. Mesma
-- decisão das migrações anteriores.

-- O "dia perfeito" conta a melhor refeição cadastrada. Uma refeição que
-- descontasse quebraria esse máximo, e zero não mudaria nota nenhuma.
ALTER TABLE "wl_refeicao" ADD CONSTRAINT "wl_refeicao_pontos_positivos" CHECK ("pontos" > 0);

-- A refeição do dia e o que ela valia na época andam juntas: ou as duas
-- colunas estão preenchidas, ou nenhuma. Meio preenchido seria um dia com
-- pontos de refeição sem refeição, ou o contrário.
ALTER TABLE "wl_dia" ADD CONSTRAINT "wl_dia_refeicao_completa"
    CHECK (("refeicao_id" IS NULL) = ("refeicao_pontos_na_epoca" IS NULL));
