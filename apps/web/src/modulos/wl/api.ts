import { api } from "../../api.ts";
import type { Acao, Dia, DiaResumido, Meta, Pesagem, Refeicao } from "./calculos.ts";
import type { Jejum } from "./jejum-calculos.ts";

/** O que o cadastro envia: tudo menos o id, que é do banco. */
export type AcaoNova = Omit<Acao, "id">;
export type RefeicaoNova = Omit<Refeicao, "id">;
/** O que o formulário de jejum manda. Instantes em ISO; o dia, em `AAAA-MM-DD`. */
export type JejumNovo = Omit<Jejum, "id">;

export const wlApi = {
  pesagens: () => api<Pesagem[]>("/wl/pesagens"),
  salvarPesagem: (dia: string, pesoKg: number, nota: string | null) =>
    api<Pesagem>(`/wl/pesagens/${dia}`, { method: "PUT", corpo: { pesoKg, nota } }),
  apagarPesagem: (dia: string) => api<void>(`/wl/pesagens/${dia}`, { method: "DELETE" }),
  meta: () => api<Meta | null>("/wl/meta"),
  salvarMeta: (meta: Meta) => api<Meta>("/wl/meta", { method: "PUT", corpo: meta }),

  acoes: () => api<Acao[]>("/wl/acoes"),
  criarAcao: (acao: AcaoNova) => api<Acao>("/wl/acoes", { method: "POST", corpo: acao }),
  salvarAcao: (id: number, acao: AcaoNova) => api<Acao>(`/wl/acoes/${id}`, { method: "PUT", corpo: acao }),
  apagarAcao: (id: number) => api<void>(`/wl/acoes/${id}`, { method: "DELETE" }),

  refeicoes: () => api<Refeicao[]>("/wl/refeicoes"),
  criarRefeicao: (refeicao: RefeicaoNova) =>
    api<Refeicao>("/wl/refeicoes", { method: "POST", corpo: refeicao }),
  salvarRefeicao: (id: number, refeicao: RefeicaoNova) =>
    api<Refeicao>(`/wl/refeicoes/${id}`, { method: "PUT", corpo: refeicao }),
  apagarRefeicao: (id: number) => api<void>(`/wl/refeicoes/${id}`, { method: "DELETE" }),

  dias: (de: string, ate: string) => api<DiaResumido[]>(`/wl/dias?de=${de}&ate=${ate}`),
  dia: (dia: string) => api<Dia>(`/wl/dias/${dia}`),
  /** Marca, corrige e desmarca (quantidade 0) na mesma rota. Devolve o dia inteiro. */
  marcar: (dia: string, acaoId: number, quantidade: number) =>
    api<Dia>(`/wl/dias/${dia}/acoes/${acaoId}`, { method: "PUT", corpo: { quantidade } }),
  /**
   * Reprecifica um dia com o cadastro de agora: não muda o que foi marcado,
   * só quanto vale. Repetir é inofensivo.
   */
  refotografar: (dia: string) => api<Dia>(`/wl/dias/${dia}/refotografar`, { method: "POST" }),
  /** O jejum em andamento, ou `null`. */
  jejumAtual: () => api<Jejum | null>("/wl/jejum/atual"),
  jejuns: (de: string, ate: string) => api<Jejum[]>(`/wl/jejum/intervalos?de=${de}&ate=${ate}`),
  criarJejum: (j: JejumNovo) => api<Jejum>("/wl/jejum/intervalos", { method: "POST", corpo: j }),
  /** Também é por aqui que se para um jejum: basta mandar o `fim`. */
  salvarJejum: (id: number, j: JejumNovo) =>
    api<Jejum>(`/wl/jejum/intervalos/${id}`, { method: "PUT", corpo: j }),
  apagarJejum: (id: number) => api<void>(`/wl/jejum/intervalos/${id}`, { method: "DELETE" }),

  /** Escolhe, troca ou tira (`null`) a refeição do dia. Devolve o dia inteiro. */
  escolherRefeicao: (dia: string, refeicaoId: number | null) =>
    api<Dia>(`/wl/dias/${dia}/refeicao`, { method: "PUT", corpo: { refeicaoId } }),
};
