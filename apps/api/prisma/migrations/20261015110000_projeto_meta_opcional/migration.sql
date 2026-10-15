-- A meta do projeto passa a ser opcional.
--
-- Projeto reconstruído do passado pode não ter tido meta registrada em lugar
-- nenhum, e inventar uma poria na base um objetivo que ninguém definiu — com a
-- barra de progresso calculada sobre ele.
--
-- Só afrouxa a restrição: nenhum valor existente é tocado.

-- AlterTable
ALTER TABLE "wl_projeto" ALTER COLUMN "peso_alvo" DROP NOT NULL;
