import { api } from "../../api.ts";
import type { Meta, Pesagem } from "./calculos.ts";

export const wlApi = {
  pesagens: () => api<Pesagem[]>("/wl/pesagens"),
  salvarPesagem: (dia: string, pesoKg: number, nota: string | null) =>
    api<Pesagem>(`/wl/pesagens/${dia}`, { method: "PUT", corpo: { pesoKg, nota } }),
  apagarPesagem: (dia: string) => api<void>(`/wl/pesagens/${dia}`, { method: "DELETE" }),
  meta: () => api<Meta | null>("/wl/meta"),
  salvarMeta: (meta: Meta) => api<Meta>("/wl/meta", { method: "PUT", corpo: meta }),
};
