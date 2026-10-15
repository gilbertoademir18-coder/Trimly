-- O conceito de projeto.
--
-- Escrita à mão. O `migrate dev` resolveria a troca de `wl_meta` por
-- `wl_perfil` com DROP + CREATE, jogando fora a altura e o peso alvo que estão
-- lá dentro. Aqui a tabela é renomeada e o alvo é mudado de casa antes de a
-- coluna sair.

-- CreateTable
CREATE TABLE "wl_projeto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "peso_alvo" DECIMAL(5,2) NOT NULL,
    "nota" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wl_projeto_pkey" PRIMARY KEY ("id")
);

-- AlterTable: o vínculo da pesagem, nulo por enquanto e para sempre permitido.
ALTER TABLE "wl_pesagem" ADD COLUMN     "projeto_id" INTEGER;

-- CreateIndex
CREATE INDEX "wl_pesagem_projeto_id_idx" ON "wl_pesagem"("projeto_id");

-- AddForeignKey
ALTER TABLE "wl_pesagem" ADD CONSTRAINT "wl_pesagem_projeto_id_fkey"
    FOREIGN KEY ("projeto_id") REFERENCES "wl_projeto"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- wl_meta vira wl_perfil. RENAME e não DROP + CREATE: a altura está lá.
ALTER TABLE "wl_meta" RENAME TO "wl_perfil";
ALTER TABLE "wl_perfil" RENAME CONSTRAINT "wl_meta_pkey" TO "wl_perfil_pkey";

-- O primeiro projeto nasce da meta que existia: 75 kg, que até agora era "a"
-- meta do app e passa a ser a meta DESTE projeto. Sem este passo o valor iria
-- embora junto com a coluna, no DROP mais abaixo.
INSERT INTO "wl_projeto" ("nome", "peso_alvo", "editado_em")
SELECT 'Projeto atual', "peso_alvo", CURRENT_TIMESTAMP FROM "wl_perfil" WHERE "id" = 1;

-- As pesagens de 2026 são as que foram cadastradas no Trimly (03/10 e 15/10), e
-- é a elas que esse projeto pertence. O corte em 2026-01-01 é seguro: o
-- histórico importado termina em 26/05/2025, 495 dias antes — não há nada entre
-- as duas datas para a comparação pegar por engano.
--
-- As 102 importadas ficam com projeto_id NULL de propósito: separá-las em
-- projetos é trabalho de gente olhando as lacunas, não de uma migração
-- adivinhando.
UPDATE "wl_pesagem"
   SET "projeto_id" = (SELECT "id" FROM "wl_projeto" ORDER BY "id" LIMIT 1)
 WHERE "dia" >= DATE '2026-01-01';

-- Só agora, com o valor já copiado para o projeto.
ALTER TABLE "wl_perfil" DROP COLUMN "peso_alvo";
