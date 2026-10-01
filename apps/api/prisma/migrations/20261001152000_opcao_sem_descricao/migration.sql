-- A descrição da opção saiu: o nome já diz o que é, e o campo extra só
-- alongava a linha do formulário sem ninguém preencher.
--
-- Escrita à mão porque `migrate dev` pede confirmação interativa em mudança
-- destrutiva, e o shell daqui não tem como responder. Confirmado antes de
-- aplicar que nenhuma opção tinha descrição preenchida.
ALTER TABLE "wl_acao_opcao" DROP COLUMN "descricao";
