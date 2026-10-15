-- Ação que vale zero passa a ser permitida: é o item de checklist.
--
-- Ela aparece no dia e se marca como qualquer outra, mas não entra na nota —
-- o denominador já desprezava pontos que não fossem positivos, e o registro
-- dela soma zero. As opções continuam sem zero: uma alternativa que não muda
-- nada não tem por que ser escolhida.
--
-- Só afrouxa a restrição: nenhum valor existente é tocado.

ALTER TABLE "wl_acao" DROP CONSTRAINT "wl_acao_pontos_nao_zero";
