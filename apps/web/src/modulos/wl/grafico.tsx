import { useEffect, useRef, useState } from "react";
import { formatarDia, formatarPeso, marcasDoEixo, type Pesagem } from "./calculos.ts";

const ALTURA = 220;
const MARGEM = { topo: 12, direita: 16, baixo: 26, esquerda: 36 };

/**
 * Evolução do peso: uma linha só, em SVG feito à mão.
 *
 * Sem biblioteca de gráfico de propósito: é uma série, um eixo e uma linha de
 * meta — umas 100 linhas contra algumas centenas de KB baixados no celular.
 *
 * O eixo X é proporcional ao tempo, não ao número de pesagens: duas pesagens
 * com uma semana entre elas ficam mais longe que duas em dias seguidos. Pular
 * a semana esconderia justamente o intervalo sem registro.
 *
 * Passar o dedo (ou o mouse) mostra a pesagem mais próxima: ninguém consegue
 * mirar uma linha de 2px, mas todo mundo consegue mirar uma data.
 */
export function GraficoPeso({ pesagens, pesoAlvo }: { pesagens: Pesagem[]; pesoAlvo: number | null }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [foco, setFoco] = useState<number | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const observador = new ResizeObserver(([e]) => setLargura(e!.contentRect.width));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  if (pesagens.length === 0) {
    return <p className="py-10 text-center text-sm text-tinta-3">Nenhuma pesagem neste período.</p>;
  }

  const tempos = pesagens.map((p) => Date.parse(p.data));
  const t0 = tempos[0]!;
  const t1 = tempos.at(-1)!;
  const pesos = pesagens.map((p) => p.pesoKg);
  // A meta entra na escala só se estiver perto: uma meta 15 kg abaixo
  // achataria a linha num risco sem relevo, e o relevo é o que se quer ler.
  const alvoVisivel = pesoAlvo !== null && pesoAlvo >= Math.min(...pesos) - 5 ? pesoAlvo : null;
  const marcas = marcasDoEixo(Math.min(...pesos, alvoVisivel ?? Infinity), Math.max(...pesos));
  const yMin = marcas[0]!;
  const yMax = marcas.at(-1)! === yMin ? yMin + 1 : marcas.at(-1)!;

  const areaL = Math.max(largura - MARGEM.esquerda - MARGEM.direita, 1);
  const areaA = ALTURA - MARGEM.topo - MARGEM.baixo;
  const x = (t: number) => MARGEM.esquerda + (t1 === t0 ? areaL / 2 : ((t - t0) / (t1 - t0)) * areaL);
  const y = (kg: number) => MARGEM.topo + (1 - (kg - yMin) / (yMax - yMin)) * areaA;

  const caminho = pesagens.map((p, i) => `${i ? "L" : "M"}${x(tempos[i]!)},${y(p.pesoKg)}`).join(" ");
  const ultimo = pesagens.length - 1;
  const destacado = foco ?? ultimo;
  const pd = pesagens[destacado]!;

  function aoMover(e: React.PointerEvent<SVGSVGElement>) {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let melhor = 0;
    for (let i = 1; i < tempos.length; i++) {
      if (Math.abs(x(tempos[i]!) - px) < Math.abs(x(tempos[melhor]!) - px)) melhor = i;
    }
    setFoco(melhor);
  }

  // Duas datas no eixo X (começo e fim) bastam: o resto está no toque.
  const rotulosX = t1 === t0 ? [0] : [0, ultimo];

  return (
    <div ref={caixa} className="relative select-none">
      {largura > 0 && (
        <svg
          width={largura}
          height={ALTURA}
          className="block touch-pan-y"
          onPointerMove={aoMover}
          onPointerDown={aoMover}
          onPointerLeave={() => setFoco(null)}
          role="img"
          aria-label={`Peso de ${formatarDia(pesagens[0]!.data, true)} a ${formatarDia(pesagens[ultimo]!.data, true)}`}
        >
          {marcas.map((m) => (
            <g key={m}>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(m)} y2={y(m)} className="stroke-grade" strokeWidth={1} />
              <text x={MARGEM.esquerda - 8} y={y(m)} dy="0.32em" textAnchor="end" className="tabular fill-tinta-3 text-[11px]">
                {Number.isInteger(m) ? m : formatarPeso(m)}
              </text>
            </g>
          ))}

          {alvoVisivel !== null && (
            <g>
              <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(alvoVisivel)} y2={y(alvoVisivel)} className="stroke-tinta-3" strokeWidth={1} />
              <text x={largura - MARGEM.direita} y={y(alvoVisivel) - 5} textAnchor="end" className="fill-tinta-2 text-[11px]">
                Meta {formatarPeso(alvoVisivel)} kg
              </text>
            </g>
          )}

          {rotulosX.map((i) => (
            <text
              key={i}
              x={x(tempos[i]!)}
              y={ALTURA - 6}
              textAnchor={i === 0 && rotulosX.length > 1 ? "start" : "end"}
              className="tabular fill-tinta-3 text-[11px]"
            >
              {formatarDia(pesagens[i]!.data)}
            </text>
          ))}

          <path d={caminho} fill="none" className="stroke-serie" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {foco !== null && (
            <line x1={x(tempos[foco]!)} x2={x(tempos[foco]!)} y1={MARGEM.topo} y2={ALTURA - MARGEM.baixo} className="stroke-tinta-3" strokeWidth={1} />
          )}
          {/* O anel na cor da superfície descola o ponto da linha que passa por baixo. */}
          <circle cx={x(tempos[destacado]!)} cy={y(pd.pesoKg)} r={5} className="fill-serie stroke-superficie" strokeWidth={2} />
        </svg>
      )}

      {foco !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-borda bg-superficie px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: Math.min(Math.max(x(tempos[foco]!) - 50, 0), largura - 100),
            width: 100,
          }}
        >
          <div className="tabular text-sm font-semibold">{formatarPeso(pd.pesoKg)} kg</div>
          <div className="text-tinta-2">{formatarDia(pd.data, true)}</div>
        </div>
      )}
    </div>
  );
}
