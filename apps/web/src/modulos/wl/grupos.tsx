import { useCallback, useEffect, useState } from "react";
import { wlApi, type GrupoNovo } from "./api.ts";
import { Aviso } from "./aviso.tsx";
import { DIAS_DA_SEMANA, type Acao, type Grupo } from "./calculos.ts";

/**
 * O cadastro de grupos: cada um é um tipo de dia.
 *
 * Dia de trabalho pede hábitos diferentes de fim de semana, e fim de semana
 * fora de casa pede outros. O grupo escolhido no dia é quem decide tanto as
 * ações que aparecem quanto o denominador da nota.
 *
 * Recebe as `acoes` só para contar quantas há em cada grupo — quem manda nelas
 * é o painel de ações, onde se escolhe de quais grupos a ação participa.
 */
export function PainelGrupos({ acoes, aoMudar }: { acoes: Acao[]; aoMudar?: () => void }) {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Grupo | null>(null);
  const [criados, setCriados] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setGrupos(await wlApi.grupos());
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

  if (erro && !grupos) return <Aviso texto={erro} />;
  if (!grupos) return <p className="text-tinta-3">Carregando…</p>;

  const ativos = grupos.filter((g) => g.ativo);
  const arquivados = grupos.filter((g) => !g.ativo);

  // Dia da semana que nenhum grupo cobre cai em "escolha à mão" todo dia, e é
  // o tipo de buraco que só se percebe quando acontece.
  const cobertos = new Set(ativos.flatMap((g) => g.diasDaSemana));
  const descobertos = [0, 1, 2, 3, 4, 5, 6].filter((d) => !cobertos.has(d));

  return (
    <div className="space-y-4">
      {erro && <Aviso texto={erro} />}

      <p className="text-xs text-tinta-3">
        Cada grupo é um tipo de dia. O grupo do dia decide quais ações aparecem e quanto vale um dia
        perfeito — um sábado deixa de ser cobrado pelas metas de uma segunda. Os dias da semana
        marcados aqui fazem o grupo entrar sozinho; dá para trocar em qualquer dia.
      </p>

      {descobertos.length > 0 && (
        <p className="rounded-xl border border-atencao px-3 py-2 text-xs text-atencao">
          Sem grupo automático em {descobertos.map((d) => DIAS_DA_SEMANA[d]).join(", ")}. Nesses dias
          você vai precisar escolher o grupo à mão.
        </p>
      )}

      <FormGrupo
        key={editando ? `grupo-${editando.id}` : `novo-${criados}`}
        grupo={editando}
        aoSalvar={async () => {
          if (!editando) setCriados((n) => n + 1);
          setEditando(null);
          await carregar();
          aoMudar?.();
        }}
        aoCancelar={editando ? () => setEditando(null) : undefined}
      />

      <Lista titulo="Grupos" grupos={ativos} acoes={acoes} aoEditar={setEditando} aoMexer={mexer} />
      {arquivados.length > 0 && (
        <Lista
          titulo="Arquivados"
          grupos={arquivados}
          acoes={acoes}
          aoEditar={setEditando}
          aoMexer={mexer}
        />
      )}
    </div>
  );
}

function Lista({
  titulo,
  grupos,
  acoes,
  aoEditar,
  aoMexer,
}: {
  titulo: string;
  grupos: Grupo[];
  acoes: Acao[];
  aoEditar: (g: Grupo) => void;
  aoMexer: (f: () => Promise<unknown>) => Promise<void>;
}) {
  if (grupos.length === 0) {
    return (
      <section className="rounded-2xl border border-borda bg-superficie">
        <h3 className="px-4 pt-4 pb-2 font-medium">{titulo}</h3>
        <p className="px-4 pb-4 text-sm text-tinta-3">Nenhum grupo ainda.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-borda bg-superficie">
      <h3 className="px-4 pt-4 pb-2 font-medium">{titulo}</h3>
      <ul className="divide-y divide-borda">
        {grupos.map((g) => {
          const quantas = acoes.filter((a) => a.ativa && a.grupos.includes(g.id)).length;
          const comAtivoTrocado: GrupoNovo = {
            nome: g.nome,
            diasDaSemana: g.diasDaSemana,
            ativo: !g.ativo,
            ordem: g.ordem,
          };

          return (
            <li key={g.id} className={"flex items-center gap-3 px-4 py-2.5 " + (g.ativo ? "" : "opacity-60")}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{g.nome}</div>
                <div className="text-xs text-tinta-3">
                  {quantas} {quantas === 1 ? "ação" : "ações"}
                  {g.diasDaSemana.length > 0
                    ? " · " + g.diasDaSemana.map((d) => DIAS_DA_SEMANA[d]).join(" ")
                    : " · só manual"}
                </div>
              </div>
              <button type="button" onClick={() => aoEditar(g)} className="text-sm text-tinta-2 hover:text-tinta">
                Editar
              </button>
              <button
                type="button"
                onClick={() => void aoMexer(() => wlApi.salvarGrupo(g.id, comAtivoTrocado))}
                className="text-sm text-tinta-2 hover:text-tinta"
              >
                {g.ativo ? "Arquivar" : "Reativar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Com histórico o servidor recusa e explica que o caminho é arquivar.
                  if (confirm("Apagar o grupo “" + g.nome + "” de vez?")) {
                    void aoMexer(() => wlApi.apagarGrupo(g.id));
                  }
                }}
                className="text-sm text-tinta-3 hover:text-perigo"
              >
                Apagar
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FormGrupo({
  grupo,
  aoSalvar,
  aoCancelar,
}: {
  grupo: Grupo | null;
  aoSalvar: () => Promise<void>;
  aoCancelar?: () => void;
}) {
  const [nome, setNome] = useState(grupo?.nome ?? "");
  const [dias, setDias] = useState<number[]>(grupo?.diasDaSemana ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function alternarDia(d: number) {
    setDias((atuais) => (atuais.includes(d) ? atuais.filter((x) => x !== d) : [...atuais, d].sort()));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      setErro("Diga o nome do grupo.");
      return;
    }

    setSalvando(true);
    setErro(null);
    const corpo: GrupoNovo = {
      nome: nome.trim(),
      diasDaSemana: dias,
      ativo: grupo?.ativo ?? true,
      ordem: grupo?.ordem ?? 0,
    };
    try {
      if (grupo) await wlApi.salvarGrupo(grupo.id, corpo);
      else await wlApi.criarGrupo(corpo);
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
      className={"rounded-2xl border bg-superficie p-4 " + (grupo ? "border-destaque" : "border-borda")}
    >
      <h3 className="mb-3 font-medium">{grupo ? "Editar grupo" : "Novo grupo"}</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-tinta-2">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Fim de semana na casa da namorada"
            maxLength={80}
            autoFocus={!!grupo}
            className="w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 outline-none focus:border-destaque"
          />
        </label>

        <div>
          <span className="mb-1 block text-sm text-tinta-2">Entra sozinho em</span>
          <div className="flex flex-wrap gap-1">
            {DIAS_DA_SEMANA.map((rotulo, d) => (
              <button
                key={d}
                type="button"
                onClick={() => alternarDia(d)}
                aria-pressed={dias.includes(d)}
                className={
                  "rounded-lg px-2.5 py-1.5 text-sm font-medium " +
                  (dias.includes(d)
                    ? "bg-destaque text-sobre-destaque"
                    : "border border-borda text-tinta-2")
                }
              >
                {rotulo}
              </button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-tinta-3">
            Nenhum dia marcado: o grupo só entra quando você escolher à mão.
          </span>
        </div>
      </div>

      {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="flex-1 rounded-xl bg-destaque py-2.5 font-medium text-sobre-destaque disabled:opacity-60"
        >
          {salvando ? "Salvando…" : grupo ? "Salvar" : "Adicionar"}
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
