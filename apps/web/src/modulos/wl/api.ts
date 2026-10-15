import { api } from "../../api.ts";
import type { Acao, Dia, DiaResumido, Grupo, Meta, Pesagem } from "./calculos.ts";
import type { Jejum } from "./jejum-calculos.ts";

/**
 * O que o cadastro de ação envia: tudo menos o id, que é do banco.
 *
 * As opções vão junto, e não em rotas próprias: o formulário manda a lista
 * inteira e o servidor concilia — opção sem `id` é nova, com `id` é edição, e
 * a que sumiu da lista é apagada ou arquivada conforme já tenha sido usada.
 */
export type AcaoNova = Omit<Acao, "id" | "opcoes"> & {
  opcoes: { id?: number; nome: string; pontos: number; ativa: boolean }[];
};

/** O que o formulário de jejum manda. Instantes em ISO; o dia, em `AAAA-MM-DD`. */
export type JejumNovo = Omit<Jejum, "id">;

/** O que o cadastro de grupo envia. */
export type GrupoNovo = Omit<Grupo, "id">;

export const wlApi = {
  pesagens: () => api<Pesagem[]>("/wl/pesagens"),
  /**
   * O dia vai no caminho, porque é a identidade do registro; o resto, num
   * objeto. Posicional, o `padronizada` seria um quarto booleano solto na
   * chamada, do tipo que ninguém lê sem voltar até aqui.
   */
  salvarPesagem: (dia: string, dados: Omit<Pesagem, "data">) =>
    api<Pesagem>(`/wl/pesagens/${dia}`, { method: "PUT", corpo: dados }),
  apagarPesagem: (dia: string) => api<void>(`/wl/pesagens/${dia}`, { method: "DELETE" }),
  meta: () => api<Meta | null>("/wl/meta"),
  salvarMeta: (meta: Meta) => api<Meta>("/wl/meta", { method: "PUT", corpo: meta }),

  acoes: () => api<Acao[]>("/wl/acoes"),
  criarAcao: (acao: AcaoNova) => api<Acao>("/wl/acoes", { method: "POST", corpo: acao }),
  salvarAcao: (id: number, acao: AcaoNova) => api<Acao>(`/wl/acoes/${id}`, { method: "PUT", corpo: acao }),
  apagarAcao: (id: number) => api<void>(`/wl/acoes/${id}`, { method: "DELETE" }),
  /**
   * Só a ordem, da lista inteira de uma vez. Rota própria porque `salvarAcao`
   * exige o corpo completo e reconcilia opções e grupos — um arrasto não tem
   * nada que mexer nisso. Devolve as ações já reordenadas.
   */
  ordenarAcoes: (ordens: { id: number; ordem: number }[]) =>
    api<Acao[]>("/wl/acoes/ordem", { method: "PUT", corpo: { ordens } }),

  grupos: () => api<Grupo[]>("/wl/grupos"),
  criarGrupo: (g: GrupoNovo) => api<Grupo>("/wl/grupos", { method: "POST", corpo: g }),
  salvarGrupo: (id: number, g: GrupoNovo) => api<Grupo>("/wl/grupos/" + id, { method: "PUT", corpo: g }),
  apagarGrupo: (id: number) => api<void>("/wl/grupos/" + id, { method: "DELETE" }),

  dias: (de: string, ate: string) => api<DiaResumido[]>(`/wl/dias?de=${de}&ate=${ate}`),
  dia: (dia: string) => api<Dia>(`/wl/dias/${dia}`),
  /**
   * Marca, troca a opção, corrige a quantidade e desmarca (quantidade 0) na
   * mesma rota. Devolve o dia inteiro, para a tela não fazer segunda viagem.
   */
  marcar: (dia: string, acaoId: number, quantidade: number, opcaoId: number | null = null) =>
    api<Dia>(`/wl/dias/${dia}/acoes/${acaoId}`, { method: "PUT", corpo: { quantidade, opcaoId } }),
  /**
   * Reprecifica um dia com o cadastro de agora: não muda o que foi marcado,
   * só quanto vale. Repetir é inofensivo.
   */
  /** Escolhe, troca ou tira (null) o grupo do dia. Devolve o dia inteiro. */
  escolherGrupo: (dia: string, grupoId: number | null) =>
    api<Dia>("/wl/dias/" + dia + "/grupo", { method: "PUT", corpo: { grupoId } }),
  refotografar: (dia: string) => api<Dia>(`/wl/dias/${dia}/refotografar`, { method: "POST" }),

  /** O jejum em andamento, ou `null`. */
  jejumAtual: () => api<Jejum | null>("/wl/jejum/atual"),
  jejuns: (de: string, ate: string) => api<Jejum[]>(`/wl/jejum/intervalos?de=${de}&ate=${ate}`),
  criarJejum: (j: JejumNovo) => api<Jejum>("/wl/jejum/intervalos", { method: "POST", corpo: j }),
  /** Também é por aqui que se para um jejum: basta mandar o `fim`. */
  salvarJejum: (id: number, j: JejumNovo) =>
    api<Jejum>(`/wl/jejum/intervalos/${id}`, { method: "PUT", corpo: j }),
  apagarJejum: (id: number) => api<void>(`/wl/jejum/intervalos/${id}`, { method: "DELETE" }),
};
