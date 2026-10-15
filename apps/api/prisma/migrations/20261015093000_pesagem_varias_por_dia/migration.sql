-- Várias pesagens por dia.
--
-- Escrita à mão, e não gerada pelo `migrate dev`: o SQL automático trata isto
-- como "some a coluna `data`, aparecem `dia` e `medido_em`" e resolve com
-- DROP + ADD, o que apagaria as pesagens que já existem. Aqui as colunas são
-- renomeadas e preenchidas, e nenhuma linha é tocada além disso.

-- A chave deixa de ser o dia. SERIAL já numera as linhas existentes.
ALTER TABLE "wl_pesagem" ADD COLUMN     "id" SERIAL;

-- Entra nula para poder ser preenchida antes de virar obrigatória.
ALTER TABLE "wl_pesagem" ADD COLUMN     "medido_em" TIMESTAMPTZ;

-- A hora real de cada pesagem está no `criado_em` — é quando ela foi lançada.
-- Sem este passo todas virariam meia-noite, e a hora verdadeira se perderia
-- justamente agora que ela passou a ordenar as várias de um mesmo dia.
UPDATE "wl_pesagem" SET "medido_em" = "criado_em" WHERE "medido_em" IS NULL;

ALTER TABLE "wl_pesagem" ALTER COLUMN "medido_em" SET NOT NULL;

-- `data` só muda de nome: o conteúdo é o dia do calendário, que segue valendo.
ALTER TABLE "wl_pesagem" RENAME COLUMN "data" TO "dia";

ALTER TABLE "wl_pesagem" DROP CONSTRAINT "wl_pesagem_pkey";
ALTER TABLE "wl_pesagem" ADD CONSTRAINT "wl_pesagem_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "wl_pesagem_medido_em_idx" ON "wl_pesagem"("medido_em");

-- CreateIndex
CREATE INDEX "wl_pesagem_dia_idx" ON "wl_pesagem"("dia");
