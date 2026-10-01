import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Modal } from "../../modal.tsx";
import { PainelAcoes } from "./acoes.tsx";
import { wlApi } from "./api.ts";
import { Aviso } from "./aviso.tsx";
import { Calendario } from "./calendario.tsx";
import { diaLocal, type Acao, type Grupo } from "./calculos.ts";
import { CartaoDoDia } from "./dia.tsx";
import { PainelGrupos } from "./grupos.tsx";
import { BlocoJejum, PainelJejum } from "./jejum.tsx";

/** Qual janela está aberta, se alguma. */
type Janela = "acoes" | "grupos" | "jejum" | null;

/**
 * A tela do dia a dia do WL: a nota de hoje, o que a forma e o mês inteiro
 * logo abaixo.
 *
 * O jejum abre a tela: enquanto um corre, o cronômetro é a informação viva.
 *
 * O peso tem tela própria — é outro ritmo, pesa-se uma vez de manhã. Os
 * O cadastro de ações e o histórico de jejuns são modais daqui mesmo:
 * mexer neles é uma pausa no meio de marcar o dia, e sair da página perderia a
 * rolagem do calendário.
 *
 * A lista de ações mora aqui porque o cartão do dia precisa dela — e uma ação
 * pode ter opções, que é o que antes era um cadastro de refeições à parte.
 */
export function PaginaWl() {
  const [acoes, setAcoes] = useState<Acao[] | null>(null);
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // O dia aberto no cartão de pontuação. Trocar de dia no calendário só muda
  // este estado: o cartão busca o dia escolhido sozinho.
  const [diaAberto, setDiaAberto] = useState(() => diaLocal());
  const [janela, setJanela] = useState<Janela>(null);
  // Sobe a cada mudança (toque no dia, ou edição num cadastro), para o
  // calendário se redesenhar.
  const [versao, setVersao] = useState(0);
  // Sobe só quando o cadastro muda: é o que faz o cartão do dia rebuscar.
  const [versaoCadastro, setVersaoCadastro] = useState(0);
  // O mesmo para o jejum: mexer no histórico pode apagar o que estava correndo.
  const [versaoJejum, setVersaoJejum] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const [a, g] = await Promise.all([wlApi.acoes(), wlApi.grupos()]);
      setAcoes(a);
      setGrupos(g);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /*
   * O cadastro mudou: a tela de trás precisa acompanhar antes mesmo de a
   * janela fechar.
   *
   * O dia de hoje é reprecificado no servidor, porque ele ainda está sendo
   * vivido — mudar quanto vale um hábito ao meio-dia vale para o dia inteiro.
   * Os dias passados ficam como estão: eles só são reavaliados se você reabrir
   * um deles e mexer.
   */
  const aoMudarCadastro = useCallback(async () => {
    try {
      await wlApi.refotografar(diaLocal());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
    await carregar();
    setVersao((v) => v + 1);
    setVersaoCadastro((v) => v + 1);
  }, [carregar]);

  if (erro && !acoes) return <Aviso texto={erro} />;
  if (!acoes || !grupos) return <p className="text-tinta-3">Carregando…</p>;

  const hoje = diaLocal();

  /*
   * No desktop, três colunas lado a lado — jejum e atalhos | o dia | o mês —,
   * para caber tudo sem rolar. No celular, a mesma pilha de sempre: a coluna
   * da esquerda é `contents` ali (os filhos viram itens da pilha) e os atalhos
   * descem para o fim com `order-last`.
   */
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-3 lg:items-start">
      {/*
        Sem título à vista: a navegação do topo já marca em que módulo você
        está, e repetir "WL" logo abaixo só gastava a primeira tela do celular.
        O h1 fica para leitor de tela, que não enxerga o destaque do menu e
        precisa de um cabeçalho para saber onde entrou.
      */}
      <h1 className="sr-only">WL</h1>
      {erro && (
        <div className="lg:col-span-3">
          <Aviso texto={erro} />
        </div>
      )}

      <div className="contents lg:flex lg:flex-col lg:gap-5">
        <BlocoJejum
          versao={versaoJejum}
          aoMudar={() => setVersaoJejum((v) => v + 1)}
          aoAbrirHistorico={() => setJanela("jejum")}
        />

        <nav className="order-last grid gap-3 sm:grid-cols-3 lg:order-none lg:grid-cols-1">
          <Atalho rota="/wl/peso" nome="Peso" descricao="Pesagens, meta, IMC e o gráfico." />
          <Atalho
            aoTocar={() => setJanela("acoes")}
            nome="Ações"
            descricao="O que soma, o que desconta, e as que têm opções."
          />
          <Atalho
            aoTocar={() => setJanela("grupos")}
            nome="Grupos"
            descricao="Os tipos de dia: trabalho, fim de semana, viagem."
          />
        </nav>
      </div>

      <CartaoDoDia
        dia={diaAberto}
        acoes={acoes}
        grupos={grupos}
        versaoCadastro={versaoCadastro}
        aoMudar={() => setVersao((v) => v + 1)}
        aoAbrirAcoes={() => setJanela("acoes")}
        aoAbrirGrupos={() => setJanela("grupos")}
      />

      <Calendario hoje={hoje} selecionado={diaAberto} versao={versao} aoSelecionar={setDiaAberto} />

      <Modal aberto={janela === "acoes"} titulo="Ações" largura="larga" aoFechar={() => setJanela(null)}>
        <PainelAcoes grupos={grupos} aoMudar={() => void aoMudarCadastro()} />
      </Modal>

      <Modal
        aberto={janela === "grupos"}
        titulo="Grupos de ações"
        largura="larga"
        aoFechar={() => setJanela(null)}
      >
        <PainelGrupos acoes={acoes} aoMudar={() => void aoMudarCadastro()} />
      </Modal>

      <Modal aberto={janela === "jejum"} titulo="Jejuns" aoFechar={() => setJanela(null)}>
        <PainelJejum aoMudar={() => setVersaoJejum((v) => v + 1)} />
      </Modal>
    </div>
  );
}

/** O mesmo cartão serve para ir a outra tela e para abrir uma janela daqui. */
function Atalho({
  rota,
  aoTocar,
  nome,
  descricao,
}: {
  rota?: string;
  aoTocar?: () => void;
  nome: string;
  descricao: string;
}) {
  const classe =
    "block rounded-2xl border border-borda bg-superficie p-4 text-left transition-colors hover:border-destaque";
  const miolo = (
    <>
      <span className="font-semibold">{nome}</span>
      <span className="mt-1 block text-sm text-tinta-2">{descricao}</span>
    </>
  );

  if (rota) {
    return (
      <Link to={rota} className={classe}>
        {miolo}
      </Link>
    );
  }
  return (
    <button type="button" onClick={aoTocar} className={classe}>
      {miolo}
    </button>
  );
}
