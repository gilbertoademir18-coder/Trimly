import { useCallback, useEffect, useState } from "react";
import { wlApi } from "./api.ts";
import {
  formatarDia,
  formatarPontuacao,
  opcoesAtivas,
  ordenarAcoes,
  podeSomar,
  pontosPossiveis,
  pontuarDia,
  somarPontos,
  temOpcoes,
  type Acao,
  type Dia,
  type Registro,
} from "./calculos.ts";

/**
 * A nota de um dia e o que a forma: as ações marcadas.
 *
 * Cada toque é um PUT que devolve o dia inteiro: a nota se atualiza sem uma
 * segunda viagem, e repetir a requisição com rede ruim é seguro — a mesma
 * decisão do PUT das pesagens.
 */
export function CartaoDoDia({
  dia,
  acoes,
  versaoCadastro,
  aoMudar,
  aoAbrirAcoes,
}: {
  dia: string;
  acoes: Acao[];
  /** Sobe quando o cadastro muda, para o dia ser rebuscado já reprecificado. */
  versaoCadastro: number;
  aoMudar?: () => void;
  aoAbrirAcoes: () => void;
}) {
  const [estado, setEstado] = useState<Dia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Guarda qual ação está em voo, para travar só o controle tocado.
  const [emVoo, setEmVoo] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      setEstado(await wlApi.dia(dia));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [dia]);

  // Rebusca ao trocar de dia e quando o cadastro muda. Marcar uma ação não
  // entra aqui de propósito: o próprio PUT já devolve o dia pronto, e uma
  // segunda viagem só criaria corrida com a resposta que acabou de chegar.
  useEffect(() => {
    void carregar();
  }, [carregar, versaoCadastro]);

  const ativas = ordenarAcoes(acoes.filter((a) => a.ativa));

  async function marcar(acao: Acao, quantidade: number, opcaoId: number | null = null) {
    setEmVoo(acao.id);
    try {
      setEstado(await wlApi.marcar(dia, acao.id, quantidade, opcaoId));
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

  if (ativas.length === 0) {
    return (
      <Cartao>
        <h2 className="font-medium">Pontuação do dia</h2>
        <p className="mt-2 text-sm text-tinta-2">
          Cadastre o que conta no seu dia para ele começar a ter nota. Ações positivas somam (beber
          água, treinar) e negativas descontam. Uma ação também pode ter opções — "qual refeição?",
          "qual treino?" —, e aí você escolhe uma por dia.
        </p>
        <button
          type="button"
          onClick={aoAbrirAcoes}
          className="mt-3 rounded-xl bg-destaque px-4 py-2 text-sm font-medium text-sobre-destaque"
        >
          Cadastrar ações
        </button>
      </Cartao>
    );
  }

  const pontos = somarPontos(estado.registros);
  // Sem registro ainda, o dia não tem denominador gravado: a nota de hoje é a
  // que o cadastro de agora produziria, e é 0 enquanto nada for marcado.
  const nota = pontuarDia(pontos, estado.pontosPossiveis ?? pontosPossiveis(ativas));
  const registroDe = (id: number) => estado.registros.find((r) => r.acaoId === id) ?? null;

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

      <ul className="mt-3 divide-y divide-borda">
        {ativas.map((a) => (
          <li key={a.id}>
            <LinhaAcao
              acao={a}
              registro={registroDe(a.id)}
              ocupado={emVoo === a.id}
              aoMarcar={(q, opcaoId) => void marcar(a, q, opcaoId)}
            />
          </li>
        ))}
      </ul>

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
 * Uma ação na tela do dia, em um de três feitios:
 *
 *   com opções   um seletor — só cabe uma por dia, e é isso que um `select`
 *                diz sozinho; com caixas de marcar, nada impediria marcar duas
 *   repetível    um contador
 *   as demais    um botão que liga e desliga
 *
 * Os três mandam a mesma requisição; o que muda é o que cabe no dia.
 */
function LinhaAcao({
  acao,
  registro,
  ocupado,
  aoMarcar,
}: {
  acao: Acao;
  registro: Registro | null;
  ocupado: boolean;
  aoMarcar: (quantidade: number, opcaoId: number | null) => void;
}) {
  const quantidade = registro?.quantidade ?? 0;
  const feita = quantidade > 0;

  if (temOpcoes(acao)) {
    return <LinhaComOpcoes acao={acao} registro={registro} ocupado={ocupado} aoMarcar={aoMarcar} />;
  }

  // Sem opções os pontos são os da ação; `null` aqui só com cadastro corrompido.
  const pontos = acao.pontos ?? 0;
  const negativa = pontos < 0;
  // Laranja é "ainda falta". Quem decide é `podeSomar`, a mesma regra que a
  // ação com opções usa — e que deixa a negativa de fora.
  const pendente = podeSomar(acao) && quantidade === 0;
  const sinal = negativa ? "−" : "+";
  const total = Math.round(Math.abs(pontos) * quantidade * 100) / 100;

  return (
    <div className={"flex items-center gap-3 py-2.5 " + (ocupado ? "opacity-60" : "")}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{acao.nome}</div>
        <div className="tabular text-xs text-tinta-3">
          {sinal}
          {Math.abs(pontos)} pts
          {acao.repetivel && " · alvo " + acao.alvoDiario + "×"}
          {feita && " · " + sinal + total + " hoje"}
        </div>
      </div>

      {acao.repetivel ? (
        <div className="flex items-center gap-1">
          <BotaoRedondo
            rotulo={"Tirar uma vez de " + acao.nome}
            desabilitado={ocupado || quantidade === 0}
            aoTocar={() => aoMarcar(quantidade - 1, null)}
          >
            −
          </BotaoRedondo>
          <span className="tabular w-6 text-center text-sm font-medium">{quantidade}</span>
          <BotaoRedondo
            rotulo={"Somar uma vez de " + acao.nome}
            desabilitado={ocupado || quantidade >= 99}
            aoTocar={() => aoMarcar(quantidade + 1, null)}
          >
            +
          </BotaoRedondo>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => aoMarcar(feita ? 0 : 1, null)}
          disabled={ocupado}
          aria-pressed={feita}
          // Três estados, três cores: cheia para o que foi feito, contornada
          // laranja para a positiva que falta, e neutra para a negativa ainda
          // não cometida.
          //
          // Marcada, a ação negativa fica vermelha: ali o botão conta um
          // deslize, e pintá-lo da mesma cor de "beber água" diria que as duas
          // coisas são a mesma. (Diferente da variação de peso, que o app
          // mantém neutra de propósito — aquilo é oscilação, isto é escolha.)
          className={
            "rounded-xl px-3 py-1.5 text-sm font-medium " +
            (feita
              ? (negativa ? "bg-perigo" : "bg-destaque") + " text-sobre-destaque"
              : pendente
                ? "border border-atencao text-atencao"
                : "border border-borda text-tinta-2")
          }
        >
          {feita ? "Feito" : "Marcar"}
        </button>
      )}
    </div>
  );
}

/** A ação com opções: o seletor ocupa a linha de baixo, porque precisa de largura. */
function LinhaComOpcoes({
  acao,
  registro,
  ocupado,
  aoMarcar,
}: {
  acao: Acao;
  registro: Registro | null;
  ocupado: boolean;
  aoMarcar: (quantidade: number, opcaoId: number | null) => void;
}) {
  const opcoes = opcoesAtivas(acao);
  const escolhidaId = registro?.opcaoId ?? null;
  // Em "Nenhuma", o seletor fica laranja pelo mesmo motivo do botão "Marcar":
  // é uma escolha do dia que ainda não foi feita. A ação só de alternativas
  // ruins não entra — ali "Nenhuma" é exatamente o que se quer.
  const pendente = podeSomar(acao) && escolhidaId === null;

  return (
    <div className={"py-2.5 " + (ocupado ? "opacity-60" : "")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm">{acao.nome}</span>
        {registro && (
          <span className="tabular shrink-0 text-sm font-medium">
            {registro.pontosNaEpoca > 0 ? "+" : "−"}
            {Math.abs(registro.pontosNaEpoca)}
          </span>
        )}
      </div>

      <label>
        <span className="sr-only">{acao.nome}</span>
        <select
          value={escolhidaId ?? ""}
          disabled={ocupado}
          // Valor vazio é desmarcar: quantidade 0 apaga o registro do dia.
          onChange={(e) =>
            e.target.value === "" ? aoMarcar(0, null) : aoMarcar(1, Number(e.target.value))
          }
          className={
            "mt-1 w-full rounded-xl border bg-fundo px-3 py-2 text-sm outline-none focus:border-destaque disabled:opacity-60 " +
            (pendente ? "border-atencao text-atencao" : "border-borda")
          }
        >
          <option value="">Nenhuma</option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome} ({o.pontos > 0 ? "+" : "−"}
              {Math.abs(o.pontos)})
            </option>
          ))}
        </select>
      </label>
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
