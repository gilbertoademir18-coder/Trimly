-- AlterTable
ALTER TABLE "wl_dia" ADD COLUMN     "grupo_id" INTEGER;

-- CreateTable
CREATE TABLE "wl_grupo" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "dias_da_semana" INTEGER[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wl_grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wl_acao_grupo" (
    "acao_id" INTEGER NOT NULL,
    "grupo_id" INTEGER NOT NULL,

    CONSTRAINT "wl_acao_grupo_pkey" PRIMARY KEY ("acao_id","grupo_id")
);

-- CreateIndex
CREATE INDEX "wl_acao_grupo_grupo_id_idx" ON "wl_acao_grupo"("grupo_id");

-- AddForeignKey
ALTER TABLE "wl_acao_grupo" ADD CONSTRAINT "wl_acao_grupo_acao_id_fkey" FOREIGN KEY ("acao_id") REFERENCES "wl_acao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wl_acao_grupo" ADD CONSTRAINT "wl_acao_grupo_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "wl_grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wl_dia" ADD CONSTRAINT "wl_dia_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "wl_grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restrições escritas à mão: o schema do Prisma não expressa CHECK.

-- 0 = domingo … 6 = sábado. Fora disso é engano de quem escreveu o cliente.
ALTER TABLE "wl_grupo" ADD CONSTRAINT "wl_grupo_dias_validos"
    CHECK ("dias_da_semana" <@ ARRAY[0,1,2,3,4,5,6]);

-- ---------------------------------------------------------------------------
-- O grupo que impede a tela de ficar vazia
-- ---------------------------------------------------------------------------
--
-- A partir daqui, ação fora de grupo não aparece em dia nenhum. Sem este passo
-- o app abriria sem nada na tela do dia até alguém montar os grupos à mão.
--
-- O "Padrão" cobre os sete dias e recebe todas as ações que já existiam. É
-- ponto de partida para dividir, não destino: a ideia é criar "Fim de semana",
-- "Casa da namorada" e ir tirando o que não se aplica.
--
-- Só nasce se houver ação cadastrada: num banco vazio esta migração não
-- inventa nada.

INSERT INTO "wl_grupo" ("nome", "dias_da_semana", "ativo", "ordem", "editado_em")
SELECT 'Padrão', ARRAY[0,1,2,3,4,5,6], true, 0, now()
WHERE EXISTS (SELECT 1 FROM "wl_acao");

INSERT INTO "wl_acao_grupo" ("acao_id", "grupo_id")
SELECT a."id", g."id"
FROM "wl_acao" a
CROSS JOIN LATERAL (
    SELECT "id" FROM "wl_grupo" WHERE "nome" = 'Padrão' ORDER BY "id" DESC LIMIT 1
) g;

-- Os dias já registrados ficam com grupo nulo de propósito: eles guardam o
-- denominador que tinham, e o passado não se mexe sozinho.
