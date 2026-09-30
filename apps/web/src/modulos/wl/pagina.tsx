import { useCallback, useEffect, useState } from "react";
import { wlApi } from "./api.ts";
import {
  diaLocal,
  filtrarPeriodo,
  formatarDia,
  formatarPeso,
  formatarVariacao,
  lerPeso,
  resumir,
  type Meta,
  type Periodo,
  type Pesagem,
} from "./calculos.ts";
import { GraficoPeso } from "./grafico.tsx";

export function PaginaWl() {
  const [pesagens, setPesagens] = useState<Pesagem[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Pesagem | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("90d");

  const carregar = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([wlApi.pesagens(), wlApi.meta()]);
      setPesagens(p);
      setMeta(m);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && !pesagens) return <Aviso texto={erro} />;
  if (!pesagens) return <p className="text-tinta-3">Carregando…</p>;

  const hoje = diaLocal();
  const resumo = resumir(pesagens, meta);
  const deHoje = pesagens.find((p) => p.data === hoje) ?? null;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">WL</h1>
      {erro && <Aviso texto={erro} />}

      <FormPesagem
        // Trocar a `key` remonta o formulário com os valores da pesagem
        // escolhida — mais simples que sincronizar estado com efeito.
        key={editando?.data ?? `hoje-${deHoje?.pesoKg ?? ""}`}
        inicial={editando ?? deHoje}
        hoje={hoje}
        aoSalvar={async () => {
          setEditando(null);
          await carregar();
        }}
        aoCancelar={editando ? () => setEditando(null) : undefined}
      />

      {resumo ? (
        <>
          <section className="grid grid-cols-2 gap-3">
            <Numero rotulo="Peso atual" valor={`${formatarPeso(resumo.atual.pesoKg)} kg`} detalhe={`em ${formatarDia(resumo.atual.data)}`} grande />
            <Numero
              rotulo="Desde o início"
              valor={`${formatarVariacao(resumo.variacao)} kg`}
              detalhe={`desde ${formatarDia(resumo.inicial.data, true)}`}
            />
            {resumo.faltam !== null && (
              <Numero
                rotulo={resumo.faltam > 0 ? "Faltam" : "Meta"}
                valor={resumo.faltam > 0 ? `${formatarPeso(resumo.faltam)} kg` : "Atingida"}
                detalhe={`meta de ${formatarPeso(meta!.pesoAlvo)} kg`}
              />
            )}
            {resumo.imc !== null && (
              <Numero rotulo="IMC" valor={resumo.imc.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} detalhe={`altura ${meta!.alturaCm} cm`} />
            )}
          </section>

          {resumo.progresso !== null && <BarraProgresso progresso={resumo.progresso} />}

          <section className="rounded-2xl border border-borda bg-superficie p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-medium">Evolução do peso (kg)</h2>
              <div className="flex rounded-full bg-fundo p-0.5 text-xs">
                {(["30d", "90d", "tudo"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriodo(p)}
                    className={`rounded-full px-2.5 py-1 ${periodo === p ? "bg-superficie font-medium shadow-sm" : "text-tinta-2"}`}
                  >
                    {p === "tudo" ? "Tudo" : p}
                  </button>
                ))}
              </div>
            </div>
            <GraficoPeso pesagens={filtrarPeriodo(pesagens, periodo, hoje)} pesoAlvo={meta?.pesoAlvo ?? null} />
          </section>

          <Historico pesagens={pesagens} aoEditar={setEditando} aoMudar={carregar} aoErro={setErro} />
        </>
      ) : (
        <p className="text-sm text-tinta-2">Registre a primeira pesagem para começar o acompanhamento.</p>
      )}

      <FormMeta meta={meta} aoSalvar={carregar} />
    </div>
  );
}

function FormPesagem({
  inicial,
  hoje,
  aoSalvar,
  aoCancelar,
}: {
  inicial: Pesagem | null;
  hoje: string;
  aoSalvar: () => Promise<void>;
  aoCancelar?: () => void;
}) {
  const [dia, setDia] = useState(inicial?.data ?? hoje);
  const [peso, setPeso] = useState(inicial ? formatarPeso(inicial.pesoKg) : "");
  const [nota, setNota] = useState(inicial?.nota ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const kg = lerPeso(peso);
    if (kg === null) {
      setErro("Digite o peso em kg, como 72,5.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await wlApi.salvarPesagem(dia, kg, nota.trim() || null);
      await aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const titulo = aoCancelar ? `Editar pesagem de ${formatarDia(dia, true)}` : inicial ? "Pesagem de hoje" : "Registrar peso";

  return (
    <form onSubmit={enviar} className="rounded-2xl border border-borda bg-superficie p-4">
      <h2 className="mb-3 font-medium">{titulo}</h2>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Peso em kg</span>
          <div className="flex items-center rounded-xl border border-borda bg-fundo px-3 focus-within:border-destaque">
            <input
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              inputMode="decimal"
              placeholder="72,5"
              autoComplete="off"
              className="tabular w-full bg-transparent py-2.5 text-lg outline-none"
            />
            <span className="text-tinta-3">kg</span>
          </div>
        </label>
        <input
          type="date"
          value={dia}
          max={hoje}
          onChange={(e) => setDia(e.target.value)}
          disabled={!!aoCancelar}
          aria-label="Dia da pesagem"
          className="rounded-xl border border-borda bg-fundo px-2 text-sm disabled:opacity-60"
        />
      </div>
      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional)"
        maxLength={500}
        className="mt-2 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-sm outline-none focus:border-destaque"
      />
      {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="flex-1 rounded-xl bg-destaque py-2.5 font-medium text-sobre-destaque disabled:opacity-60"
        >
          {salvando ? "Salvando…" : inicial ? "Atualizar" : "Salvar"}
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

function Numero({ rotulo, valor, detalhe, grande }: { rotulo: string; valor: string; detalhe: string; grande?: boolean }) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-4">
      <div className="text-sm text-tinta-2">{rotulo}</div>
      <div className={`tabular mt-1 font-semibold tracking-tight ${grande ? "text-3xl" : "text-2xl"}`}>{valor}</div>
      <div className="mt-0.5 text-xs text-tinta-3">{detalhe}</div>
    </div>
  );
}

function BarraProgresso({ progresso }: { progresso: number }) {
  const pct = Math.round(progresso * 100);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="text-tinta-2">Caminho até a meta</span>
        <span className="tabular font-medium">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-destaque-suave" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-serie transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Historico({
  pesagens,
  aoEditar,
  aoMudar,
  aoErro,
}: {
  pesagens: Pesagem[];
  aoEditar: (p: Pesagem) => void;
  aoMudar: () => Promise<void>;
  aoErro: (msg: string) => void;
}) {
  const [todas, setTodas] = useState(false);
  const recentes = [...pesagens].reverse();
  const visiveis = todas ? recentes : recentes.slice(0, 10);

  async function apagar(p: Pesagem) {
    if (!confirm(`Apagar a pesagem de ${formatarDia(p.data, true)} (${formatarPeso(p.pesoKg)} kg)?`)) return;
    try {
      await wlApi.apagarPesagem(p.data);
      await aoMudar();
    } catch (e) {
      aoErro((e as Error).message);
    }
  }

  return (
    <section className="rounded-2xl border border-borda bg-superficie">
      <h2 className="px-4 pt-4 pb-2 font-medium">Histórico</h2>
      <ul className="divide-y divide-borda">
        {visiveis.map((p, i) => {
          // A diferença é contra a pesagem anterior no tempo — a próxima da lista.
          const anterior = recentes[i + 1];
          return (
            <li key={p.data} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="tabular text-sm">
                  <span className="text-tinta-2">{formatarDia(p.data, true)}</span>
                  <span className="ml-3 font-medium">{formatarPeso(p.pesoKg)} kg</span>
                  {anterior && <span className="ml-2 text-xs text-tinta-3">{formatarVariacao(p.pesoKg - anterior.pesoKg)}</span>}
                </div>
                {p.nota && <div className="truncate text-xs text-tinta-3">{p.nota}</div>}
              </div>
              <button type="button" onClick={() => aoEditar(p)} className="text-sm text-tinta-2 hover:text-tinta">
                Editar
              </button>
              <button type="button" onClick={() => apagar(p)} className="text-sm text-tinta-3 hover:text-perigo">
                Apagar
              </button>
            </li>
          );
        })}
      </ul>
      {recentes.length > 10 && (
        <button type="button" onClick={() => setTodas(!todas)} className="w-full border-t border-borda py-2.5 text-sm text-tinta-2">
          {todas ? "Mostrar menos" : `Ver todas (${recentes.length})`}
        </button>
      )}
    </section>
  );
}

function FormMeta({ meta, aoSalvar }: { meta: Meta | null; aoSalvar: () => Promise<void> }) {
  const [alvo, setAlvo] = useState(meta ? formatarPeso(meta.pesoAlvo) : "");
  const [altura, setAltura] = useState(meta?.alturaCm ? String(meta.alturaCm) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const pesoAlvo = lerPeso(alvo);
    const alturaCm = altura.trim() ? Number(altura) : null;
    if (pesoAlvo === null) return setErro("Digite a meta em kg, como 75.");
    if (alturaCm !== null && !Number.isInteger(alturaCm)) return setErro("Altura em centímetros, sem vírgula: 175.");
    try {
      await wlApi.salvarMeta({ pesoAlvo, alturaCm });
      setErro(null);
      setSalvo(true);
      await aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    // Fechado quando já existe meta: é algo que se ajusta raramente, e aberto
    // ele empurraria o histórico para baixo todo dia.
    <details open={!meta} className="rounded-2xl border border-borda bg-superficie p-4">
      <summary className="cursor-pointer font-medium">Meta</summary>
      <form onSubmit={enviar} className="mt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-tinta-2">
            Peso alvo (kg)
            <input value={alvo} onChange={(e) => { setAlvo(e.target.value); setSalvo(false); }} inputMode="decimal" placeholder="75"
              className="tabular mt-1 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-tinta outline-none focus:border-destaque" />
          </label>
          <label className="text-sm text-tinta-2">
            Altura (cm, opcional)
            <input value={altura} onChange={(e) => { setAltura(e.target.value); setSalvo(false); }} inputMode="numeric" placeholder="175"
              className="tabular mt-1 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-tinta outline-none focus:border-destaque" />
          </label>
        </div>
        {erro && <p className="text-sm text-perigo">{erro}</p>}
        <button type="submit" className="w-full rounded-xl border border-borda py-2 text-sm font-medium">
          {salvo ? "Meta salva ✓" : "Salvar meta"}
        </button>
      </form>
    </details>
  );
}

function Aviso({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-perigo/40 bg-superficie p-3 text-sm text-perigo">{texto}</p>;
}
