import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Modal } from "../../modal.tsx";
import { PainelAcoes } from "./acoes.tsx";
import { wlApi } from "./api.ts";
import { Aviso } from "./aviso.tsx";
import { Calendario } from "./calendario.tsx";
import { diaLocal, type Acao, type Refeicao } from "./calculos.ts";
import { CartaoDoDia } from "./dia.tsx";
import { PainelRefeicoes } from "./refeicoes.tsx";

/** Qual janela está aberta, se alguma. */
type Janela = "acoes" | "refeicoes" | null;

/**
 * A tela do dia a dia do WL: a nota de hoje, o que a forma e o mês inteiro
 * logo abaixo.
 *
 * O peso tem tela própria — é outro ritmo, pesa-se uma vez de manhã. Os dois
 * cadastros (ações e refeições) são modais daqui mesmo: mexer neles é uma
 * pausa no meio de marcar o dia, e sair da página perderia a rolagem do
 * calendário.
 *
 * As duas listas moram aqui porque o cartão do dia precisa das duas, e cada
 * painel precisa da outra para mostrar o dia perfeito completo.
 */
export function PaginaWl() {
  const [acoes, setAcoes] = useState<Acao[] | null>(null);
  const [refeicoes, setRefeicoes] = useState<Refeicao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // O dia aberto no cartão de pontuação. Trocar de dia no calendário só muda
  // este estado: o cartão busca o dia escolhido sozinho.
  const [diaAberto, setDiaAberto] = useState(() => diaLocal());
  const [janela, setJanela] = useState<Janela>(null);
  // Sobe a cada mudança (toque no dia, ou edição num cadastro), para o
  // calendário se redesenhar.
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([wlApi.acoes(), wlApi.refeicoes()]);
      setAcoes(a);
      setRefeicoes(r);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O cadastro mudou: a lista de trás e o total possível do dia precisam
  // acompanhar antes mesmo de a janela fechar.
  const aoMudarCadastro = useCallback(() => {
    void carregar();
    setVersao((v) => v + 1);
  }, [carregar]);

  if (erro && !acoes) return <Aviso texto={erro} />;
  if (!acoes || !refeicoes) return <p className="text-tinta-3">Carregando…</p>;

  const hoje = diaLocal();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">WL</h1>
      {erro && <Aviso texto={erro} />}

      <CartaoDoDia
        dia={diaAberto}
        acoes={acoes}
        refeicoes={refeicoes}
        aoMudar={() => setVersao((v) => v + 1)}
        aoAbrirAcoes={() => setJanela("acoes")}
        aoAbrirRefeicoes={() => setJanela("refeicoes")}
      />

      <Calendario hoje={hoje} selecionado={diaAberto} versao={versao} aoSelecionar={setDiaAberto} />

      <nav className="grid gap-3 sm:grid-cols-3">
        <Atalho rota="/wl/peso" nome="Peso" descricao="Pesagens, meta, IMC e o gráfico." />
        <Atalho
          aoTocar={() => setJanela("acoes")}
          nome="Ações"
          descricao="O que soma e o que desconta no dia."
        />
        <Atalho
          aoTocar={() => setJanela("refeicoes")}
          nome="Refeições"
          descricao="O cardápio de onde sai a refeição do dia."
        />
      </nav>

      <Modal aberto={janela === "acoes"} titulo="Ações" aoFechar={() => setJanela(null)}>
        <PainelAcoes refeicoes={refeicoes} aoMudar={aoMudarCadastro} />
      </Modal>

      <Modal aberto={janela === "refeicoes"} titulo="Refeições" aoFechar={() => setJanela(null)}>
        <PainelRefeicoes acoes={acoes} aoMudar={aoMudarCadastro} />
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
