import { useCallback, useEffect, useState } from "react";
import { wlApi, type RefeicaoNova } from "./api.ts";
import { Aviso } from "./aviso.tsx";
import { pontosPossiveis, type Acao, type Refeicao } from "./calculos.ts";

/**
 * O cardápio: as refeições saudáveis entre as quais você escolhe uma por dia.
 *
 * Vive numa modal pelo mesmo motivo do cadastro de ações — mexer aqui é uma
 * pausa no meio de marcar o dia, não um destino.
 *
 * Recebe as `acoes` só para mostrar o total do dia perfeito completo; quem
 * manda nelas é o painel de ações.
 */
export function PainelRefeicoes({ acoes, aoMudar }: { acoes: Acao[]; aoMudar?: () => void }) {
  const [refeicoes, setRefeicoes] = useState<Refeicao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Refeicao | null>(null);
  const [criadas, setCriadas] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setRefeicoes(await wlApi.refeicoes());
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

  if (erro && !refeicoes) return <Aviso texto={erro} />;
  if (!refeicoes) return <p className="text-tinta-3">Carregando…</p>;

  const ativas = refeicoes.filter((r) => r.ativa);
  const arquivadas = refeicoes.filter((r) => !r.ativa);
  // A melhor refeição ativa é o que a escolha do dia pode render no máximo.
  const melhor = ativas.reduce((m, r) => Math.max(m, r.pontos), 0);

  return (
    <div className="space-y-4">
      {erro && <Aviso texto={erro} />}

      <section className="rounded-2xl border border-borda bg-superficie p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-tinta-2">A melhor refeição vale</span>
          <span className="tabular text-2xl font-semibold tracking-tight">{melhor} pts</span>
        </div>
        <p className="mt-2 text-xs text-tinta-3">
          Como só cabe uma refeição por dia, é a melhor delas que entra no dia perfeito — somar todas
          faria um 100% que ninguém alcança. Hoje o dia perfeito inteiro vale{" "}
          <span className="tabular font-medium text-tinta-2">{pontosPossiveis(acoes, refeicoes)} pts</span>,
          contando as ações. Escolher uma refeição que vale menos rende crédito parcial.
        </p>
      </section>

      <FormRefeicao
        key={editando ? `refeicao-${editando.id}` : `nova-${criadas}`}
        refeicao={editando}
        aoSalvar={async () => {
          if (!editando) setCriadas((n) => n + 1);
          setEditando(null);
          await carregar();
          aoMudar?.();
        }}
        aoCancelar={editando ? () => setEditando(null) : undefined}
      />

      <Grupo titulo="No cardápio" vazio="Nenhuma refeição ainda." refeicoes={ativas}>
        {(r) => <Linha refeicao={r} aoEditar={setEditando} aoMexer={mexer} />}
      </Grupo>

      {arquivadas.length > 0 && (
        <Grupo titulo="Arquivadas" vazio="" refeicoes={arquivadas}>
          {(r) => <Linha refeicao={r} aoEditar={setEditando} aoMexer={mexer} />}
        </Grupo>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  vazio,
  refeicoes,
  children,
}: {
  titulo: string;
  vazio: string;
  refeicoes: Refeicao[];
  children: (r: Refeicao) => React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-borda bg-superficie">
      <h3 className="px-4 pt-4 pb-2 font-medium">{titulo}</h3>
      {refeicoes.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-tinta-3">{vazio}</p>
      ) : (
        <ul className="divide-y divide-borda">
          {refeicoes.map((r) => (
            <li key={r.id}>{children(r)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Linha({
  refeicao,
  aoEditar,
  aoMexer,
}: {
  refeicao: Refeicao;
  aoEditar: (r: Refeicao) => void;
  aoMexer: (f: () => Promise<unknown>) => Promise<void>;
}) {
  const comAtivaTrocada: RefeicaoNova = {
    nome: refeicao.nome,
    descricao: refeicao.descricao,
    pontos: refeicao.pontos,
    ativa: !refeicao.ativa,
    ordem: refeicao.ordem,
  };

  return (
    <div className={"px-4 py-2.5 " + (refeicao.ativa ? "" : "opacity-60")}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{refeicao.nome}</div>
          <div className="tabular text-xs text-tinta-3">+{refeicao.pontos} pts</div>
        </div>
        <button type="button" onClick={() => aoEditar(refeicao)} className="text-sm text-tinta-2 hover:text-tinta">
          Editar
        </button>
        <button
          type="button"
          onClick={() => void aoMexer(() => wlApi.salvarRefeicao(refeicao.id, comAtivaTrocada))}
          className="text-sm text-tinta-2 hover:text-tinta"
        >
          {refeicao.ativa ? "Arquivar" : "Reativar"}
        </button>
        <button
          type="button"
          onClick={() => {
            // Com histórico o servidor recusa e explica que o caminho é arquivar.
            if (confirm("Apagar “" + refeicao.nome + "” de vez?")) {
              void aoMexer(() => wlApi.apagarRefeicao(refeicao.id));
            }
          }}
          className="text-sm text-tinta-3 hover:text-perigo"
        >
          Apagar
        </button>
      </div>
      {refeicao.descricao && (
        // `whitespace-pre-line` porque o cardápio costuma ser escrito em
        // linhas, e um parágrafo corrido perderia essa estrutura.
        <p className="mt-1 text-xs whitespace-pre-line text-tinta-3">{refeicao.descricao}</p>
      )}
    </div>
  );
}

function FormRefeicao({
  refeicao,
  aoSalvar,
  aoCancelar,
}: {
  refeicao: Refeicao | null;
  aoSalvar: () => Promise<void>;
  aoCancelar?: () => void;
}) {
  const [nome, setNome] = useState(refeicao?.nome ?? "");
  const [descricao, setDescricao] = useState(refeicao?.descricao ?? "");
  const [pontos, setPontos] = useState(refeicao ? String(refeicao.pontos) : "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      setErro("Diga o nome da refeição.");
      return;
    }
    const valor = Number(pontos.trim().replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro("Quantos pontos a refeição vale? Um número positivo, como 3 ou 2,5.");
      return;
    }

    setSalvando(true);
    setErro(null);
    const corpo: RefeicaoNova = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      pontos: valor,
      ativa: refeicao?.ativa ?? true,
      ordem: refeicao?.ordem ?? 0,
    };
    try {
      if (refeicao) await wlApi.salvarRefeicao(refeicao.id, corpo);
      else await wlApi.criarRefeicao(corpo);
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
      className={"rounded-2xl border bg-superficie p-4 " + (refeicao ? "border-destaque" : "border-borda")}
    >
      <h3 className="mb-3 font-medium">{refeicao ? "Editar refeição" : "Nova refeição"}</h3>

      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Nome da refeição</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Frango com salada"
            maxLength={80}
            autoFocus={!!refeicao}
            className="w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 outline-none focus:border-destaque"
          />
        </label>
        <label className="flex w-28 items-center rounded-xl border border-borda bg-fundo px-3 focus-within:border-destaque">
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
      </div>

      <label className="mt-2 block">
        <span className="sr-only">Descrição</span>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="O cardápio, as regras, o que lembrar — opcional"
          maxLength={1000}
          rows={3}
          className="w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-sm outline-none focus:border-destaque"
        />
      </label>

      {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="flex-1 rounded-xl bg-destaque py-2.5 font-medium text-sobre-destaque disabled:opacity-60"
        >
          {salvando ? "Salvando…" : refeicao ? "Salvar" : "Adicionar"}
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
