import { useCallback, useEffect, useState } from "react";
import { wlApi, type AcaoNova } from "./api.ts";
import { Aviso } from "./aviso.tsx";
import { opcoesAtivas, pontosPossiveis, temOpcoes, type Acao, type Grupo } from "./calculos.ts";

/**
 * O cadastro de ações do WL, para viver dentro de uma modal.
 *
 * Numa janela e não numa tela própria: mexer no cadastro é uma pausa no meio
 * de marcar o dia, não um destino — e fechar tem que devolver a pessoa
 * exatamente onde ela estava, com o calendário na mesma rolagem.
 *
 * O `aoMudar` avisa quem abriu que o catálogo mexeu, para a tela de trás
 * recarregar as ações e o total possível do dia.
 *
 * Os `grupos` vêm de fora porque é no painel deles que se mandam: aqui eles só
 * aparecem como botões para marcar em quais a ação entra.
 */
export function PainelAcoes({ grupos, aoMudar }: { grupos: Grupo[]; aoMudar?: () => void }) {
  const [acoes, setAcoes] = useState<Acao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // `null` é o formulário em branco, que fica sempre à vista. Editar uma ação
  // existente empresta o mesmo formulário e devolve em branco ao terminar.
  const [editando, setEditando] = useState<Acao | null>(null);
  // Só serve para trocar a `key` e remontar o formulário vazio depois de criar
  // uma ação — assim dá para cadastrar várias seguidas sem limpar campo a campo.
  const [criadas, setCriadas] = useState(0);

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

  async function mexer(acao: () => Promise<unknown>) {
    try {
      await acao();
      await carregar();
      setErro(null);
      aoMudar?.();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (erro && !acoes) return <Aviso texto={erro} />;
  if (!acoes) return <p className="text-tinta-3">Carregando…</p>;

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
    <div className="space-y-4">
      {erro && <Aviso texto={erro} />}

      <section className="rounded-2xl border border-borda bg-superficie p-4">
        <h3 className="text-sm font-medium">O dia perfeito de cada grupo</h3>
        {gruposAtivos.length === 0 ? (
          <p className="mt-1 text-xs text-tinta-3">Nenhum grupo ainda. Crie um no painel de grupos.</p>
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
          Cada grupo tem o seu 100%: a soma das ações positivas dele, pelo alvo diário de cada uma,
          mais a melhor opção das que têm opções. Mexer aqui vale de hoje em diante — a nota de hoje
          é recalculada na hora, e os dias anteriores guardam o que as ações valiam na época.
        </p>
      </section>

      {semGrupo.length > 0 && (
        <p className="rounded-xl border border-atencao px-3 py-2 text-xs text-atencao">
          Fora de grupo, e por isso sem aparecer em dia nenhum: {semGrupo.map((a) => a.nome).join(", ")}.
        </p>
      )}

      <FormAcao
        // A key remonta o formulário ao trocar de ação e ao terminar um
        // cadastro — mais simples que sincronizar estado com efeito, como no
        // formulário de pesagem.
        key={editando ? `acao-${editando.id}` : `nova-${criadas}`}
        acao={editando}
        grupos={gruposAtivos}
        aoSalvar={async () => {
          if (!editando) setCriadas((n) => n + 1);
          setEditando(null);
          await carregar();
          aoMudar?.();
        }}
        // Não há o que cancelar no formulário em branco: ele é o estado de
        // repouso da janela, e não algo que foi aberto.
        aoCancelar={editando ? () => setEditando(null) : undefined}
      />

      <Grupo titulo="Com opções" vazio="" acoes={comOpcoes}>
        {(a) => <Linha acao={a} aoEditar={setEditando} aoMexer={mexer} />}
      </Grupo>

      <Grupo titulo="Positivas" vazio="Nenhuma ainda. São elas que formam o dia perfeito." acoes={positivas}>
        {(a) => <Linha acao={a} aoEditar={setEditando} aoMexer={mexer} />}
      </Grupo>

      <Grupo titulo="Negativas" vazio="Nenhuma ainda. Elas descontam da nota do dia." acoes={negativas}>
        {(a) => <Linha acao={a} aoEditar={setEditando} aoMexer={mexer} />}
      </Grupo>

      {arquivadas.length > 0 && (
        <Grupo titulo="Arquivadas" vazio="" acoes={arquivadas}>
          {(a) => <Linha acao={a} aoEditar={setEditando} aoMexer={mexer} />}
        </Grupo>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  vazio,
  acoes,
  children,
}: {
  titulo: string;
  vazio: string;
  acoes: Acao[];
  children: (a: Acao) => React.ReactNode;
}) {
  // Grupo sem itens e sem texto de vazio não vira seção: é o caso de "Com
  // opções" e "Arquivadas", que só aparecem quando têm o que mostrar.
  if (acoes.length === 0 && vazio === "") return null;

  return (
    <section className="rounded-2xl border border-borda bg-superficie">
      <h3 className="px-4 pt-4 pb-2 font-medium">{titulo}</h3>
      {acoes.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-tinta-3">{vazio}</p>
      ) : (
        <ul className="divide-y divide-borda">
          {acoes.map((a) => (
            <li key={a.id}>{children(a)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Linha({
  acao,
  aoEditar,
  aoMexer,
}: {
  acao: Acao;
  aoEditar: (a: Acao) => void;
  aoMexer: (f: () => Promise<unknown>) => Promise<void>;
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
    <div className={"px-4 py-2.5 " + (acao.ativa ? "" : "opacity-60")}>
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
  );
}

/** O que o formulário guarda de cada opção enquanto se digita. */
type OpcaoForm = {
  id?: number;
  nome: string;
  pontos: string;
  desconta: boolean;
  ativa: boolean;
};

const OPCAO_VAZIA: OpcaoForm = { nome: "", pontos: "", desconta: false, ativa: true };

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
    <form
      onSubmit={enviar}
      className={"rounded-2xl border bg-superficie p-4 " + (acao ? "border-destaque" : "border-borda")}
    >
      <h3 className="mb-3 font-medium">{acao ? "Editar ação" : "Nova ação"}</h3>

      {/*
        Duas colunas a partir do tablet, uma só no celular: à esquerda o que a
        ação é, à direita quanto ela vale. Fixar duas colunas espremeria os
        campos justamente na tela em que o app mais é usado.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-tinta-2">Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={usaOpcoes ? "Refeição principal" : "Beber 1 copo de água"}
              maxLength={80}
              autoFocus={!!acao}
              className="w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 outline-none focus:border-destaque"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={usaOpcoes}
              onChange={(e) => {
                setUsaOpcoes(e.target.checked);
                if (e.target.checked && opcoes.length === 0) setOpcoes([{ ...OPCAO_VAZIA }]);
              }}
              className="size-4"
            />
            Tem opções (escolho uma por dia)
          </label>

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
            {emGrupos.length === 0 && grupos.length > 0 && (
              <span className="mt-1 block text-xs text-atencao">
                Sem grupo, a ação não aparece em dia nenhum.
              </span>
            )}
          </div>
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
      </div>

      {usaOpcoes && (
        <div className="mt-4 space-y-2">
          <span className="block text-sm text-tinta-2">Opções</span>
          {opcoes.map((o, i) => (
            <div key={o.id ?? `nova-${i}`} className="flex items-center gap-2 rounded-xl border border-borda p-2">
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

              <button
                type="button"
                onClick={() => setOpcoes((atuais) => atuais.filter((_, j) => j !== i))}
                aria-label={"Tirar a opção " + (o.nome || i + 1)}
                className="px-1 text-lg leading-none text-tinta-3 hover:text-perigo"
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setOpcoes((atuais) => [...atuais, { ...OPCAO_VAZIA }])}
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
