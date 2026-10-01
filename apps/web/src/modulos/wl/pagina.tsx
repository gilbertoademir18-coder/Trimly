import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Modal } from "../../modal.tsx";
import { PainelAcoes } from "./acoes.tsx";
import { wlApi } from "./api.ts";
import { Aviso } from "./aviso.tsx";
import { Calendario } from "./calendario.tsx";
import { diaLocal, type Acao } from "./calculos.ts";
import { CartaoDoDia } from "./dia.tsx";
import { BlocoJejum, PainelJejum } from "./jejum.tsx";

/** Qual janela está aberta, se alguma. */
type Janela = "acoes" | "jejum" | null;

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
      setAcoes(await wlApi.acoes());
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
  if (!acoes) return <p className="text-tinta-3">Carregando…</p>;

  const hoje = diaLocal();

  return (
    <div className="space-y-5">
      {/*
        Sem título à vista: a navegação do topo já marca em que módulo você
        está, e repetir "WL" logo abaixo só gastava a primeira tela do celular.
        O h1 fica para leitor de tela, que não enxerga o destaque do menu e
        precisa de um cabeçalho para saber onde entrou.
      */}
      <h1 className="sr-only">WL</h1>
      {erro && <Aviso texto={erro} />}

      <BlocoJejum
        versao={versaoJejum}
        aoMudar={() => setVersaoJejum((v) => v + 1)}
        aoAbrirHistorico={() => setJanela("jejum")}
      />

      <CartaoDoDia
        dia={diaAberto}
        acoes={acoes}
        versaoCadastro={versaoCadastro}
        aoMudar={() => setVersao((v) => v + 1)}
        aoAbrirAcoes={() => setJanela("acoes")}
      />

      <Calendario hoje={hoje} selecionado={diaAberto} versao={versao} aoSelecionar={setDiaAberto} />

      <nav className="grid gap-3 sm:grid-cols-2">
        <Atalho rota="/wl/peso" nome="Peso" descricao="Pesagens, meta, IMC e o gráfico." />
        <Atalho
          aoTocar={() => setJanela("acoes")}
          nome="Ações"
          descricao="O que soma, o que desconta, e as que têm opções."
        />
      </nav>

      <Modal aberto={janela === "acoes"} titulo="Ações" aoFechar={() => setJanela(null)}>
        <PainelAcoes aoMudar={() => void aoMudarCadastro()} />
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
