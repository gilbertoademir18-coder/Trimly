import { Link } from "react-router";

/**
 * O erro que a tela mostra. Vem do campo `erro` que a API manda — a mensagem
 * já chega pronta para ser lida por gente, e o detalhe técnico fica no log.
 */
export function Aviso({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-perigo/40 bg-superficie p-3 text-sm text-perigo">{texto}</p>;
}

/**
 * O cabeçalho das telas de dentro do WL: volta para `/wl` e diz onde você está.
 *
 * `Link` e não `<a>`: âncora comum recarregaria o app inteiro a cada volta.
 */
export function CabecalhoInterno({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-center gap-3">
      <Link to="/wl" className="text-sm text-tinta-2 hover:text-tinta">
        ← WL
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
    </div>
  );
}
