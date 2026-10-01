-- O jejum virou parte do WL, e não um módulo próprio: a tabela passa a seguir
-- o prefixo do módulo, como `wl_pesagem` e `wl_acao`.
--
-- RENAME escrito à mão: o Prisma não sabe distinguir "renomeou" de "apagou uma
-- e criou outra", e geraria DROP + CREATE. Com a tabela vazia daria no mesmo
-- hoje, mas a migração ficaria registrada como destrutiva para sempre.

ALTER TABLE "jejum_intervalo" RENAME TO "wl_jejum";
ALTER SEQUENCE "jejum_intervalo_id_seq" RENAME TO "wl_jejum_id_seq";

ALTER INDEX "jejum_intervalo_pkey" RENAME TO "wl_jejum_pkey";
ALTER INDEX "jejum_intervalo_dia_idx" RENAME TO "wl_jejum_dia_idx";
ALTER INDEX "jejum_intervalo_um_aberto" RENAME TO "wl_jejum_um_aberto";

ALTER TABLE "wl_jejum" RENAME CONSTRAINT "jejum_intervalo_fim_depois_do_inicio"
    TO "wl_jejum_fim_depois_do_inicio";
ALTER TABLE "wl_jejum" RENAME CONSTRAINT "jejum_intervalo_meta_positiva"
    TO "wl_jejum_meta_positiva";
