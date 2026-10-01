import { useCallback, useEffect, useState } from "react";
import { wlApi, type JejumNovo } from "./api.ts";
import { Aviso } from "./aviso.tsx";
import {
  agruparPorDia,
  diaLocal,
  doCampoLocal,
  duracaoSeg,
  faltamSeg,
  formatarDia,
  formatarDuracao,
  formatarHora,
  formatarRelogio,
  METAS,
  paraCampoLocal,
  progresso,
  type Jejum,
} from "./jejum-calculos.ts";

/** Quantos dias de histórico o painel busca de uma vez. */
const DIAS_DE_HISTORICO = 60;

/** Onde a preferência de minimizar fica guardada entre uma abertura e outra. */
const CHAVE_MINIMIZADO = "trimly.jejum.minimizado";

/**
 * Um "agora" que anda sozinho, no ritmo pedido.
 *
 * O ritmo é parâmetro porque o bloco aberto mostra segundos e o minimizado
 * mostra minutos: redesenhar de segundo em segundo para mexer num número que
 * só muda a cada sessenta seria trabalho jogado fora — e, no celular, bateria.
 */
function useAgora(intervaloMs: number): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}

/** A preferência sobrevive ao recarregar; um navegador que barra o storage não quebra nada. */
function lerMinimizado(): boolean {
  try {
    return localStorage.getItem(CHAVE_MINIMIZADO) === "1";
  } catch {
    return false;
  }
}

/**
 * O bloco de jejum no topo do WL: o cronômetro, ou o botão de começar.
 *
 * Fica acima da pontuação porque é o que se olha primeiro — enquanto um jejum
 * corre, é a informação viva da tela. O histórico mora numa janela à parte,
 * senão a lista empurraria a nota do dia para fora da primeira tela.
 */
export function BlocoJejum({
  versao,
  aoMudar,
  aoAbrirHistorico,
}: {
  /** Sobe quando o histórico muda, para o bloco rebuscar o jejum em aberto. */
  versao: number;
  aoMudar: () => void;
  aoAbrirHistorico: () => void;
}) {
  const [atual, setAtual] = useState<Jejum | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [meta, setMeta] = useState<number | null>(METAS[0]!.min);
  const [ocupado, setOcupado] = useState(false);
  const [minimizado, setMinimizado] = useState(lerMinimizado);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_MINIMIZADO, minimizado ? "1" : "0");
    } catch {
      // Sem storage a preferência vale só para esta sessão, e tudo bem.
    }
  }, [minimizado]);

  const carregar = useCallback(async () => {
    try {
      setAtual(await wlApi.jejumAtual());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  async function mexer(acao: () => Promise<unknown>) {
    setOcupado(true);
    try {
      await acao();
      await carregar();
      setErro(null);
      aoMudar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  if (atual === undefined) {
    return <Cartao><p className="text-sm text-tinta-3">Carregando…</p></Cartao>;
  }

  if (minimizado) {
    return (
      <Cartao destacado={atual !== null}>
        {erro && <Aviso texto={erro} />}
        <Resumo jejum={atual} aoExpandir={() => setMinimizado(false)} />
      </Cartao>
    );
  }

  return (
    <Cartao destacado={atual !== null}>
      <div className="flex justify-end">
        <BotaoMinimizar aoTocar={() => setMinimizado(true)} />
      </div>

      {erro && <Aviso texto={erro} />}

      {atual ? (
        <Cronometro
          jejum={atual}
          ocupado={ocupado}
          aoParar={() =>
            void mexer(() =>
              wlApi.salvarJejum(atual.id, {
                dia: atual.dia,
                inicio: atual.inicio,
                fim: new Date().toISOString(),
                metaMin: atual.metaMin,
                nota: atual.nota,
              }),
            )
          }
        />
      ) : (
        <Comecar
          meta={meta}
          aoEscolherMeta={setMeta}
          ocupado={ocupado}
          aoIniciar={() => {
            const agora = new Date();
            void mexer(() =>
              wlApi.criarJejum({
                // O dia é o do início, decidido por este aparelho.
                dia: diaLocal(agora),
                inicio: agora.toISOString(),
                fim: null,
                metaMin: meta,
                nota: null,
              }),
            );
          }}
        />
      )}

      <button
        type="button"
        onClick={aoAbrirHistorico}
        className="mt-3 text-sm text-tinta-2 hover:text-tinta"
      >
        Histórico de jejuns
      </button>
    </Cartao>
  );
}

/**
 * O bloco encolhido: só quanto tempo corre e desde que horas.
 *
 * A linha inteira expande, e não só a setinha — é um alvo grande de toque, que
 * no celular é a diferença entre acertar e errar.
 */
function Resumo({ jejum, aoExpandir }: { jejum: Jejum | null; aoExpandir: () => void }) {
  // Minuto a minuto: o número mostrado não tem segundos.
  const agora = useAgora(30_000);

  return (
    <button
      type="button"
      onClick={aoExpandir}
      aria-expanded={false}
      className="flex w-full items-center gap-3 text-left"
    >
      <span className="min-w-0 flex-1">
        {jejum === null ? (
          <span className="text-sm text-tinta-2">Nenhum jejum em andamento</span>
        ) : (
          <>
            <span className="tabular text-lg font-semibold tracking-tight">
              {formatarDuracao(duracaoSeg(jejum, agora))}
            </span>
            <span className="tabular ml-2 text-sm text-tinta-2">
              desde {formatarHora(jejum.inicio)}
              {jejum.dia !== diaLocal(agora) && ` de ${formatarDia(jejum.dia)}`}
            </span>
          </>
        )}
      </span>
      <Seta aberta={false} />
    </button>
  );
}

/** Encolhe o bloco. Quem expande é a linha inteira do resumo, não uma setinha. */
function BotaoMinimizar({ aoTocar }: { aoTocar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoTocar}
      aria-expanded={true}
      aria-label="Minimizar o jejum"
      className="-mt-1 -mr-1 p-1 text-tinta-3 hover:text-tinta-2"
    >
      <Seta aberta={true} />
    </button>
  );
}

/** A setinha. `aria-hidden` porque quem anuncia o estado é o botão em volta. */
function Seta({ aberta }: { aberta: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={"size-4 shrink-0 transition-transform " + (aberta ? "" : "rotate-180")}
    >
      <path
        d="M4 10l4-4 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cartao({ children, destacado }: { children: React.ReactNode; destacado?: boolean }) {
  return (
    <section
      className={
        "rounded-2xl border bg-superficie p-4 " + (destacado ? "border-destaque" : "border-borda")
      }
    >
      {children}
    </section>
  );
}

/**
 * O cronômetro do jejum em andamento.
 *
 * Bate de segundo em segundo com um estado próprio: o tique não pode rebuscar
 * nada do servidor nem derrubar o foco de um campo aberto em outro lugar da
 * página.
 */
function Cronometro({
  jejum,
  ocupado,
  aoParar,
}: {
  jejum: Jejum;
  ocupado: boolean;
  aoParar: () => void;
}) {
  // Segundo a segundo: aqui o relógio mostra os segundos.
  const agora = useAgora(1000);

  const seg = duracaoSeg(jejum, agora);
  const pct = progresso(jejum, agora);
  const faltam = faltamSeg(jejum, agora);
  const bateu = faltam !== null && faltam <= 0;

  return (
    <div className="text-center">
      <p className="text-sm text-tinta-2">
        Em jejum desde {formatarHora(jejum.inicio)}
        {jejum.dia !== diaLocal(agora) && ` de ${formatarDia(jejum.dia)}`}
      </p>

      <div className="tabular mt-1 text-5xl font-semibold tracking-tight">{formatarRelogio(seg)}</div>

      {pct !== null && (
        <>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-destaque-suave"
            role="progressbar"
            aria-valuenow={Math.round(pct * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da meta de jejum"
          >
            <div
              className="h-full rounded-full bg-serie transition-[width]"
              style={{ width: Math.min(100, pct * 100) + "%" }}
            />
          </div>
          <p className="mt-1.5 text-sm text-tinta-2">
            {bateu
              ? `Meta de ${formatarDuracao(jejum.metaMin! * 60)} batida — ${formatarDuracao(-faltam!)} além`
              : `Faltam ${formatarDuracao(faltam!)} para ${formatarDuracao(jejum.metaMin! * 60)}`}
          </p>
        </>
      )}

      <button
        type="button"
        onClick={aoParar}
        disabled={ocupado}
        className="mt-3 w-full rounded-xl bg-destaque py-3 font-medium text-sobre-destaque disabled:opacity-60"
      >
        {ocupado ? "Parando…" : "Parar jejum"}
      </button>
    </div>
  );
}

function Comecar({
  meta,
  aoEscolherMeta,
  ocupado,
  aoIniciar,
}: {
  meta: number | null;
  aoEscolherMeta: (min: number | null) => void;
  ocupado: boolean;
  aoIniciar: () => void;
}) {
  return (
    <div>
      <h2 className="font-medium">Jejum</h2>
      <p className="mt-0.5 text-sm text-tinta-2">Escolha a meta — ou nenhuma, se for jejum livre.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {METAS.map((m) => (
          <button
            key={m.rotulo}
            type="button"
            onClick={() => aoEscolherMeta(m.min)}
            aria-pressed={meta === m.min}
            className={
              "rounded-xl px-3 py-1.5 text-sm font-medium " +
              (meta === m.min ? "bg-destaque text-sobre-destaque" : "border border-borda text-tinta-2")
            }
          >
            {m.rotulo}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={aoIniciar}
        disabled={ocupado}
        className="mt-3 w-full rounded-xl bg-destaque py-3 font-medium text-sobre-destaque disabled:opacity-60"
      >
        {ocupado ? "Começando…" : "Iniciar jejum"}
      </button>
    </div>
  );
}

/**
 * O histórico de jejuns e o lançamento à mão, para viver dentro de uma modal.
 *
 * O formulário fica sempre aberto, como nos outros cadastros do WL: ele é o
 * estado de repouso da janela, e não algo que se abre.
 */
export function PainelJejum({ aoMudar }: { aoMudar?: () => void }) {
  const [jejuns, setJejuns] = useState<Jejum[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Jejum | null>(null);
  const [criados, setCriados] = useState(0);

  const carregar = useCallback(async () => {
    const ate = diaLocal();
    const de = new Date();
    de.setDate(de.getDate() - DIAS_DE_HISTORICO);
    try {
      setJejuns(await wlApi.jejuns(diaLocal(de), ate));
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

  if (erro && !jejuns) return <Aviso texto={erro} />;
  if (!jejuns) return <p className="text-tinta-3">Carregando…</p>;

  const dias = agruparPorDia(jejuns);

  return (
    <div className="space-y-4">
      {erro && <Aviso texto={erro} />}

      <FormJejum
        key={editando ? `jejum-${editando.id}` : `novo-${criados}`}
        jejum={editando}
        aoSalvar={async () => {
          if (!editando) setCriados((n) => n + 1);
          setEditando(null);
          await carregar();
          aoMudar?.();
        }}
        aoCancelar={editando ? () => setEditando(null) : undefined}
      />

      {dias.length === 0 ? (
        <p className="text-sm text-tinta-2">
          Nenhum jejum nos últimos {DIAS_DE_HISTORICO} dias.
        </p>
      ) : (
        dias.map((d) => (
          <section key={d.dia} className="rounded-2xl border border-borda bg-superficie">
            <div className="flex items-baseline justify-between gap-2 px-4 pt-4 pb-2">
              <h3 className="font-medium">{formatarDia(d.dia, true)}</h3>
              <span className="tabular text-sm text-tinta-2">
                {formatarDuracao(d.totalSeg)} em jejum
              </span>
            </div>
            <ul className="divide-y divide-borda">
              {d.jejuns.map((j) => (
                <li key={j.id}>
                  <LinhaJejum
                    jejum={j}
                    aoEditar={() => setEditando(j)}
                    aoApagar={() => {
                      const quanto = formatarDuracao(duracaoSeg(j));
                      if (confirm(`Apagar o jejum de ${formatarHora(j.inicio)} (${quanto})?`)) {
                        void mexer(() => wlApi.apagarJejum(j.id));
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function LinhaJejum({
  jejum,
  aoEditar,
  aoApagar,
}: {
  jejum: Jejum;
  aoEditar: () => void;
  aoApagar: () => void;
}) {
  const correndo = jejum.fim === null;
  const bateu = jejum.metaMin !== null && duracaoSeg(jejum) >= jejum.metaMin * 60;

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="tabular text-sm">
            <span className="text-tinta-2">
              {formatarHora(jejum.inicio)} → {correndo ? "agora" : formatarHora(jejum.fim!)}
            </span>
            <span className="ml-3 font-medium">{formatarDuracao(duracaoSeg(jejum))}</span>
          </div>
          <div className="text-xs text-tinta-3">
            {jejum.metaMin === null
              ? "livre"
              : `meta ${formatarDuracao(jejum.metaMin * 60)}${bateu ? " ✓" : ""}`}
            {correndo && " · em andamento"}
          </div>
        </div>
        <button type="button" onClick={aoEditar} className="text-sm text-tinta-2 hover:text-tinta">
          Editar
        </button>
        <button type="button" onClick={aoApagar} className="text-sm text-tinta-3 hover:text-perigo">
          Apagar
        </button>
      </div>
      {jejum.nota && <p className="mt-1 text-xs text-tinta-3">{jejum.nota}</p>}
    </div>
  );
}

/**
 * Lançar um jejum à mão, ou corrigir um existente.
 *
 * É o que salva quem dormiu e esqueceu de parar: em vez de apagar o registro
 * inteiro, acerta o horário.
 */
function FormJejum({
  jejum,
  aoSalvar,
  aoCancelar,
}: {
  jejum: Jejum | null;
  aoSalvar: () => Promise<void>;
  aoCancelar?: () => void;
}) {
  const [inicio, setInicio] = useState(() =>
    paraCampoLocal(jejum?.inicio ?? new Date().toISOString()),
  );
  const [fim, setFim] = useState(() => (jejum?.fim ? paraCampoLocal(jejum.fim) : ""));
  const [metaMin, setMetaMin] = useState<number | null>(jejum?.metaMin ?? METAS[0]!.min);
  const [nota, setNota] = useState(jejum?.nota ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!inicio) {
      setErro("Diga quando o jejum começou.");
      return;
    }
    const inicioIso = doCampoLocal(inicio);
    const fimIso = fim ? doCampoLocal(fim) : null;
    if (fimIso !== null && fimIso <= inicioIso) {
      setErro("O fim precisa vir depois do início.");
      return;
    }

    setSalvando(true);
    setErro(null);
    const corpo: JejumNovo = {
      // O dia é sempre o do início, e sai do campo preenchido — não de "hoje",
      // senão um jejum lançado depois cairia no dia errado.
      dia: inicio.slice(0, 10),
      inicio: inicioIso,
      fim: fimIso,
      metaMin,
      nota: nota.trim() || null,
    };
    try {
      if (jejum) await wlApi.salvarJejum(jejum.id, corpo);
      else await wlApi.criarJejum(corpo);
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
      className={"rounded-2xl border bg-superficie p-4 " + (jejum ? "border-destaque" : "border-borda")}
    >
      <h3 className="mb-3 font-medium">{jejum ? "Editar jejum" : "Lançar um jejum"}</h3>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-tinta-2">
          Começou
          <input
            type="datetime-local"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="mt-1 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-tinta outline-none focus:border-destaque"
          />
        </label>
        <label className="text-sm text-tinta-2">
          Terminou
          <input
            type="datetime-local"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="mt-1 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-tinta outline-none focus:border-destaque"
          />
          <span className="mt-0.5 block text-xs text-tinta-3">Em branco: ainda em andamento.</span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {METAS.map((m) => (
          <button
            key={m.rotulo}
            type="button"
            onClick={() => setMetaMin(m.min)}
            aria-pressed={metaMin === m.min}
            className={
              "rounded-xl px-3 py-1.5 text-sm font-medium " +
              (metaMin === m.min ? "bg-destaque text-sobre-destaque" : "border border-borda text-tinta-2")
            }
          >
            {m.rotulo}
          </button>
        ))}
      </div>

      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional)"
        maxLength={500}
        className="mt-3 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-sm outline-none focus:border-destaque"
      />

      {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="flex-1 rounded-xl bg-destaque py-2.5 font-medium text-sobre-destaque disabled:opacity-60"
        >
          {salvando ? "Salvando…" : jejum ? "Salvar" : "Adicionar"}
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
