import { useCallback, useEffect, useState } from "react";
import { wlApi, type AcaoNova } from "./api.ts";
import { Aviso } from "./aviso.tsx";
import { pontosPossiveis, type Acao, type Refeicao } from "./calculos.ts";

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
 * Recebe as `refeicoes` só para o total do dia perfeito sair completo — quem
 * manda nelas é o painel de refeições.
 */
export function PainelAcoes({ refeicoes, aoMudar }: { refeicoes: Refeicao[]; aoMudar?: () => void }) {
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
  const positivas = ativas.filter((a) => a.pontos > 0);
  const negativas = ativas.filter((a) => a.pontos < 0);
  const arquivadas = acoes.filter((a) => !a.ativa);
  const perfeito = pontosPossiveis(acoes, refeicoes);

  return (
    <div className="space-y-4">
      {erro && <Aviso texto={erro} />}

      <section className="rounded-2xl border border-borda bg-superficie p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-tinta-2">Um dia perfeito vale</span>
          <span className="tabular text-2xl font-semibold tracking-tight">{perfeito} pts</span>
        </div>
        <p className="mt-2 text-xs text-tinta-3">
          É a soma das ações positivas, pelo alvo diário de cada uma, mais a melhor refeição do
          cardápio — e é esse total que vale 100%. Mexer aqui vale de hoje em diante: a nota de hoje
          é recalculada na hora, e os dias anteriores guardam o que as ações valiam na época — eles
          só mudam se você reabrir um deles e mexer.
        </p>
      </section>

      <FormAcao
        // A key remonta o formulário ao trocar de ação e ao terminar um
        // cadastro — mais simples que sincronizar estado com efeito, como no
        // formulário de pesagem.
        key={editando ? `acao-${editando.id}` : `nova-${criadas}`}
        acao={editando}
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
  return (
    <section className="rounded-2xl border border-borda bg-superficie">
      <h2 className="px-4 pt-4 pb-2 font-medium">{titulo}</h2>
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
  // Arquivar e reativar são a mesma edição com `ativa` trocada.
  const comAtivaTrocada: AcaoNova = {
    nome: acao.nome,
    pontos: acao.pontos,
    repetivel: acao.repetivel,
    alvoDiario: acao.alvoDiario,
    ativa: !acao.ativa,
    ordem: acao.ordem,
  };

  const sinal = acao.pontos > 0 ? "+" : "−";
  const vezes = acao.repetivel ? " · até " + acao.alvoDiario + "× por dia" : "";

  return (
    <div className={"flex items-center gap-3 px-4 py-2.5 " + (acao.ativa ? "" : "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{acao.nome}</div>
        <div className="tabular text-xs text-tinta-3">
          {sinal}
          {Math.abs(acao.pontos)} pts{vezes}
        </div>
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
  );
}

/**
 * O formulário separa o sinal do valor: tocar em "Desconta" é mais fácil de
 * acertar no celular do que digitar um menos antes do número — e impossível de
 * errar sem perceber.
 */
function FormAcao({
  acao,
  aoSalvar,
  aoCancelar,
}: {
  acao: Acao | null;
  aoSalvar: () => Promise<void>;
  aoCancelar?: () => void;
}) {
  const [nome, setNome] = useState(acao?.nome ?? "");
  const [desconta, setDesconta] = useState((acao?.pontos ?? 1) < 0);
  const [pontos, setPontos] = useState(acao ? String(Math.abs(acao.pontos)) : "");
  const [repetivel, setRepetivel] = useState(acao?.repetivel ?? false);
  const [alvo, setAlvo] = useState(String(acao?.alvoDiario ?? 1));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      setErro("Diga o nome da ação.");
      return;
    }
    // Vírgula como separador decimal, igual ao campo de peso.
    const valor = Number(pontos.trim().replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro("Quantos pontos a ação vale? Use um número como 3 ou 2,5.");
      return;
    }
    const alvoDiario = repetivel ? Number(alvo) : 1;
    if (!Number.isInteger(alvoDiario) || alvoDiario < 1) {
      setErro("O alvo diário é um número inteiro de vezes, a partir de 1.");
      return;
    }

    setSalvando(true);
    setErro(null);
    const corpo: AcaoNova = {
      nome: nome.trim(),
      pontos: desconta ? -valor : valor,
      repetivel,
      alvoDiario,
      ativa: acao?.ativa ?? true,
      ordem: acao?.ordem ?? 0,
    };
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
      className={
        "rounded-2xl border bg-superficie p-4 " + (acao ? "border-destaque" : "border-borda")
      }
    >
      <h2 className="mb-3 font-medium">{acao ? "Editar ação" : "Nova ação"}</h2>

      <label className="block">
        <span className="sr-only">Nome da ação</span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Beber 1 copo de água"
          maxLength={80}
          autoFocus={!!acao}
          className="w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 outline-none focus:border-destaque"
        />
      </label>

      <div className="mt-2 flex gap-2">
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
                "rounded-lg px-3 " + (desconta === d ? "bg-superficie font-medium shadow-sm" : "text-tinta-2")
              }
            >
              {d ? "Desconta" : "Soma"}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={repetivel}
          onChange={(e) => setRepetivel(e.target.checked)}
          className="size-4"
        />
        Pode acontecer várias vezes no mesmo dia
      </label>

      {repetivel && (
        <label className="mt-2 flex items-center gap-2 text-sm text-tinta-2">
          Num dia completo, quantas vezes?
          <input
            value={alvo}
            onChange={(e) => setAlvo(e.target.value)}
            inputMode="numeric"
            className="tabular w-16 rounded-lg border border-borda bg-fundo px-2 py-1 text-center outline-none focus:border-destaque"
          />
        </label>
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
