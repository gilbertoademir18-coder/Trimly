import { useCallback, useEffect, useState } from "react";
import { Modal } from "../../modal.tsx";
import { wlApi } from "./api.ts";
import { Aviso, CabecalhoInterno } from "./aviso.tsx";
import {
  diaLocal,
  doCampoLocal,
  filtrarPeriodo,
  formatarDia,
  formatarPeso,
  formatarVariacao,
  formatarHora,
  lerPeso,
  paraCampoLocal,
  resumir,
  type Meta,
  type Periodo,
  type Pesagem,
} from "./calculos.ts";
import { GraficoPeso } from "./grafico.tsx";

/**
 * O acompanhamento do peso: pesar, ver a evolução e ajustar a meta.
 *
 * Fica numa tela própria porque é um assunto com ritmo diferente do resto do
 * WL — pesa-se uma vez por dia, de manhã, e marca-se ação o dia inteiro.
 * Juntas, as duas coisas davam uma rolagem longa demais no celular.
 */
export function PaginaPeso() {
  const [pesagens, setPesagens] = useState<Pesagem[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /*
   * A janela do formulário: `null` é fechada, `{ pesagem: null }` é um
   * registro novo e `{ pesagem }` é a correção de uma que já existe.
   *
   * Um estado só, e não um par "aberta?" + "qual pesagem?": com dois, dava
   * para escrever o par impossível (fechada com pesagem dentro, aberta sem
   * nada) e a janela abriria vazia quando devia corrigir.
   */
  const [edicao, setEdicao] = useState<{ pesagem: Pesagem | null } | null>(null);
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

  return (
    <div className="space-y-5">
      <CabecalhoInterno titulo="Peso">
        <button
          type="button"
          onClick={() => setEdicao({ pesagem: null })}
          className="rounded-xl bg-destaque px-4 py-2 text-sm font-medium text-sobre-destaque"
        >
          Registrar peso
        </button>
      </CabecalhoInterno>
      {erro && <Aviso texto={erro} />}

      {/*
        No desktop, duas colunas: à esquerda o que se digita e os números, à
        direita o gráfico e o histórico. No celular, a pilha de sempre — as
        colunas são `contents` ali, e a meta desce para o fim com `order-last`.
      */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          {resumo ? (
            <>
              <section className="grid grid-cols-2 gap-3">
                <Numero rotulo="Peso atual" valor={`${formatarPeso(resumo.atual.pesoKg)} kg`} detalhe={`em ${formatarDia(resumo.atual.dia)}`} grande />
                <Numero
                  rotulo="Desde o início"
                  valor={`${formatarVariacao(resumo.variacao)} kg`}
                  detalhe={`desde ${formatarDia(resumo.inicial.dia, true)}`}
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
            </>
          ) : (
            <p className="text-sm text-tinta-2">
              Nenhuma pesagem ainda. Toque em “Registrar peso” para começar o acompanhamento.
            </p>
          )}

          <div className="order-last lg:order-none">
            <FormMeta meta={meta} aoSalvar={carregar} />
          </div>
        </div>

        {resumo && (
          <div className="contents lg:flex lg:flex-col lg:gap-5">
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

            <Historico
              pesagens={pesagens}
              aoEditar={(pesagem) => setEdicao({ pesagem })}
              aoMudar={carregar}
              aoErro={setErro}
            />
          </div>
        )}
      </div>

      {/*
        O título da janela já diz se é registro ou correção — por isso o
        formulário não repete um cabeçalho dentro.

        A largura `normal` (32rem) basta: são três campos numa coluna.

        O conteúdo é desmontado ao fechar (quem cuida disso é a `Modal`), então
        toda abertura começa limpa. É o que dispensou a `key` que remontava o
        formulário à mão quando ele vivia fixo na página.
      */}
      <Modal
        aberto={edicao !== null}
        titulo={
          edicao?.pesagem
            ? `Editar pesagem de ${formatarDia(edicao.pesagem.dia, true)} às ${formatarHora(edicao.pesagem.medidoEm)}`
            : "Registrar peso"
        }
        aoFechar={() => setEdicao(null)}
      >
        <FormPesagem
          pesagem={edicao?.pesagem ?? null}
          hoje={hoje}
          aoSalvar={async () => {
            setEdicao(null);
            await carregar();
          }}
          aoCancelar={() => setEdicao(null)}
        />
      </Modal>
    </div>
  );
}

/**
 * O formulário de uma pesagem, dentro da janela.
 *
 * Dois feitios, e quem separa é `pesagem`: `null` é registro novo (POST),
 * uma pesagem é a correção dela (PUT no id).
 *
 * Nada fica travado nos dois casos — nem o dia, nem a hora. O dia deixou de
 * ser a identidade do registro quando o id chegou, então mudá-lo agora move a
 * pesagem de verdade, em vez de criar outra e deixar a antiga para trás.
 *
 * O campo é um `datetime-local` só, e não dia e hora separados: a hora é o
 * que ordena as várias pesagens de um mesmo dia, então ela é parte do mesmo
 * dado, não um extra. Começa em "agora", que é o caso de quem acabou de subir
 * na balança; mexer nela é o caminho para lançar a pesagem de ontem que ficou
 * esquecida.
 */
function FormPesagem({
  pesagem,
  hoje,
  aoSalvar,
  aoCancelar,
}: {
  /** `null` é registro novo; uma pesagem é a correção dela. */
  pesagem: Pesagem | null;
  hoje: string;
  aoSalvar: () => Promise<void>;
  aoCancelar: () => void;
}) {
  /*
   * O instante vive no feitio do campo ("2026-10-15T06:13", hora local) e só
   * virá ISO na hora de enviar. Guardar ISO aqui obrigaria a converter nos dois
   * sentidos a cada tecla, e é nessa ida e volta que o fuso se perde.
   */
  const [quando, setQuando] = useState(() =>
    paraCampoLocal(pesagem?.medidoEm ?? new Date().toISOString()),
  );
  const [peso, setPeso] = useState(pesagem ? formatarPeso(pesagem.pesoKg) : "");
  const [padronizada, setPadronizada] = useState(pesagem?.padronizada ?? true);
  const [nota, setNota] = useState(pesagem?.nota ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const kg = lerPeso(peso);
    if (kg === null) {
      setErro("Digite o peso em kg, como 72,5.");
      return;
    }
    if (!quando) {
      setErro("Diga quando foi a pesagem.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      /*
       * O dia sai do próprio campo, cortando os dez primeiros caracteres do
       * texto local ("2026-10-15T06:13" → "2026-10-15").
       *
       * Daqui e não do ISO: `new Date(…).toISOString().slice(0, 10)` daria o dia
       * em UTC, e uma pesagem às 22h de Brasília cairia no dia seguinte. O que o
       * campo mostra é o dia que a pessoa quis dizer.
       */
      const dados = {
        dia: quando.slice(0, 10),
        medidoEm: doCampoLocal(quando),
        pesoKg: kg,
        padronizada,
        nota: nota.trim() || null,
      };
      await (pesagem ? wlApi.salvarPesagem(pesagem.id, dados) : wlApi.criarPesagem(dados));
      await aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    // Sem moldura nem título próprios: a janela que o abriga já tem as duas, e
    // repeti-las dava caixa dentro de caixa com o título escrito duas vezes.
    <form onSubmit={enviar}>
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
              // Sem um `autofocus` à vista, o `showModal()` entrega o foco ao
              // primeiro focável da janela, que é o × de fechar — e começar com
              // o dedo no botão de desistir é estranho.
              autoFocus
              className="tabular w-full bg-transparent py-2.5 text-lg outline-none"
            />
            <span className="text-tinta-3">kg</span>
          </div>
        </label>
        {/*
          `max` no fim do dia de hoje e não em `hoje` seco: o atributo compara o
          valor inteiro, e "2026-10-15" como teto recusaria qualquer hora de hoje
          que não fosse meia-noite.
        */}
        <input
          type="datetime-local"
          value={quando}
          max={`${hoje}T23:59`}
          onChange={(e) => setQuando(e.target.value)}
          aria-label="Quando foi a pesagem"
          className="rounded-xl border border-borda bg-fundo px-2 text-sm"
        />
      </div>
      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional)"
        maxLength={500}
        className="mt-2 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-sm outline-none focus:border-destaque"
      />
      {/*
        As condições vão escritas embaixo, e não só no nome do campo: "padronizada"
        não lembra a ninguém quais são as cinco, e é justamente na hora de marcar
        que a lista importa.
      */}
      <label className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          checked={padronizada}
          onChange={(e) => setPadronizada(e.target.checked)}
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="text-sm">
          <span aria-hidden="true" className="text-destaque">
            ★
          </span>{" "}
          Pesagem padronizada
          <span className="block text-xs text-tinta-3">
            De manhã, depois do banheiro, sem ter comido, sem roupa e na mesma balança.
          </span>
        </span>
      </label>
      {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="flex-1 rounded-xl bg-destaque py-2.5 font-medium text-sobre-destaque disabled:opacity-60"
        >
          {salvando ? "Salvando…" : pesagem ? "Atualizar" : "Salvar"}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-xl border border-borda px-4 text-tinta-2">
          Cancelar
        </button>
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
  /*
   * Qual linha está indo para o servidor, pelo id da pesagem.
   *
   * Um id e não um booleano: com um booleano, clicar numa estrela travaria
   * todas as outras. Aqui só a linha em viagem fica surda ao clique, que é o
   * que evita dois PUTs na mesma pesagem se o dedo bater duas vezes.
   */
  const [salvando, setSalvando] = useState<number | null>(null);
  const recentes = [...pesagens].reverse();
  const visiveis = todas ? recentes : recentes.slice(0, 10);

  /**
   * Liga e desliga o "padronizada" de uma pesagem, direto na lista.
   *
   * Vai o registro inteiro com o campo trocado, e não só o campo: a API grava
   * a pesagem toda (`CorpoPesagem` exige o peso), então mandar só o
   * `padronizada` perderia o peso e a nota. É a mesma ideia do arquivar das
   * ações — a edição de sempre, com um campo diferente.
   */
  async function alternar(p: Pesagem) {
    setSalvando(p.id);
    try {
      await wlApi.salvarPesagem(p.id, {
        dia: p.dia,
        medidoEm: p.medidoEm,
        pesoKg: p.pesoKg,
        padronizada: !p.padronizada,
        nota: p.nota,
      });
      await aoMudar();
    } catch (e) {
      aoErro((e as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  async function apagar(p: Pesagem) {
    const quando = `${formatarDia(p.dia, true)} às ${formatarHora(p.medidoEm)}`;
    if (!confirm(`Apagar a pesagem de ${quando} (${formatarPeso(p.pesoKg)} kg)?`)) return;
    try {
      await wlApi.apagarPesagem(p.id);
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
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <Estrela
                pesagem={p}
                salvando={salvando === p.id}
                aoAlternar={() => void alternar(p)}
              />
              <div className="min-w-0 flex-1">
                <div className="tabular text-sm">
                  <span className="text-tinta-2">{formatarDia(p.dia, true)}</span>
                  {/*
                    A hora, sempre. Antes não existia porque havia uma pesagem por
                    dia e ela não distinguia nada; agora é ela que diz qual é qual
                    quando o dia tem duas.
                  */}
                  <span className="ml-1.5 text-xs text-tinta-3">{formatarHora(p.medidoEm)}</span>
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

/**
 * A estrela que liga e desliga o "padronizada" de uma pesagem.
 *
 * Cheia é padronizada, vazia é fora do padrão — o par ★/☆ do favoritar, que
 * é onde a ideia foi buscada: vê-se o estado e muda-se no mesmo toque, sem
 * abrir a janela de edição.
 *
 * `aria-pressed` e não um texto que muda: para o leitor de tela isto é um
 * botão que está ligado ou desligado, e é esse o par que ele anuncia. O
 * glifo fica `aria-hidden` porque "estrela branca" não diz nada de útil.
 */
function Estrela({
  pesagem,
  salvando,
  aoAlternar,
}: {
  pesagem: Pesagem;
  salvando: boolean;
  aoAlternar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoAlternar}
      disabled={salvando}
      aria-pressed={pesagem.padronizada}
      aria-label={`Pesagem padronizada em ${formatarDia(pesagem.dia, true)} às ${formatarHora(pesagem.medidoEm)}`}
      title={
        pesagem.padronizada
          ? "Pesagem padronizada: de manhã, depois do banheiro, sem ter comido, sem roupa, na mesma balança. Clique para marcar como fora do padrão."
          : "Fora do padrão: este número não compara com os outros. Clique para marcar como padronizada."
      }
      // Caixa de tamanho fixo, com o glifo centrado: ★ e ☆ não têm a mesma
      // largura em toda fonte, e sem isso a linha toda dançava de lado a cada
      // troca. As 2rem também dão um alvo de dedo decente — o glifo sozinho
      // tem uns 11px de área clicável, que no celular é pedir para errar.
      className={
        "flex size-8 shrink-0 items-center justify-center rounded text-lg leading-none disabled:opacity-40 " +
        (pesagem.padronizada ? "text-destaque" : "text-tinta-3 hover:text-tinta-2")
      }
    >
      <span aria-hidden="true">{pesagem.padronizada ? "★" : "☆"}</span>
    </button>
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
