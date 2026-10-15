import { useCallback, useEffect, useState } from "react";
import { wlApi } from "./api.ts";
import {
  faixaDaPontuacao,
  formatarMes,
  formatarPontuacao,
  mediaPontuacao,
  mudarMes,
  pontuarDia,
  semanasDoMes,
  type DiaResumido,
} from "./calculos.ts";
import { agruparPorDia, formatarDuracao, formatarDuracaoCurta } from "./jejum-calculos.ts";

const DIAS_DA_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

/*
 * A cor por faixa, e não por gradiente contínuo: numa grade de quadradinhos o
 * olho compara degraus, não tons. Vazio é a cor da grade — um dia sem registro
 * não é um dia ruim, é um dia sem dado.
 */
const CORES = [
  "bg-perigo/25",
  "bg-serie/20",
  "bg-serie/40",
  "bg-serie/65",
  "bg-serie",
] as const;

/**
 * O mês em quadradinhos, um por dia, com a cor puxando pela nota.
 *
 * Busca o próprio intervalo: o pai só diz qual dia está aberto e avisa quando
 * algo mudou (`versao`), para o calendário se redesenhar depois de um toque na
 * tela do dia.
 */
export function Calendario({
  hoje,
  selecionado,
  versao,
  aoSelecionar,
}: {
  hoje: string;
  selecionado: string;
  versao: number;
  aoSelecionar: (dia: string) => void;
}) {
  const [ano, setAno] = useState(() => Number(hoje.slice(0, 4)));
  const [mes, setMes] = useState(() => Number(hoje.slice(5, 7)));
  const [dias, setDias] = useState<DiaResumido[] | null>(null);
  /** Segundos de jejum por dia, somando os que começaram nele. */
  const [jejumPorDia, setJejumPorDia] = useState<Map<string, number>>(new Map());
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const semanas = semanasDoMes(ano, mes);
    const doMes = semanas.flat().filter((d): d is string => d !== null);
    const de = doMes[0]!;
    const ate = doMes.at(-1)!;
    try {
      // As duas viagens em paralelo: são independentes, e em série o calendário
      // piscaria duas vezes ao virar o mês.
      const [resumos, jejuns] = await Promise.all([wlApi.dias(de, ate), wlApi.jejuns(de, ate)]);
      setDias(resumos);
      /*
       * `agruparPorDia` é o mesmo agrupamento do histórico de jejuns: o dia é o
       * do início, mesmo quando o jejum atravessa a meia-noite, e dois jejuns
       * no mesmo dia somam. Calendário e histórico contando diferente seriam
       * dois números para a mesma pergunta.
       */
      setJejumPorDia(new Map(agruparPorDia(jejuns).map((d) => [d.dia, d.totalSeg])));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [ano, mes]);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  const porDia = new Map((dias ?? []).map((d) => [d.data, d]));
  // A média é do que já foi vivido: um dia futuro marcado de antemão é plano,
  // não resultado.
  const media = dias ? mediaPontuacao(dias.filter((d) => d.data <= hoje)) : null;

  function andar(passo: number) {
    const destino = mudarMes(ano, mes, passo);
    setAno(destino.ano);
    setMes(destino.mes);
  }

  function voltarParaHoje() {
    setAno(Number(hoje.slice(0, 4)));
    setMes(Number(hoje.slice(5, 7)));
    aoSelecionar(hoje);
  }

  // Os dias futuros abrem também — é onde se deixa o grupo escolhido e se
  // confere as ações antes de o dia chegar. Daí o atalho de volta para hoje.
  const longeDeHoje = selecionado !== hoje || hoje.slice(0, 7) !== `${ano}-${String(mes).padStart(2, "0")}`;

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-medium first-letter:uppercase">{formatarMes(ano, mes)}</h2>
        <div className="flex items-center gap-1">
          {longeDeHoje && (
            <button
              type="button"
              onClick={voltarParaHoje}
              className="h-8 rounded-full border border-borda px-3 text-xs text-tinta-2"
            >
              Hoje
            </button>
          )}
          <button
            type="button"
            onClick={() => andar(-1)}
            aria-label="Mês anterior"
            className="size-8 rounded-full border border-borda text-tinta-2"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => andar(1)}
            aria-label="Próximo mês"
            className="size-8 rounded-full border border-borda text-tinta-2"
          >
            ›
          </button>
        </div>
      </div>

      {erro && <p className="mb-2 text-sm text-perigo">{erro}</p>}

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-tinta-3">
        {DIAS_DA_SEMANA.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {semanasDoMes(ano, mes)
          .flat()
          .map((dia, i) => {
            if (!dia) return <div key={"vazio-" + i} />;

            const resumo = porDia.get(dia);
            const nota = resumo ? pontuarDia(resumo.pontos, resumo.pontosPossiveis) : null;
            const futuro = dia > hoje;
            const jejumSeg = jejumPorDia.get(dia) ?? null;

            // O que o mouse e o leitor de tela recebem: aqui cabe o número
            // cheio, que no quadradinho não caberia.
            const partes = [
              futuro ? "futuro" : nota === null ? "sem registro" : formatarPontuacao(nota),
              jejumSeg === null ? null : "jejum de " + formatarDuracao(jejumSeg),
            ].filter((p): p is string => p !== null);

            return (
              <button
                key={dia}
                type="button"
                onClick={() => aoSelecionar(dia)}
                title={partes.join(" · ")}
                aria-label={dia + ": " + partes.join(", ")}
                aria-current={dia === selecionado ? "date" : undefined}
                /*
                 * Três linhas empilhadas em vez do quadrado de antes: o número
                 * do dia, a nota e o jejum. `justify-start` e não `center` para
                 * os dias ficarem todos na mesma altura — centralizando, o
                 * número dançava conforme o dia tivesse uma linha ou três.
                 *
                 * O futuro fica só contornado: ainda não tem nota para pintar, e
                 * o quadradinho cheio de cinza diria "dia sem registro".
                 */
                className={
                  "tabular flex min-h-14 flex-col items-center justify-start gap-0.5 rounded-lg px-0.5 py-1 text-xs leading-none transition-colors " +
                  (futuro
                    ? "border border-dashed border-borda text-tinta-3"
                    : nota === null
                      ? "bg-grade text-tinta-3"
                      : CORES[faixaDaPontuacao(nota)]) +
                  (!futuro && nota !== null && faixaDaPontuacao(nota) === 4 ? " text-sobre-destaque" : "") +
                  (dia === selecionado ? " ring-2 ring-destaque" : "") +
                  (dia === hoje ? " font-semibold" : "")
                }
              >
                <span>{Number(dia.slice(8, 10))}</span>
                {/*
                  As duas linhas de baixo em 10px e com opacidade: elas são o
                  detalhe, e em tamanho cheio competiriam com o número do dia.
                  Dia sem o dado não ganha traço nenhum — a linha fica vazia, que
                  é mais quieto que uma grade cheia de "—".
                */}
                {nota !== null && (
                  <span className="text-[0.625rem] opacity-80">{formatarPontuacao(nota)}</span>
                )}
                {jejumSeg !== null && (
                  <span className="text-[0.625rem] opacity-70">
                    {formatarDuracaoCurta(jejumSeg)}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-tinta-3">
        <span>
          Média do mês:{" "}
          <span className="tabular font-medium text-tinta-2">
            {media === null ? "sem registros" : formatarPontuacao(media)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          pior
          {CORES.map((cor, i) => (
            <span key={i} className={"size-3 rounded " + cor} />
          ))}
          melhor
        </span>
      </div>
    </section>
  );
}
