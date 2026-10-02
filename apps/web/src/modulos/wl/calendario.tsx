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
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const semanas = semanasDoMes(ano, mes);
    const doMes = semanas.flat().filter((d): d is string => d !== null);
    try {
      setDias(await wlApi.dias(doMes[0]!, doMes.at(-1)!));
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

            return (
              <button
                key={dia}
                type="button"
                onClick={() => aoSelecionar(dia)}
                title={futuro ? "Dia futuro" : nota === null ? "Sem registro" : formatarPontuacao(nota)}
                aria-label={
                  dia + (futuro ? ": futuro" : nota === null ? ": sem registro" : ": " + formatarPontuacao(nota))
                }
                aria-current={dia === selecionado ? "date" : undefined}
                // O futuro fica só contornado: ainda não tem nota para pintar,
                // e o quadradinho cheio de cinza diria "dia sem registro".
                className={
                  "tabular aspect-square rounded-lg text-xs transition-colors " +
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
                {Number(dia.slice(8, 10))}
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
