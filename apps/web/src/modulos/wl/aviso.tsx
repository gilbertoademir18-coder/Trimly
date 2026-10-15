/**
 * O erro que a tela mostra. Vem do campo `erro` que a API manda — a mensagem
 * já chega pronta para ser lida por gente, e o detalhe técnico fica no log.
 */
export function Aviso({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-perigo/40 bg-superficie p-3 text-sm text-perigo">{texto}</p>;
}
