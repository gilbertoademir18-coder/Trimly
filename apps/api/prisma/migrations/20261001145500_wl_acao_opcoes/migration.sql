-- As refeições viram um caso particular de "ação com opções", e o cardápio
-- deixa de ser um cadastro à parte: qualquer ação pode ter alternativas
-- ("qual refeição?", "qual treino?"), e escolhe-se uma por dia.
--
-- Escrita à mão porque o Prisma geraria os DROPs sem a conversão no meio — e
-- é a conversão que salva o que já estava cadastrado.

-- ---------------------------------------------------------------------------
-- 1. A estrutura nova
-- ---------------------------------------------------------------------------

CREATE TABLE "wl_acao_opcao" (
    "id" SERIAL NOT NULL,
    "acao_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "pontos" DECIMAL(5,2) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wl_acao_opcao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wl_acao_opcao_acao_id_idx" ON "wl_acao_opcao"("acao_id");

ALTER TABLE "wl_acao_opcao" ADD CONSTRAINT "wl_acao_opcao_acao_id_fkey"
    FOREIGN KEY ("acao_id") REFERENCES "wl_acao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Opção que vale zero não muda nota nenhuma, igual às ações. Negativa é
-- permitida: um seletor de deslizes ("qual besteira?") é legítimo, e o
-- denominador despreza o máximo quando ele não é positivo.
ALTER TABLE "wl_acao_opcao" ADD CONSTRAINT "wl_acao_opcao_pontos_nao_zero" CHECK ("pontos" <> 0);

-- Numa ação com opções os pontos moram nelas, e o da ação fica nulo.
ALTER TABLE "wl_acao" ALTER COLUMN "pontos" DROP NOT NULL;
ALTER TABLE "wl_acao" DROP CONSTRAINT "wl_acao_pontos_nao_zero";
ALTER TABLE "wl_acao" ADD CONSTRAINT "wl_acao_pontos_nao_zero"
    CHECK ("pontos" IS NULL OR "pontos" <> 0);

ALTER TABLE "wl_registro" ADD COLUMN "opcao_id" INTEGER;
ALTER TABLE "wl_registro" ADD CONSTRAINT "wl_registro_opcao_id_fkey"
    FOREIGN KEY ("opcao_id") REFERENCES "wl_acao_opcao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. O cardápio existente vira uma ação com opções
-- ---------------------------------------------------------------------------

-- De qual refeição cada opção veio. Some no fim desta migração; existe só para
-- as escolhas já feitas acharem a opção certa, sem depender de nome igual.
ALTER TABLE "wl_acao_opcao" ADD COLUMN "_de_refeicao" INTEGER;

-- A ação só nasce se houver refeição cadastrada: num banco vazio esta migração
-- não inventa nada.
INSERT INTO "wl_acao" ("nome", "pontos", "repetivel", "alvo_diario", "ativa", "ordem", "editado_em")
SELECT 'Refeição', NULL, false, 1, true, 0, now()
WHERE EXISTS (SELECT 1 FROM "wl_refeicao");

INSERT INTO "wl_acao_opcao"
    ("acao_id", "nome", "descricao", "pontos", "ativa", "ordem", "criado_em", "editado_em", "_de_refeicao")
SELECT a."id", r."nome", r."descricao", r."pontos", r."ativa", r."ordem", r."criado_em", now(), r."id"
FROM "wl_refeicao" r
CROSS JOIN LATERAL (
    SELECT "id" FROM "wl_acao" WHERE "nome" = 'Refeição' AND "pontos" IS NULL ORDER BY "id" DESC LIMIT 1
) a;

-- A refeição escolhida em cada dia vira um registro da ação nova, com os
-- mesmos pontos congelados: a nota daqueles dias não se mexe.
INSERT INTO "wl_registro"
    ("data", "acao_id", "quantidade", "opcao_id", "pontos_na_epoca", "criado_em", "editado_em")
SELECT d."data", o."acao_id", 1, o."id", d."refeicao_pontos_na_epoca", now(), now()
FROM "wl_dia" d
JOIN "wl_acao_opcao" o ON o."_de_refeicao" = d."refeicao_id"
WHERE d."refeicao_id" IS NOT NULL;

ALTER TABLE "wl_acao_opcao" DROP COLUMN "_de_refeicao";

-- ---------------------------------------------------------------------------
-- 3. O que era refeição sai de cena
-- ---------------------------------------------------------------------------

-- O CHECK wl_dia_refeicao_completa cai junto com as colunas que ele cita.
ALTER TABLE "wl_dia" DROP COLUMN "refeicao_id";
ALTER TABLE "wl_dia" DROP COLUMN "refeicao_pontos_na_epoca";

DROP TABLE "wl_refeicao";
