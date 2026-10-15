import { useCallback, useEffect, useState } from "react";
import { Modal } from "../../modal.tsx";
import { wlApi } from "./api.ts";
import { Aviso, CabecalhoInterno } from "./aviso.tsx";
import {
  diaLocal,
  diasDoProjeto,
  doCampoLocal,
  filtrarPeriodo,
  formatarDia,
  formatarDias,
  formatarHora,
  formatarPeso,
  formatarVariacao,
  lerPeso,
  ordenarProjetos,
  paraCampoLocal,
  periodoDoProjeto,
  pesagensDoProjeto,
  resumir,
  type Perfil,
  type Periodo,
  type Pesagem,
  type Projeto,
} from "./calculos.ts";
import { GraficoPeso } from "./grafico.tsx";

/**
 * Uma seleção na tela: um projeto, as pesagens fora de projeto, ou tudo.
 *
 * "Sem projeto" é item de primeira classe e não um resto: é lá que ficam as
 * pesagens importadas de outro app, esperando ser repartidas em projetos.
 */
type Selecao = { tipo: "projeto"; id: number } | { tipo: "sem" } | { tipo: "tudo" };

/**
 * O acompanhamento do peso: pesar, ver a evolução e cuidar dos projetos.
 *
 * Fica numa tela própria porque é um assunto com ritmo diferente do resto do
 * WL — pesa-se uma vez por dia, de manhã, e marca-se ação o dia inteiro.
 *
 * Tudo o que se vê é de UM projeto por vez: os números, o gráfico e o
 * histórico. É a razão de o projeto existir — comparar o peso de hoje com o de
 * três anos atrás, de outra tentativa e outra meta, não responde pergunta
 * nenhuma.
 */
export function PaginaPeso() {
  const [pesagens, setPesagens] = useState<Pesagem[] | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("90d");

  /*
   * A janela da pesagem: `null` fechada, `{ pesagem: null }` registro novo e
   * `{ pesagem }` a correção de uma que já existe.
   */
  const [edicao, setEdicao] = useState<{ pesagem: Pesagem | null } | null>(null);
  /** A janela do projeto, no mesmo feitio. */
  const [edicaoProjeto, setEdicaoProjeto] = useState<{ projeto: Projeto | null } | null>(null);

  /*
   * Qual projeto está sendo olhado. `null` enquanto não se sabe — a escolha
   * padrão só pode ser feita depois de a lista de projetos chegar, e começar
   * em "tudo" faria a tela piscar do panorama para o projeto a cada carga.
   */
  const [selecao, setSelecao] = useState<Selecao | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [ps, pjs, pf] = await Promise.all([
        wlApi.pesagens(),
        wlApi.projetos(),
        wlApi.perfil(),
      ]);
      setPesagens(ps);
      /*
       * Guardada já na ordem de exibição: do mais recente para o mais antigo,
       * pelo período. A API entrega por id (ordem de criação), que não serve —
       * os projetos reconstruídos do passado nasceram depois do atual.
       */
      const ordenados = ordenarProjetos(pjs, ps);
      setProjetos(ordenados);
      setPerfil(pf);
      setErro(null);
      /*
       * A escolha padrão é o projeto mais novo (a API entrega em ordem
       * decrescente de id). Sem projeto nenhum, cai em "sem projeto" se houver
       * pesagem solta, e em "tudo" se nem isso.
       *
       * Só na primeira carga: depois disso, recarregar não pode arrastar a
       * pessoa para outro projeto no meio do que ela estava olhando.
       */
      setSelecao((atual) => {
        if (atual !== null) return atual;
        // O primeiro da lista ORDENADA, que é o projeto mais recente — e não o
        // de id maior, que é só o último a ter sido criado.
        if (ordenados[0]) return { tipo: "projeto", id: ordenados[0].id };
        return ps.some((x) => x.projetoId === null) ? { tipo: "sem" } : { tipo: "tudo" };
      });
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro && !pesagens) return <Aviso texto={erro} />;
  if (!pesagens || selecao === null) return <p className="text-tinta-3">Carregando…</p>;

  const hoje = diaLocal();
  const projetoAberto =
    selecao.tipo === "projeto" ? (projetos.find((x) => x.id === selecao.id) ?? null) : null;

  /* As pesagens em foco: a lista inteira em "tudo", o recorte nas outras. */
  const emFoco =
    selecao.tipo === "tudo"
      ? pesagens
      : pesagensDoProjeto(pesagens, selecao.tipo === "sem" ? null : selecao.id);

  /*
   * O alvo é do projeto aberto. Em "sem projeto" e em "tudo" não há alvo: o que
   * se olha ali não é uma tentativa com objetivo, é um apanhado. O resumo
   * aguenta alvo nulo e devolve variação e IMC do mesmo jeito.
   */
  const resumo = resumir(emFoco, projetoAberto?.pesoAlvo ?? null, perfil?.alturaCm ?? null);
  const soltas = pesagens.filter((x) => x.projetoId === null).length;

  /*
   * De onde a janela do gráfico conta para trás: a última pesagem em foco.
   *
   * Não `hoje`. Num projeto encerrado em 2020, a janela de 90 dias do
   * calendário não pega pesagem nenhuma e o gráfico diz “nenhuma pesagem neste
   * período” tendo 24 delas em mão. Ancorada no fim dos dados, a janela
   * significa "os últimos 90 dias deste projeto" e nunca fica vazia.
   *
   * `hoje` só serve de reserva para a seleção sem pesagem nenhuma, onde não há
   * gráfico para desenhar de todo jeito.
   */
  const fimDoFoco = emFoco.at(-1)?.dia ?? hoje;

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

      <SeletorDeProjeto
        projetos={projetos}
        pesagens={pesagens}
        soltas={soltas}
        selecao={selecao}
        aoEscolher={setSelecao}
        aoNovoProjeto={() => setEdicaoProjeto({ projeto: null })}
      />

      {/*
        No desktop, duas colunas: à esquerda o que se digita e os números, à
        direita o gráfico e o histórico. No celular, a pilha de sempre — as
        colunas são `contents` ali, e o rodapé desce com `order-last`.
      */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          {resumo ? (
            <>
              <section className="grid grid-cols-2 gap-3">
                {/*
                  As duas pontas lado a lado e do mesmo tamanho: elas se leem como
                  um par, e destacar só uma desfaria a leitura.

                  O último vem primeiro. Ele é a resposta à pergunta que se faz ao
                  abrir a tela — em quanto estou, ou em quanto parei —, e o primeiro
                  peso é o contexto que a explica. Num idioma que se lê da esquerda
                  para a direita, o canto de cima à esquerda é onde o olho cai.

                  "Último peso" e não "Peso atual", que era o rótulo antigo: dos dez
                  projetos, nove terminaram há anos, e chamar de atual o peso de
                  junho de 2019 era simplesmente falso.

                  O ano vai nas duas datas. Sem ele, "em 30/06" num projeto de 2019
                  faria pensar neste ano.
                */}
                <Numero
                  rotulo="Último peso"
                  valor={`${formatarPeso(resumo.atual.pesoKg)} kg`}
                  detalhe={`em ${formatarDia(resumo.atual.dia, true)}`}
                  grande
                />
                <Numero
                  rotulo="Primeiro peso"
                  valor={`${formatarPeso(resumo.inicial.pesoKg)} kg`}
                  detalhe={`em ${formatarDia(resumo.inicial.dia, true)}`}
                  grande
                />
                {/*
                  O detalhe virou a duração, e não mais "desde tal dia": a data de
                  início agora está no card ao lado, e repeti-la aqui gastaria a
                  linha com o que já se vê. A duração diz EM QUANTO TEMPO a variação
                  aconteceu, que é o que falta para ela significar algo.
                */}
                <Numero
                  rotulo="Desde o início"
                  valor={`${formatarVariacao(resumo.variacao)} kg`}
                  detalhe={`em ${formatarDias(diasDoProjeto(emFoco)!)}`}
                />
                {resumo.faltam !== null && (
                  <Numero
                    rotulo={resumo.faltam > 0 ? "Faltam" : "Meta"}
                    valor={resumo.faltam > 0 ? `${formatarPeso(resumo.faltam)} kg` : "Atingida"}
                    detalhe={`meta de ${formatarPeso(projetoAberto!.pesoAlvo!)} kg`}
                  />
                )}
                {resumo.imc !== null && (
                  <Numero
                    rotulo="IMC"
                    valor={resumo.imc.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                    detalhe={`altura ${perfil!.alturaCm} cm`}
                  />
                )}
              </section>

              {resumo.progresso !== null && <BarraProgresso progresso={resumo.progresso} />}
            </>
          ) : (
            <p className="text-sm text-tinta-2">
              {selecao.tipo === "projeto"
                ? "Este projeto ainda não tem pesagem. Toque em “Registrar peso”."
                : "Nenhuma pesagem ainda. Toque em “Registrar peso” para começar."}
            </p>
          )}

          <div className="order-last flex flex-col gap-5 lg:order-none">
            {projetoAberto && (
              <CartaoProjeto
                projeto={projetoAberto}
                doProjeto={emFoco}
                aoEditar={() => setEdicaoProjeto({ projeto: projetoAberto })}
                aoApagar={async () => {
                  const r = await wlApi.apagarProjeto(projetoAberto.id);
                  /*
                   * As pesagens não vão embora com o projeto: voltam para "sem
                   * projeto". Levar a tela para lá é o que mostra isso de
                   * imediato, em vez de deixar a pessoa achar que perdeu tudo.
                   */
                  setSelecao(r.soltas > 0 ? { tipo: "sem" } : { tipo: "tudo" });
                  await carregar();
                  return r.soltas;
                }}
                aoErro={setErro}
              />
            )}
            <FormPerfil perfil={perfil} aoSalvar={carregar} />
          </div>
        </div>

        {resumo && (
          <div className="contents lg:flex lg:flex-col lg:gap-5">
            <section className="rounded-2xl border border-borda bg-superficie p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-medium">Evolução do peso (kg)</h2>
                {/*
                  O título diz de onde a janela conta, porque “30d” sozinho faz
                  pensar em calendário — e num projeto de 2019 seria enganoso.
                */}
                <div
                  className="flex rounded-full bg-fundo p-0.5 text-xs"
                  title={`Contados a partir da última pesagem (${formatarDia(fimDoFoco, true)})`}
                >
                  {(["30d", "90d", "tudo"] as const).map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => setPeriodo(x)}
                      className={`rounded-full px-2.5 py-1 ${periodo === x ? "bg-superficie font-medium shadow-sm" : "text-tinta-2"}`}
                    >
                      {x === "tudo" ? "Tudo" : x}
                    </button>
                  ))}
                </div>
              </div>
              <GraficoPeso
                pesagens={filtrarPeriodo(emFoco, periodo, fimDoFoco)}
                pesoAlvo={projetoAberto?.pesoAlvo ?? null}
              />
            </section>

            <Historico
              pesagens={emFoco}
              aoEditar={(pesagem) => setEdicao({ pesagem })}
              aoMudar={carregar}
              aoErro={setErro}
            />
          </div>
        )}
      </div>

      {/*
        O título da janela já diz se é registro ou correção — por isso o
        formulário não repete um cabeçalho dentro. O conteúdo é desmontado ao
        fechar (quem cuida disso é a `Modal`), então toda abertura começa limpa.
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
          projetos={projetos}
          /*
           * O projeto sugerido é o que está aberto na tela: quem olha um projeto
           * e toca em registrar quer lançar nele. Fora de um projeto não há o
           * que sugerir, e a pesagem nasce solta até alguém dizer onde ela entra.
           */
          projetoSugerido={projetoAberto?.id ?? null}
          hoje={hoje}
          aoSalvar={async () => {
            setEdicao(null);
            await carregar();
          }}
          aoCancelar={() => setEdicao(null)}
        />
      </Modal>

      <Modal
        aberto={edicaoProjeto !== null}
        titulo={edicaoProjeto?.projeto ? "Editar projeto" : "Novo projeto"}
        aoFechar={() => setEdicaoProjeto(null)}
      >
        <FormProjeto
          projeto={edicaoProjeto?.projeto ?? null}
          aoSalvar={async (salvo) => {
            setEdicaoProjeto(null);
            // Projeto novo passa a ser o que se olha: foi para usá-lo que ele
            // nasceu, e deixar a tela no antigo obrigaria a trocar à mão.
            setSelecao({ tipo: "projeto", id: salvo.id });
            await carregar();
          }}
          aoCancelar={() => setEdicaoProjeto(null)}
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
  projetos,
  projetoSugerido,
  hoje,
  aoSalvar,
  aoCancelar,
}: {
  /** `null` é registro novo; uma pesagem é a correção dela. */
  pesagem: Pesagem | null;
  projetos: Projeto[];
  /** O projeto que a tela está mostrando, oferecido no registro novo. */
  projetoSugerido: number | null;
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
  /*
   * Na correção vale o projeto que a pesagem já tem; no registro novo, o que a
   * tela está mostrando. O `??` não serve aqui: `projetoId` nulo é uma escolha
   * legítima (pesagem fora de projeto) e seria atropelado pela sugestão.
   */
  const [projetoId, setProjetoId] = useState<number | null>(
    pesagem ? pesagem.projetoId : projetoSugerido,
  );
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
        projetoId,
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
        O projeto da pesagem. A opção vazia é pesagem fora de projeto, que é
        estado legítimo e não um engano — é onde está o histórico importado.
      */}
      <label className="mt-2 block">
        <span className="mb-1 block text-sm text-tinta-2">Projeto</span>
        <select
          value={projetoId ?? ""}
          onChange={(e) => setProjetoId(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-sm outline-none focus:border-destaque"
        >
          <option value="">Sem projeto</option>
          {projetos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
              {x.pesoAlvo === null ? "" : ` (meta ${formatarPeso(x.pesoAlvo)} kg)`}
            </option>
          ))}
        </select>
      </label>

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
        // Vai junto porque o PUT grava a pesagem inteira: sem o projeto no
        // corpo, trocar a estrela soltaria a pesagem do projeto dela.
        projetoId: p.projetoId,
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

/**
 * A fila de projetos no alto da tela, com "Sem projeto" e "Tudo" no fim.
 *
 * Fichas numa fila que rola, e não um `<select>`: são poucos projetos e vê-los
 * todos de uma vez é o que mostra a forma do histórico — onde houve tentativa e
 * onde houve silêncio. Num seletor fechado isso só apareceria ao abrir.
 *
 * Cada ficha leva o período do projeto, calculado das pesagens dele. É o que
 * permite reconhecer um projeto sem lembrar o nome que se deu a ele.
 */
function SeletorDeProjeto({
  projetos,
  pesagens,
  soltas,
  selecao,
  aoEscolher,
  aoNovoProjeto,
}: {
  projetos: Projeto[];
  pesagens: Pesagem[];
  /** Quantas pesagens estão fora de projeto. Zero esconde a ficha. */
  soltas: number;
  selecao: Selecao;
  aoEscolher: (s: Selecao) => void;
  aoNovoProjeto: () => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {projetos.map((p) => {
        const doProjeto = pesagensDoProjeto(pesagens, p.id);
        const periodo = periodoDoProjeto(doProjeto);
        return (
          <Ficha
            key={p.id}
            ativa={selecao.tipo === "projeto" && selecao.id === p.id}
            aoClicar={() => aoEscolher({ tipo: "projeto", id: p.id })}
            titulo={p.nome}
            detalhe={
              periodo
                ? `${formatarDia(periodo.de, true)} → ${formatarDia(periodo.ate, true)}`
                : "sem pesagem ainda"
            }
            rodape={
              periodo
                ? `${formatarDias(diasDoProjeto(doProjeto)!)} · ${doProjeto.length} pesagens`
                : undefined
            }
          />
        );
      })}

      {soltas > 0 && (
        <Ficha
          ativa={selecao.tipo === "sem"}
          aoClicar={() => aoEscolher({ tipo: "sem" })}
          titulo="Sem projeto"
          detalhe={`${soltas} pesagens a repartir`}
        />
      )}

      <Ficha
        ativa={selecao.tipo === "tudo"}
        aoClicar={() => aoEscolher({ tipo: "tudo" })}
        titulo="Tudo"
        detalhe={`${pesagens.length} pesagens`}
      />

      <button
        type="button"
        onClick={aoNovoProjeto}
        className="shrink-0 rounded-xl border border-dashed border-borda px-3 py-2 text-sm text-tinta-2 hover:text-tinta"
      >
        + Projeto
      </button>
    </div>
  );
}

function Ficha({
  ativa,
  aoClicar,
  titulo,
  detalhe,
  rodape,
}: {
  ativa: boolean;
  aoClicar: () => void;
  titulo: string;
  detalhe: string;
  /*
   * Terceira linha, só nas fichas de projeto: duração e contagem.
   *
   * Linha própria e não emendada no `detalhe`: com o período inteiro mais a
   * duração mais a contagem, a ficha passava de 30 caracteres e virava uma
   * tira larga demais na fila que rola.
   */
  rodape?: string;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      // `aria-pressed` e não só a cor: para o leitor de tela, estas fichas são
      // um grupo de botões em que um está ligado — e a cor não é lida.
      aria-pressed={ativa}
      className={
        "shrink-0 rounded-xl border px-3 py-2 text-left " +
        (ativa ? "border-destaque bg-destaque-suave" : "border-borda bg-superficie")
      }
    >
      <div className="text-sm font-medium">{titulo}</div>
      <div className="tabular text-xs text-tinta-3">{detalhe}</div>
      {rodape && <div className="tabular text-xs text-tinta-3">{rodape}</div>}
    </button>
  );
}

/**
 * O cartão do projeto aberto: nome, meta, período e o que se pode fazer com ele.
 *
 * O período e a duração saem das pesagens (`periodoDoProjeto`, `diasDoProjeto`)
 * e não de campos — é a decisão que o schema registra: não há datas cadastradas
 * para discordarem dos dados.
 */
function CartaoProjeto({
  projeto,
  doProjeto,
  aoEditar,
  aoApagar,
  aoErro,
}: {
  projeto: Projeto;
  doProjeto: Pesagem[];
  aoEditar: () => void;
  /** Apaga e devolve quantas pesagens ficaram soltas, para o aviso. */
  aoApagar: () => Promise<number>;
  aoErro: (msg: string) => void;
}) {
  const [apagando, setApagando] = useState(false);
  const periodo = periodoDoProjeto(doProjeto);
  const dias = diasDoProjeto(doProjeto);

  async function apagar() {
    /*
     * O aviso diz o que acontece com as pesagens, porque é a dúvida que
     * aparece na hora: apagar o projeto não apaga o histórico, solta ele.
     */
    const quantas = doProjeto.length;
    const texto =
      quantas === 0
        ? `Apagar o projeto “${projeto.nome}”?`
        : `Apagar o projeto “${projeto.nome}”?\n\nAs ${quantas} pesagens dele NÃO serão apagadas: voltam para “Sem projeto” e podem ser reagrupadas depois.`;
    if (!confirm(texto)) return;

    setApagando(true);
    try {
      await aoApagar();
    } catch (e) {
      aoErro((e as Error).message);
    } finally {
      setApagando(false);
    }
  }

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate font-medium">{projeto.nome}</h2>
        <span className="tabular shrink-0 text-sm text-tinta-2">
          {projeto.pesoAlvo === null
            ? "sem meta"
            : `meta ${formatarPeso(projeto.pesoAlvo)} kg`}
        </span>
      </div>

      <div className="tabular mt-1 text-xs text-tinta-3">
        {periodo
          ? `${formatarDia(periodo.de, true)} → ${formatarDia(periodo.ate, true)} · ${formatarDias(dias!)} · ${doProjeto.length} pesagens`
          : "Nenhuma pesagem ainda."}
      </div>

      {projeto.nota && <p className="mt-2 text-sm text-tinta-2">{projeto.nota}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={aoEditar}
          className="rounded-xl border border-borda px-3 py-1.5 text-sm text-tinta-2 hover:text-tinta"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => void apagar()}
          disabled={apagando}
          className="rounded-xl px-3 py-1.5 text-sm text-tinta-3 hover:text-perigo disabled:opacity-50"
        >
          {apagando ? "Apagando…" : "Apagar"}
        </button>
      </div>
    </section>
  );
}

/** O cadastro de um projeto, dentro da janela. */
function FormProjeto({
  projeto,
  aoSalvar,
  aoCancelar,
}: {
  projeto: Projeto | null;
  /** Recebe o projeto salvo, para a tela poder passar a olhá-lo. */
  aoSalvar: (salvo: Projeto) => Promise<void>;
  aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(projeto?.nome ?? "");
  const [alvo, setAlvo] = useState(projeto?.pesoAlvo ? formatarPeso(projeto.pesoAlvo) : "");
  const [nota, setNota] = useState(projeto?.nota ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return setErro("Diga o nome do projeto.");
    /*
     * Campo vazio é "sem meta", e é válido: projeto reconstruído do passado
     * pode não ter tido objetivo declarado. Só texto que não é peso é erro.
     */
    const pesoAlvo = alvo.trim() ? lerPeso(alvo) : null;
    if (alvo.trim() && pesoAlvo === null) return setErro("Digite a meta em kg, como 75.");

    setSalvando(true);
    setErro(null);
    try {
      const dados = { nome: nome.trim(), pesoAlvo, nota: nota.trim() || null };
      const salvo = projeto
        ? await wlApi.salvarProjeto(projeto.id, dados)
        : await wlApi.criarProjeto(dados);
      await aoSalvar(salvo);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    // Sem moldura nem título próprios: a janela que o abriga já tem as duas.
    <form onSubmit={enviar} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-tinta-2">Nome</span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Verão 2027"
          maxLength={80}
          // Sem um `autofocus` à vista, o `showModal()` entrega o foco ao × de
          // fechar — começar com o dedo no botão de desistir é estranho.
          autoFocus
          className="w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 outline-none focus:border-destaque"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-tinta-2">Meta de peso (kg, opcional)</span>
        <input
          value={alvo}
          onChange={(e) => setAlvo(e.target.value)}
          inputMode="decimal"
          placeholder="75"
          className="tabular w-full rounded-xl border border-borda bg-fundo px-3 py-2.5 outline-none focus:border-destaque"
        />
        {/*
          A meta é de cada projeto, e vale lembrar: a de 2019 não precisa ser a
          de hoje, e é justamente por isso que ela mora aqui e não no perfil.
        */}
        <span className="mt-1 block text-xs text-tinta-3">
          Vale só para este projeto. Em branco, o projeto fica sem meta — a
          variação e o IMC continuam, só não há o que faltar.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-tinta-2">Nota (opcional)</span>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Depois da cirurgia, com acompanhamento"
          maxLength={500}
          className="w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-sm outline-none focus:border-destaque"
        />
      </label>

      {erro && <p className="text-sm text-perigo">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={salvando}
          className="flex-1 rounded-xl bg-destaque py-2.5 font-medium text-sobre-destaque disabled:opacity-60"
        >
          {salvando ? "Salvando…" : projeto ? "Salvar" : "Criar projeto"}
        </button>
        <button
          type="button"
          onClick={aoCancelar}
          className="rounded-xl border border-borda px-4 text-tinta-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * A altura, que é da pessoa e não de projeto nenhum.
 *
 * Era o `FormMeta` e cuidava também do peso alvo. O alvo virou campo de cada
 * projeto; aqui ficou só o que o IMC precisa.
 */
function FormPerfil({
  perfil,
  aoSalvar,
}: {
  perfil: Perfil | null;
  aoSalvar: () => Promise<void>;
}) {
  const [altura, setAltura] = useState(perfil?.alturaCm ? String(perfil.alturaCm) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const alturaCm = altura.trim() ? Number(altura) : null;
    if (alturaCm !== null && !Number.isInteger(alturaCm)) {
      return setErro("Altura em centímetros, sem vírgula: 175.");
    }
    try {
      await wlApi.salvarPerfil({ alturaCm });
      setErro(null);
      setSalvo(true);
      await aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    // Fechado quando já há altura: muda uma vez na vida, e aberto ele
    // empurraria o resto da coluna para baixo todo dia.
    <details open={!perfil?.alturaCm} className="rounded-2xl border border-borda bg-superficie p-4">
      <summary className="cursor-pointer font-medium">Perfil</summary>
      <form onSubmit={enviar} className="mt-3 space-y-2">
        <label className="block text-sm text-tinta-2">
          Altura (cm, opcional — é o que o IMC usa)
          <input
            value={altura}
            onChange={(e) => {
              setAltura(e.target.value);
              setSalvo(false);
            }}
            inputMode="numeric"
            placeholder="175"
            className="tabular mt-1 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-tinta outline-none focus:border-destaque"
          />
        </label>
        {erro && <p className="text-sm text-perigo">{erro}</p>}
        <button type="submit" className="w-full rounded-xl border border-borda py-2 text-sm font-medium">
          {salvo ? "Perfil salvo ✓" : "Salvar perfil"}
        </button>
      </form>
    </details>
  );
}
