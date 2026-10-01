-- CreateTable
CREATE TABLE "wl_acao" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "pontos" DECIMAL(5,2) NOT NULL,
    "repetivel" BOOLEAN NOT NULL DEFAULT false,
    "alvo_diario" INTEGER NOT NULL DEFAULT 1,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wl_acao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wl_registro" (
    "data" DATE NOT NULL,
    "acao_id" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "pontos_na_epoca" DECIMAL(5,2) NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wl_registro_pkey" PRIMARY KEY ("data","acao_id")
);

-- CreateTable
CREATE TABLE "wl_dia" (
    "data" DATE NOT NULL,
    "pontos_possiveis" DECIMAL(6,2) NOT NULL,
    "editado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wl_dia_pkey" PRIMARY KEY ("data")
);

-- AddForeignKey
ALTER TABLE "wl_registro" ADD CONSTRAINT "wl_registro_acao_id_fkey" FOREIGN KEY ("acao_id") REFERENCES "wl_acao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restrições escritas à mão: o schema do Prisma não expressa CHECK. Mesma
-- decisão do `wl_meta_linha_unica`, na migração inicial.

-- Ação que vale zero não muda nota nenhuma: é só ruído no cadastro e na tela.
ALTER TABLE "wl_acao" ADD CONSTRAINT "wl_acao_pontos_nao_zero" CHECK ("pontos" <> 0);

-- O alvo é "quantas vezes num dia completo": pelo menos uma. E só ação
-- repetível pode ter alvo maior que 1 — "treinar 3 vezes hoje" seria um alvo
-- que a tela do dia nem sabe oferecer.
ALTER TABLE "wl_acao" ADD CONSTRAINT "wl_acao_alvo_minimo" CHECK ("alvo_diario" >= 1);
ALTER TABLE "wl_acao" ADD CONSTRAINT "wl_acao_alvo_so_se_repetivel"
    CHECK ("repetivel" OR "alvo_diario" = 1);

-- Registro existe para dizer que a ação aconteceu. "Aconteceu zero vezes" se
-- diz apagando a linha, e é o que a API faz quando a quantidade chega a zero.
ALTER TABLE "wl_registro" ADD CONSTRAINT "wl_registro_quantidade_positiva" CHECK ("quantidade" >= 1);

-- O denominador do dia soma só ações positivas: nunca é negativo.
ALTER TABLE "wl_dia" ADD CONSTRAINT "wl_dia_possiveis_nao_negativo" CHECK ("pontos_possiveis" >= 0);
