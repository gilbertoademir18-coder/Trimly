import { useCallback, useEffect, useState } from "react";
import { wlApi } from "./api.ts";
import {
  formatarDia,
  formatarPontuacao,
  ordenarAcoes,
  pontosDoDia,
  pontosPossiveis,
  pontuarDia,
  type Acao,
  type Dia,
  type Refeicao,
} from "./calculos.ts";

/**
 * A nota de um dia e o que a forma: as ações marcadas e a refeição escolhida.
 *
 * Cada toque é um PUT que devolve o dia inteiro: a nota se atualiza sem uma
 * segunda viagem, e repetir a requisição com rede ruim é seguro — a mesma
 * decisão do PUT das pesagens.
 */
export function CartaoDoDia({
  dia,
  acoes,
  refeicoes,
  aoMudar,
  aoAbrirAcoes,
  aoAbrirRefeicoes,
}: {
  dia: string;
  acoes: Acao[];
  refeicoes: Refeicao[];
  aoMudar?: () => void;
  aoAbrirAcoes: () => void;
  aoAbrirRefeicoes: () => void;
}) {
  const [estado, setEstado] = useState<Dia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Guarda o que está em voo, para travar só o controle tocado.
  const [emVoo, setEmVoo] = useState<number | "refeicao" | null>(null);

  const carregar = useCallback(async () => {
    try {
      setEstado(await wlApi.dia(dia));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [dia]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ativas = ordenarAcoes(acoes.filter((a) => a.ativa));
  const refeicoesAtivas = refeicoes.filter((r) => r.ativa);

  async function mandar(chave: number | "refeicao", envio: Promise<Dia>) {
    setEmVoo(chave);
    try {
      setEstado(await envio);
      setErro(null);
      aoMudar?.();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEmVoo(null);
    }
  }

  if (erro && !estado) return <Cartao><p className="text-sm text-perigo">{erro}</p></Cartao>;
  if (!estado) return <Cartao><p className="text-sm text-tinta-3">Carregando…</p></Cartao>;

  if (ativas.length === 0 && refeicoesAtivas.length === 0) {
    return (
      <Cartao>
        <h2 className="font-medium">Pontuação do dia</h2>
        <p className="mt-2 text-sm text-tinta-2">
          Cadastre o que conta no seu dia para ele começar a ter nota. Ações positivas somam (beber
          água, treinar) e negativas descontam; as refeições do cardápio valem a que você escolher.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={aoAbrirAcoes}
            className="rounded-xl bg-destaque px-4 py-2 text-sm font-medium text-sobre-destaque"
          >
            Cadastrar ações
          </button>
          <button
            type="button"
            onClick={aoAbrirRefeicoes}
            className="rounded-xl border border-borda px-4 py-2 text-sm font-medium text-tinta-2"
          >
            Cadastrar refeições
          </button>
        </div>
      </Cartao>
    );
  }

  const pontos = pontosDoDia(estado);
  // Sem registro ainda, o dia não tem denominador gravado: a nota de hoje é a
  // que o cadastro de agora produziria, e é 0 enquanto nada for marcado.
  const nota = pontuarDia(pontos, estado.pontosPossiveis ?? pontosPossiveis(ativas, refeicoesAtivas));
  const quantidadeDe = (id: number) => estado.registros.find((r) => r.acaoId === id)?.quantidade ?? 0;

  return (
    <Cartao>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Pontuação do dia</h2>
          <p className="text-xs text-tinta-3">{formatarDia(dia, true)}</p>
        </div>
        <div className="text-right">
          <div className="tabular text-3xl font-semibold tracking-tight">
            {nota === null ? "—" : formatarPontuacao(nota)}
          </div>
          <div className="tabular text-xs text-tinta-3">{pontos} pts</div>
        </div>
      </div>

      {nota !== null && (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-destaque-suave"
          role="progressbar"
          aria-valuenow={Math.round(nota)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Pontuação do dia"
        >
          <div className="h-full rounded-full bg-serie transition-[width]" style={{ width: nota + "%" }} />
        </div>
      )}

      {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}

      <SeletorRefeicao
        refeicoes={refeicoesAtivas}
        escolhidaId={estado.refeicaoId}
        pontosNaEpoca={estado.refeicaoPontosNaEpoca}
        ocupado={emVoo === "refeicao"}
        aoEscolher={(id) => void mandar("refeicao", wlApi.escolherRefeicao(dia, id))}
        aoAbrirRefeicoes={aoAbrirRefeicoes}
      />

      {ativas.length > 0 && (
        <ul className="mt-1 divide-y divide-borda">
          {ativas.map((a) => (
            <li key={a.id}>
              <LinhaAcao
                acao={a}
                quantidade={quantidadeDe(a.id)}
                ocupado={emVoo === a.id}
                aoMarcar={(q) => void mandar(a.id, wlApi.marcar(dia, a.id, q))}
              />
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={aoAbrirAcoes} className="mt-3 text-sm text-tinta-2 hover:text-tinta">
        Gerenciar ações
      </button>
    </Cartao>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-borda bg-superficie p-4">{children}</section>;
}

/**
 * A refeição do dia, num seletor: só cabe uma, e é isso que um `select` diz
 * sozinho — com caixas de marcar, nada impediria marcar duas.
 */
function SeletorRefeicao({
  refeicoes,
  escolhidaId,
  pontosNaEpoca,
  ocupado,
  aoEscolher,
  aoAbrirRefeicoes,
}: {
  refeicoes: Refeicao[];
  escolhidaId: number | null;
  pontosNaEpoca: number | null;
  ocupado: boolean;
  aoEscolher: (id: number | null) => void;
  aoAbrirRefeicoes: () => void;
}) {
  if (refeicoes.length === 0) {
    return (
      <p className="mt-3 border-t border-borda pt-3 text-xs text-tinta-3">
        Sem refeições no cardápio.{" "}
        <button type="button" onClick={aoAbrirRefeicoes} className="underline hover:text-tinta-2">
          Cadastrar
        </button>
      </p>
    );
  }

  const escolhida = refeicoes.find((r) => r.id === escolhidaId) ?? null;

  return (
    <div className="mt-3 border-t border-borda pt-3">
      <div className="flex items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="block text-sm">Refeição do dia</span>
          <select
            value={escolhidaId ?? ""}
            disabled={ocupado}
            onChange={(e) => aoEscolher(e.target.value === "" ? null : Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-sm outline-none focus:border-destaque disabled:opacity-60"
          >
            <option value="">Nenhuma</option>
            {refeicoes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome} (+{r.pontos})
              </option>
            ))}
          </select>
        </label>
        {pontosNaEpoca !== null && (
          <span className="tabular shrink-0 pb-2 text-sm font-medium">+{pontosNaEpoca}</span>
        )}
      </div>
      {escolhida?.descricao && (
        // `whitespace-pre-line` porque o cardápio costuma ser escrito em
        // linhas, e um parágrafo corrido perderia essa estrutura.
        <p className="mt-1.5 text-xs whitespace-pre-line text-tinta-3">{escolhida.descricao}</p>
      )}
    </div>
  );
}

/**
 * Ação repetível vira contador; as demais, um botão que liga e desliga.
 *
 * Os dois caminhos mandam a mesma requisição — a diferença é só quantas vezes
 * cabe no dia, que é o que `repetivel` diz.
 */
function LinhaAcao({
  acao,
  quantidade,
  ocupado,
  aoMarcar,
}: {
  acao: Acao;
  quantidade: number;
  ocupado: boolean;
  aoMarcar: (quantidade: number) => void;
}) {
  const feita = quantidade > 0;
  const sinal = acao.pontos > 0 ? "+" : "−";
  const total = Math.round(Math.abs(acao.pontos) * quantidade * 100) / 100;

  return (
    <div className={"flex items-center gap-3 py-2.5 " + (ocupado ? "opacity-60" : "")}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{acao.nome}</div>
        <div className="tabular text-xs text-tinta-3">
          {sinal}
          {Math.abs(acao.pontos)} pts
          {acao.repetivel && " · alvo " + acao.alvoDiario + "×"}
          {feita && " · " + sinal + total + " hoje"}
        </div>
      </div>

      {acao.repetivel ? (
        <div className="flex items-center gap-1">
          <BotaoRedondo
            rotulo={"Tirar uma vez de " + acao.nome}
            desabilitado={ocupado || quantidade === 0}
            aoTocar={() => aoMarcar(quantidade - 1)}
          >
            −
          </BotaoRedondo>
          <span className="tabular w-6 text-center text-sm font-medium">{quantidade}</span>
          <BotaoRedondo
            rotulo={"Somar uma vez de " + acao.nome}
            desabilitado={ocupado || quantidade >= 99}
            aoTocar={() => aoMarcar(quantidade + 1)}
          >
            +
          </BotaoRedondo>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => aoMarcar(feita ? 0 : 1)}
          disabled={ocupado}
          aria-pressed={feita}
          className={
            "rounded-xl px-3 py-1.5 text-sm font-medium " +
            (feita ? "bg-destaque text-sobre-destaque" : "border border-borda text-tinta-2")
          }
        >
          {feita ? "Feito" : "Marcar"}
        </button>
      )}
    </div>
  );
}

function BotaoRedondo({
  children,
  rotulo,
  desabilitado,
  aoTocar,
}: {
  children: React.ReactNode;
  rotulo: string;
  desabilitado: boolean;
  aoTocar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoTocar}
      disabled={desabilitado}
      aria-label={rotulo}
      className="size-8 rounded-full border border-borda text-lg leading-none text-tinta-2 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
