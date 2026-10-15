import { useCallback, useEffect, useRef, useState } from "react";
import { useArrastavel } from "../../arrastar.ts";
import { Modal } from "../../modal.tsx";
import { wlApi, type AcaoNova } from "./api.ts";
import { AcaoDaPagina } from "../../layout.tsx";
import { Aviso } from "./aviso.tsx";
import {
  diaLocal,
  opcoesAtivas,
  pontosPossiveis,
  reordenar,
  reordenarSubconjunto,
  temOpcoes,
  type Acao,
  type Grupo,
} from "./calculos.ts";

/**
 * O cadastro de ações do WL: a página é o catálogo, a modal é o ato de editar.
 *
 * A página veio primeiro, porque as quatro listas mais o resumo do dia perfeito
 * não caíam numa janela de 85% da altura sem virar rolagem dentro de rolagem —
 * o mesmo motivo que mandou o peso para uma tela à parte. O formulário, depois,
 * voltou para uma janela: ele é um começo-e-fim (preencher, salvar, pronto), e
 * fixo no topo da página empurrava as listas para baixo em troca de nada.
 *
 * Carrega ações e grupos por conta própria, porque é um destino: entra-se aqui
 * pelo endereço, e não só pelo atalho de `/wl`.
 */
export function PaginaAcoes() {
  const [acoes, setAcoes] = useState<Acao[] | null>(null);
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /*
   * A janela do formulário: `null` é fechada, `{ acao: null }` é uma ação nova
   * e `{ acao }` é a edição de uma existente.
   *
   * Um estado só, e não um par "aberta?" + "qual ação?": com dois, dava para
   * escrever o par impossível (fechada com ação dentro, aberta sem nada) e a
   * janela abriria vazia quando devia editar.
   */
  const [edicao, setEdicao] = useState<{ acao: Acao | null } | null>(null);

  /*
   * A lista também num `ref`, atualizada no mesmo instante que o estado.
   *
   * Reordenar e gravar acontecem no mesmo tique quando se usa as setas, e o
   * `acoes` do render ainda seria o de antes do movimento — gravaria a ordem
   * velha. O arrasto não sofria disso (o soltar vem renders depois), mas um ref
   * resolve os dois casos sem depender de quando o React decide redesenhar.
   *
   * Toda escrita na lista passa por `definirAcoes`, para os dois nunca se
   * separarem.
   */
  const acoesRef = useRef<Acao[] | null>(null);

  const definirAcoes = useCallback((lista: Acao[] | null) => {
    acoesRef.current = lista;
    setAcoes(lista);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const [a, g] = await Promise.all([wlApi.acoes(), wlApi.grupos()]);
      definirAcoes(a);
      setGrupos(g);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [definirAcoes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /*
   * O cadastro mudou: o dia de hoje é reprecificado no servidor, porque ele
   * ainda está sendo vivido — mudar quanto vale um hábito ao meio-dia vale para
   * o dia inteiro. Os dias futuros já planejados vão junto (o servidor cuida
   * disso). Os passados ficam como estão: eles só são reavaliados se você
   * reabrir um deles e mexer.
   *
   * Isto morava em `pagina.tsx`, que era quem abria a modal. Agora que o
   * cadastro é um destino, a reprecificação vem com ele: voltar para `/wl`
   * remonta a tela do dia, que busca o dia já reprecificado.
   */
  const aoMudarCadastro = useCallback(async () => {
    try {
      await wlApi.refotografar(diaLocal());
    } catch (e) {
      setErro((e as Error).message);
    }
    await carregar();
  }, [carregar]);

  /** As linhas da lista só sabem qual ação editar; a janela é assunto daqui. */
  function abrirEdicao(acao: Acao) {
    setEdicao({ acao });
  }

  /*
   * Arrastar uma ação dentro de uma seção.
   *
   * Durante o gesto só mexe na lista daqui, para a tela acompanhar o dedo sem
   * uma viagem ao servidor por pixel. Gravar fica para quando o dedo larga.
   *
   * As seções são recortes calculados de uma lista só (com opções, positivas,
   * negativas), então reordenar dentro de uma não pode mexer nas outras — quem
   * cuida disso é `reordenarSubconjunto`.
   */
  function moverNaSecao(pertence: (a: Acao) => boolean, de: number, para: number) {
    const atuais = acoesRef.current;
    if (atuais) definirAcoes(reordenarSubconjunto(atuais, pertence, de, para));
  }

  /*
   * A ordem nova, numerada do zero.
   *
   * Manda a lista inteira e não só o que mudou: as ações nascem com `ordem` 0 e
   * hoje estão quase todas empatadas, desempatando por nome. Renumerar todo
   * mundo de uma vez é o que transforma a ordem que está na tela na ordem
   * gravada — senão o primeiro arrasto brigaria com os empates.
   */
  async function gravarOrdem() {
    const atuais = acoesRef.current;
    if (!atuais) return;
    try {
      definirAcoes(await wlApi.ordenarAcoes(atuais.map((a, i) => ({ id: a.id, ordem: i }))));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
      // A tela ficou mostrando uma ordem que o banco recusou: busca de novo
      // para não seguir mentindo sobre o que está gravado.
      await carregar();
    }
  }

  async function mexer(acao: () => Promise<unknown>) {
    try {
      await acao();
      await aoMudarCadastro();
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (erro && !acoes) return <Aviso texto={erro} />;
  if (!acoes || !grupos) return <p className="text-tinta-3">Carregando…</p>;

  const ativas = acoes.filter((a) => a.ativa);
  const comOpcoes = ativas.filter(temOpcoes);
  const positivas = ativas.filter((a) => !temOpcoes(a) && (a.pontos ?? 0) > 0);
  const negativas = ativas.filter((a) => !temOpcoes(a) && (a.pontos ?? 0) < 0);
  const arquivadas = acoes.filter((a) => !a.ativa);
  const gruposAtivos = grupos.filter((g) => g.ativo);
  // Ação fora de grupo não aparece em dia nenhum — e é fácil criar uma e
  // esquecer de encaixá-la, então a tela avisa em vez de deixar sumir calada.
  const semGrupo = acoes.filter((a) => a.ativa && a.grupos.length === 0);

  return (
    <div className="space-y-5">
      {/*
        O botão é pintado no cabeçalho do app, mas mora aqui: é daqui que sai o
        `onClick` e o estado que ele mexe. Quem faz a mudança de lugar é um
        portal, em `layout.tsx`.
      */}
      <AcaoDaPagina>
        <button
          type="button"
          onClick={() => setEdicao({ acao: null })}
          className="rounded-xl bg-destaque px-4 py-2 text-sm font-medium text-sobre-destaque"
        >
          Nova ação
        </button>
      </AcaoDaPagina>
      {erro && <Aviso texto={erro} />}

      {/*
        No desktop, duas colunas: à esquerda a referência (o dia perfeito de
        cada grupo, e quem está fora de grupo), à direita as listas, que são o
        assunto da tela.

        No celular, a pilha de sempre: a coluna da esquerda é `contents` ali, e o
        resumo do dia perfeito desce para o fim com `order-last`, por ser
        consulta e não tarefa.
      */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          {semGrupo.length > 0 && (
            <p className="rounded-xl border border-atencao px-3 py-2 text-xs text-atencao">
              Fora de grupo, e por isso sem aparecer em dia nenhum:{" "}
              {semGrupo.map((a) => a.nome).join(", ")}.
            </p>
          )}

          <section className="order-last rounded-2xl border border-borda bg-superficie p-4 lg:order-none">
            <h2 className="text-sm font-medium">O dia perfeito de cada grupo</h2>
            {gruposAtivos.length === 0 ? (
              <p className="mt-1 text-xs text-tinta-3">
                Nenhum grupo ainda. Crie um no painel de grupos.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {gruposAtivos.map((g) => (
                  <li key={g.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-tinta-2">{g.nome}</span>
                    <span className="tabular font-medium">
                      {pontosPossiveis(acoes.filter((a) => a.grupos.includes(g.id)))} pts
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-tinta-3">
              Cada grupo tem o seu 100%: a soma das ações positivas dele, pelo alvo diário de cada
              uma, mais a melhor opção das que têm opções. Mexer aqui vale de hoje em diante — a nota
              de hoje é recalculada na hora, e os dias anteriores guardam o que as ações valiam na
              época.
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-5">
          {/*
            O `pertence` de cada seção é o mesmo filtro que a montou. É por ele
            que `reordenarSubconjunto` sabe quais vagas da lista completa esta
            seção ocupa — arrastar aqui não mexe nas outras.

            Não se arrasta de uma seção para outra de propósito: levar uma ação
            de "Positivas" para "Negativas" seria trocar o sinal dos pontos
            dela, que é coisa do formulário e não de um gesto.
          */}
          <Secao
            titulo="Com opções"
            vazio=""
            acoes={comOpcoes}
            aoEditar={abrirEdicao}
            aoMexer={mexer}
            aoReordenar={(de, para) => moverNaSecao((a) => a.ativa && temOpcoes(a), de, para)}
            aoLargar={() => void gravarOrdem()}
          />

          <Secao
            titulo="Positivas"
            vazio="Nenhuma ainda. São elas que formam o dia perfeito."
            acoes={positivas}
            aoEditar={abrirEdicao}
            aoMexer={mexer}
            aoReordenar={(de, para) =>
              moverNaSecao((a) => a.ativa && !temOpcoes(a) && (a.pontos ?? 0) > 0, de, para)
            }
            aoLargar={() => void gravarOrdem()}
          />

          <Secao
            titulo="Negativas"
            vazio="Nenhuma ainda. Elas descontam da nota do dia."
            acoes={negativas}
            aoEditar={abrirEdicao}
            aoMexer={mexer}
            aoReordenar={(de, para) =>
              moverNaSecao((a) => a.ativa && !temOpcoes(a) && (a.pontos ?? 0) < 0, de, para)
            }
            aoLargar={() => void gravarOrdem()}
          />

          {/*
            Arquivadas sem reordenar: elas não aparecem em dia nenhum, então a
            ordem delas não decide nada.
          */}
          {arquivadas.length > 0 && (
            <Secao
              titulo="Arquivadas"
              vazio=""
              acoes={arquivadas}
              aoEditar={abrirEdicao}
              aoMexer={mexer}
            />
          )}
        </div>
      </div>

      {/*
        O título da janela já diz se é cadastro ou edição — por isso o
        formulário não repete um cabeçalho dentro.

        A largura `normal` (32rem) e não `larga`: o formulário é de uma coluna
        só, e a 48rem os campos ficariam com meio palmo de largura cada.

        O conteúdo é desmontado ao fechar (quem cuida disso é a `Modal`), então
        toda abertura começa limpa — é o que dispensa zerar campo a campo depois
        de salvar.
      */}
      <Modal
        aberto={edicao !== null}
        titulo={edicao?.acao ? "Editar ação" : "Nova ação"}
        aoFechar={() => setEdicao(null)}
      >
        <FormAcao
          acao={edicao?.acao ?? null}
          grupos={gruposAtivos}
          aoSalvar={async () => {
            setEdicao(null);
            await aoMudarCadastro();
          }}
          aoCancelar={() => setEdicao(null)}
        />
      </Modal>
    </div>
  );
}

/**
 * Uma das listas de ações.
 *
 * `Secao` e não `Grupo`: grupo neste módulo é o tipo de dia (trabalho, fim de
 * semana, viagem), e ter as duas coisas com o mesmo nome num arquivo que lida
 * com as duas era pedir confusão.
 */
function Secao({
  titulo,
  vazio,
  acoes,
  aoEditar,
  aoMexer,
  aoReordenar,
  aoLargar,
}: {
  titulo: string;
  vazio: string;
  acoes: Acao[];
  aoEditar: (a: Acao) => void;
  aoMexer: (f: () => Promise<unknown>) => Promise<void>;
  /*
   * Ausente, a seção não oferece reordenar — é o caso das arquivadas, onde a
   * ordem não decide nada: elas não aparecem em dia nenhum.
   */
  aoReordenar?: (de: number, para: number) => void;
  aoLargar?: () => void;
}) {
  const { arrastando, refDaLinha, alca } = useArrastavel({
    aoMover: (de, para) => aoReordenar?.(de, para),
    // Uma gravação por gesto, e não uma por posição pela qual a linha passou.
    aoLargar: () => aoLargar?.(),
  });

  // Seção sem itens e sem texto de vazio não aparece: é o caso de "Com opções"
  // e "Arquivadas", que só existem quando têm o que mostrar.
  if (acoes.length === 0 && vazio === "") return null;

  // Uma lista de um item só não tem ordem para mudar.
  const ordenavel = aoReordenar !== undefined && acoes.length > 1;

  return (
    <section className="rounded-2xl border border-borda bg-superficie">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="font-medium">{titulo}</h2>
        {ordenavel && <span className="text-xs text-tinta-3">Arraste pela alça</span>}
      </div>
      {acoes.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-tinta-3">{vazio}</p>
      ) : (
        <ul className="divide-y divide-borda">
          {acoes.map((a, i) => (
            <li
              key={a.id}
              ref={ordenavel ? refDaLinha(i) : undefined}
              className={arrastando === i ? "bg-destaque-suave" : undefined}
            >
              <Linha
                acao={a}
                aoEditar={aoEditar}
                aoMexer={aoMexer}
                alca={ordenavel ? alca(i) : undefined}
                aoSubir={ordenavel && i > 0 ? () => mexerEGravar(i, i - 1) : undefined}
                aoDescer={
                  ordenavel && i < acoes.length - 1 ? () => mexerEGravar(i, i + 1) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  /** As setas fazem num passo o que o arrasto faz em muitos: move e grava. */
  function mexerEGravar(de: number, para: number) {
    aoReordenar?.(de, para);
    aoLargar?.();
  }
}

function Linha({
  acao,
  aoEditar,
  aoMexer,
  alca,
  aoSubir,
  aoDescer,
}: {
  acao: Acao;
  aoEditar: (a: Acao) => void;
  aoMexer: (f: () => Promise<unknown>) => Promise<void>;
  /** O que `useArrastavel` entrega para a alça. Ausente, a linha não arrasta. */
  alca?: React.ComponentProps<"span">;
  /** Ausentes nas pontas da lista: não há para onde ir. */
  aoSubir?: () => void;
  aoDescer?: () => void;
}) {
  // Arquivar e reativar são a mesma edição com `ativa` trocada. As opções vão
  // junto como estão: sem elas no corpo, o servidor as apagaria.
  const comAtivaTrocada: AcaoNova = {
    nome: acao.nome,
    pontos: acao.pontos,
    repetivel: acao.repetivel,
    alvoDiario: acao.alvoDiario,
    ativa: !acao.ativa,
    ordem: acao.ordem,
    opcoes: acao.opcoes.map((o) => ({
      id: o.id,
      nome: o.nome,
      pontos: o.pontos,
      ativa: o.ativa,
    })),
    // Vão junto: sem eles no corpo, o servidor largaria os grupos da ação.
    grupos: acao.grupos,
  };

  const resumo = temOpcoes(acao)
    ? `${opcoesAtivas(acao).length} ${opcoesAtivas(acao).length === 1 ? "opção" : "opções"}`
    : `${(acao.pontos ?? 0) > 0 ? "+" : "−"}${Math.abs(acao.pontos ?? 0)} pts` +
      (acao.repetivel ? ` · até ${acao.alvoDiario}× por dia` : "");

  return (
    <div className={"flex items-start gap-2 px-4 py-2.5 " + (acao.ativa ? "" : "opacity-60")}>
      {/*
        A coluna de reordenar, igual à do editor de opções: ▲ alça ▼ de pé, os
        três controles de ordem lendo como um só.

        A alça é um `span`, não um `button`: ela existe só para o ponteiro, e
        quem chega pelo teclado usa as setas. Um botão focável que não responde
        ao Enter seria uma parada morta no caminho do Tab.
      */}
      {alca && (
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          <button
            type="button"
            onClick={aoSubir}
            disabled={!aoSubir}
            aria-label={"Mover “" + acao.nome + "” para cima"}
            className="px-1 text-xs leading-none text-tinta-3 hover:text-tinta disabled:opacity-30"
          >
            ▲
          </button>
          <span {...alca} aria-hidden="true" className={alca.className + " px-1 text-tinta-3"}>
            ⠿
          </span>
          <button
            type="button"
            onClick={aoDescer}
            disabled={!aoDescer}
            aria-label={"Mover “" + acao.nome + "” para baixo"}
            className="px-1 text-xs leading-none text-tinta-3 hover:text-tinta disabled:opacity-30"
          >
            ▼
          </button>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{acao.nome}</div>
            <div className="tabular text-xs text-tinta-3">{resumo}</div>
          </div>
          <button type="button" onClick={() => aoEditar(acao)} className="text-sm text-tinta-2 hover:text-tinta">
            Editar
          </button>
          <button
            type="button"
            onClick={() => void aoMexer(() => wlApi.salvarAcao(acao.id, comAtivaTrocada))}
            className="text-sm text-tinta-2 hover:text-tinta"
          >
            {acao.ativa ? "Arquivar" : "Reativar"}
          </button>
          <button
            type="button"
            onClick={() => {
              // Com histórico o servidor recusa e explica que o caminho é arquivar.
              if (confirm("Apagar “" + acao.nome + "” de vez?")) {
                void aoMexer(() => wlApi.apagarAcao(acao.id));
              }
            }}
            className="text-sm text-tinta-3 hover:text-perigo"
          >
            Apagar
          </button>
        </div>

        {temOpcoes(acao) && (
          <ul className="tabular mt-1 text-xs text-tinta-3">
            {acao.opcoes.map((o) => (
              <li key={o.id} className={o.ativa ? "" : "line-through"}>
                {o.pontos > 0 ? "+" : "−"}
                {Math.abs(o.pontos)} · {o.nome}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** O que o formulário guarda de cada opção enquanto se digita. */
type OpcaoForm = {
  /**
   * A identidade da linha para o React, estável enquanto o formulário vive.
   *
   * Não dá para usar o índice: reordenar uma lista chaveada por posição faz o
   * React reaproveitar o DOM errado — arrasta-se uma linha e o texto fica
   * parado enquanto outra se move. E nem dá para usar só o `id`, porque a opção
   * recém-adicionada ainda não tem um (ele vem do banco ao salvar).
   */
  chave: string;
  id?: number;
  nome: string;
  pontos: string;
  desconta: boolean;
  ativa: boolean;
};

/** Só precisa ser única dentro de um formulário, e um contador basta. */
let proximaChave = 0;

const opcaoVazia = (): OpcaoForm => ({
  chave: `nova-${proximaChave++}`,
  nome: "",
  pontos: "",
  desconta: false,
  ativa: true,
});

/**
 * O formulário separa o sinal do valor: tocar em "Desconta" é mais fácil de
 * acertar no celular do que digitar um menos antes do número — e impossível de
 * errar sem perceber.
 *
 * Uma ação é de um de dois feitios, e o botão "Tem opções" é o que alterna: ou
 * ela tem pontos próprios (e pode ser repetível), ou os pontos moram nas
 * opções e escolhe-se uma por dia.
 */
function FormAcao({
  acao,
  grupos,
  aoSalvar,
  aoCancelar,
}: {
  acao: Acao | null;
  grupos: Grupo[];
  aoSalvar: () => Promise<void>;
  aoCancelar?: () => void;
}) {
  const [nome, setNome] = useState(acao?.nome ?? "");
  const [desconta, setDesconta] = useState((acao?.pontos ?? 1) < 0);
  const [pontos, setPontos] = useState(acao?.pontos === null ? "" : String(Math.abs(acao?.pontos ?? 0) || ""));
  const [repetivel, setRepetivel] = useState(acao?.repetivel ?? false);
  const [alvo, setAlvo] = useState(String(acao?.alvoDiario ?? 1));
  const [usaOpcoes, setUsaOpcoes] = useState(acao ? temOpcoes(acao) : false);
  const [opcoes, setOpcoes] = useState<OpcaoForm[]>(() =>
    (acao?.opcoes ?? []).map((o) => ({
      // As que vêm do banco já têm identidade própria; o prefixo só evita
      // encostar nas chaves das linhas novas.
      chave: `op-${o.id}`,
      id: o.id,
      nome: o.nome,
      pontos: String(Math.abs(o.pontos)),
      desconta: o.pontos < 0,
      ativa: o.ativa,
    })),
  );
  const [emGrupos, setEmGrupos] = useState<number[]>(acao?.grupos ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function alternarGrupo(id: number) {
    setEmGrupos((atuais) => (atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]));
  }

  function mudarOpcao(i: number, campos: Partial<OpcaoForm>) {
    setOpcoes((atuais) => atuais.map((o, j) => (j === i ? { ...o, ...campos } : o)));
  }

  /**
   * Muda a opção de lugar. A conta mora em `reordenar`, que é pura e testada;
   * aqui só se aplica ao estado.
   *
   * O servidor grava `ordem` pela posição no array que o formulário manda (veja
   * `salvarOpcoes`, na API), então mexer nesta lista é mexer na ordem do banco.
   */
  function mover(de: number, para: number) {
    setOpcoes((atuais) => reordenar(atuais, de, para));
  }

  /*
   * O mesmo arrastar da lista de ações, pelo mesmo gancho. Aqui não há o que
   * gravar ao soltar: as opções só vão para o banco quando o formulário é
   * salvo, e a ordem viaja junto na posição do array.
   */
  const { arrastando, refDaLinha, alca } = useArrastavel({ aoMover: mover });

  /** Vírgula como separador decimal, igual ao campo de peso. */
  function lerPontos(texto: string, negativo: boolean): number | null {
    const valor = Number(texto.trim().replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) return null;
    return negativo ? -valor : valor;
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      setErro("Diga o nome da ação.");
      return;
    }

    let corpo: AcaoNova;

    if (usaOpcoes) {
      const preenchidas = opcoes.filter((o) => o.nome.trim() || o.pontos.trim());
      if (preenchidas.length === 0) {
        setErro("Adicione ao menos uma opção, ou desligue “Tem opções”.");
        return;
      }
      const convertidas = [];
      for (const o of preenchidas) {
        if (!o.nome.trim()) {
          setErro("Toda opção precisa de um nome.");
          return;
        }
        const valor = lerPontos(o.pontos, o.desconta);
        if (valor === null) {
          setErro(`Quantos pontos vale “${o.nome.trim()}”? Use um número como 3 ou 2,5.`);
          return;
        }
        convertidas.push({
          ...(o.id === undefined ? {} : { id: o.id }),
          nome: o.nome.trim(),
          pontos: valor,
          ativa: o.ativa,
        });
      }
      corpo = {
        nome: nome.trim(),
        pontos: null,
        repetivel: false,
        alvoDiario: 1,
        ativa: acao?.ativa ?? true,
        ordem: acao?.ordem ?? 0,
        opcoes: convertidas,
        grupos: emGrupos,
      };
    } else {
      const valor = lerPontos(pontos, desconta);
      if (valor === null) {
        setErro("Quantos pontos a ação vale? Use um número como 3 ou 2,5.");
        return;
      }
      const alvoDiario = repetivel ? Number(alvo) : 1;
      if (!Number.isInteger(alvoDiario) || alvoDiario < 1) {
        setErro("O alvo diário é um número inteiro de vezes, a partir de 1.");
        return;
      }
      corpo = {
        nome: nome.trim(),
        pontos: valor,
        repetivel,
        alvoDiario,
        ativa: acao?.ativa ?? true,
        ordem: acao?.ordem ?? 0,
        // Lista vazia é o pedido para o servidor largar as opções que havia.
        opcoes: [],
        grupos: emGrupos,
      };
    }

    setSalvando(true);
    setErro(null);
    try {
      if (acao) await wlApi.salvarAcao(acao.id, corpo);
      else await wlApi.criarAcao(corpo);
      await aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    // Sem moldura nem título próprios: a janela que o abriga já tem as duas, e
    // repeti-las dava caixa dentro de caixa com "Nova ação" escrito duas vezes.
    <form onSubmit={enviar}>
      {/*
        Uma coluna só, do celular ao desktop. O `sm:grid-cols-2` que havia aqui
        era uma armadilha: o `sm:` do Tailwind olha a largura da JANELA, não a
        do contêiner — dentro de uma modal de 32rem ele valia do mesmo jeito e
        espremia os campos em 240px cada.
      */}
      <div className="grid gap-4">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-tinta-2">Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={usaOpcoes ? "Refeição principal" : "Beber 1 copo de água"}
              maxLength={80}
              // Sempre, e não só na edição: sem um `autofocus` à vista o
              // `showModal()` entrega o foco ao primeiro focável, que é o × de
              // fechar — e começar com o dedo no botão de desistir é estranho.
              autoFocus
              className="w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 outline-none focus:border-destaque"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={usaOpcoes}
              onChange={(e) => {
                setUsaOpcoes(e.target.checked);
                if (e.target.checked && opcoes.length === 0) setOpcoes([opcaoVazia()]);
              }}
              className="size-4"
            />
            Tem opções (escolho uma por dia)
          </label>
        </div>

        <div className="space-y-3">
          {usaOpcoes ? (
            <p className="text-sm text-tinta-3">
              Os pontos ficam nas opções, logo abaixo. Escolhe-se uma por dia, e o dia perfeito conta
              a melhor delas — a que vale menos rende crédito parcial.
            </p>
          ) : (
            <>
              <div>
                <span className="mb-1 block text-sm text-tinta-2">Pontos</span>
                <div className="flex gap-2">
                  <label className="flex flex-1 items-center rounded-xl border border-borda bg-fundo px-3 focus-within:border-destaque">
                    <span className="sr-only">Pontos</span>
                    <input
                      value={pontos}
                      onChange={(e) => setPontos(e.target.value)}
                      inputMode="decimal"
                      placeholder="3"
                      className="tabular w-full bg-transparent py-2.5 outline-none"
                    />
                    <span className="text-sm text-tinta-3">pts</span>
                  </label>
                  <div className="flex rounded-xl bg-fundo p-0.5 text-sm">
                    {[false, true].map((d) => (
                      <button
                        key={String(d)}
                        type="button"
                        onClick={() => setDesconta(d)}
                        className={
                          "rounded-lg px-3 " +
                          (desconta === d ? "bg-superficie font-medium shadow-sm" : "text-tinta-2")
                        }
                      >
                        {d ? "Desconta" : "Soma"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={repetivel}
                  onChange={(e) => setRepetivel(e.target.checked)}
                  className="size-4"
                />
                Pode acontecer várias vezes no mesmo dia
              </label>

              {repetivel && (
                <label className="flex items-center gap-2 text-sm text-tinta-2">
                  Num dia completo, quantas vezes?
                  <input
                    value={alvo}
                    onChange={(e) => setAlvo(e.target.value)}
                    inputMode="numeric"
                    className="tabular w-16 rounded-lg border border-borda bg-fundo px-2 py-1 text-center outline-none focus:border-destaque"
                  />
                </label>
              )}
            </>
          )}
        </div>

        {/*
          Por último, e não entre o "Tem opções" e os pontos como era na modal:
          ali o interruptor ficava longe do campo que ele liga, e ninguém ligava
          um ao outro. Escolher os grupos é o passo final de cadastrar uma ação.
        */}
        <div>
          <span className="mb-1 block text-sm text-tinta-2">Aparece nos grupos</span>
          {grupos.length === 0 ? (
            <p className="text-xs text-tinta-3">Nenhum grupo cadastrado ainda.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {grupos.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => alternarGrupo(g.id)}
                  aria-pressed={emGrupos.includes(g.id)}
                  className={
                    "rounded-lg px-2.5 py-1.5 text-sm font-medium " +
                    (emGrupos.includes(g.id)
                      ? "bg-destaque text-sobre-destaque"
                      : "border border-borda text-tinta-2")
                  }
                >
                  {g.nome}
                </button>
              ))}
            </div>
          )}
          {/*
            No formulário em branco o aviso espera o nome: ele fica sempre à
            vista, e reclamar de grupo antes de existir ação só parecia que a
            ação recém-editada tinha perdido os dela.
          */}
          {emGrupos.length === 0 && grupos.length > 0 && (acao || nome.trim()) && (
            <span className="mt-1 block text-xs text-atencao">
              Sem grupo, a ação não aparece em dia nenhum.
            </span>
          )}
        </div>
      </div>

      {usaOpcoes && (
        <div className="mt-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-tinta-2">Opções</span>
            {opcoes.length > 1 && (
              <span className="text-xs text-tinta-3">
                Arraste pela alça para mudar a ordem do dia.
              </span>
            )}
          </div>

          {/*
            Cada opção em duas camadas, e não tudo numa linha: com a alça e as
            setas somadas aos campos, o nome ficaria com uns 118px dentro da
            janela de 32rem. Em cima o nome e o ×, embaixo os pontos — e a
            coluna de reordenar (↑ alça ↓) de pé na esquerda, para os três
            controles de ordem lerem como um só.
          */}
          {opcoes.map((o, i) => (
            <div
              key={o.chave}
              ref={refDaLinha(i)}
              className={
                "flex items-stretch gap-2 rounded-xl border p-2 " +
                // A linha em viagem fica destacada e sem seleção de texto: sem
                // o `select-none` o arrasto pinta de azul meio formulário.
                (arrastando === i
                  ? "border-destaque bg-destaque-suave select-none"
                  : "border-borda")
              }
            >
              <div className="flex shrink-0 flex-col items-center justify-between">
                <button
                  type="button"
                  onClick={() => mover(i, i - 1)}
                  disabled={i === 0}
                  aria-label={"Mover “" + (o.nome || "opção " + (i + 1)) + "” para cima"}
                  className="px-1 text-xs leading-none text-tinta-3 hover:text-tinta disabled:opacity-30"
                >
                  ▲
                </button>

                {/*
                  A alça é um `span`, não um `button`: ela só existe para o
                  ponteiro, e quem chega pelo teclado reordena pelas setas acima
                  e abaixo. Um botão focável que não responde ao Enter seria uma
                  parada morta no caminho do Tab.

                  `touch-none` é o que faz o arrasto funcionar no celular: sem
                  ele o navegador entende o gesto como rolagem da página e nunca
                  nos manda os eventos.
                */}
                <span
                  {...alca(i)}
                  aria-hidden="true"
                  className={alca(i).className + " px-1 text-tinta-3"}
                >
                  ⠿
                </span>

                <button
                  type="button"
                  onClick={() => mover(i, i + 1)}
                  disabled={i === opcoes.length - 1}
                  aria-label={"Mover “" + (o.nome || "opção " + (i + 1)) + "” para baixo"}
                  className="px-1 text-xs leading-none text-tinta-3 hover:text-tinta disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Nome da opção</span>
                    <input
                      value={o.nome}
                      onChange={(e) => mudarOpcao(i, { nome: e.target.value })}
                      placeholder="Marmita sem carne vermelha"
                      maxLength={80}
                      className="w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-destaque"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setOpcoes((atuais) => atuais.filter((_, j) => j !== i))}
                    aria-label={"Tirar a opção " + (o.nome || i + 1)}
                    className="shrink-0 px-1 text-lg leading-none text-tinta-3 hover:text-perigo"
                  >
                    ×
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex w-20 items-center rounded-lg border border-borda bg-fundo px-2 focus-within:border-destaque">
                    <span className="sr-only">Pontos da opção</span>
                    <input
                      value={o.pontos}
                      onChange={(e) => mudarOpcao(i, { pontos: e.target.value })}
                      inputMode="decimal"
                      placeholder="10"
                      className="tabular w-full bg-transparent py-1.5 text-sm outline-none"
                    />
                  </label>

                  <div className="flex rounded-lg bg-fundo p-0.5 text-xs">
                    {[false, true].map((d) => (
                      <button
                        key={String(d)}
                        type="button"
                        onClick={() => mudarOpcao(i, { desconta: d })}
                        className={
                          "rounded px-2 py-1 " +
                          (o.desconta === d ? "bg-superficie font-medium shadow-sm" : "text-tinta-2")
                        }
                      >
                        {d ? "Desconta" : "Soma"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setOpcoes((atuais) => [...atuais, opcaoVazia()])}
            className="w-full rounded-xl border border-dashed border-borda py-2 text-sm text-tinta-2"
          >
            Adicionar opção
          </button>
        </div>
      )}

      {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="flex-1 rounded-xl bg-destaque py-2.5 font-medium text-sobre-destaque disabled:opacity-60"
        >
          {salvando ? "Salvando…" : acao ? "Salvar" : "Adicionar"}
        </button>
        {aoCancelar && (
          <button type="button" onClick={aoCancelar} className="rounded-xl border border-borda px-4 text-tinta-2">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
