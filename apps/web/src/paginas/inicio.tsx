import { Link } from "react-router";

/**
 * Os módulos do Trimly. Por enquanto só o WL; os próximos entram nesta lista
 * e ganham uma rota em `main.tsx`.
 */
const MODULOS = [
  { rota: "/wl", nome: "WL", descricao: "Pesagens, meta e evolução." },
];

export function Inicio() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bom te ver por aqui</h1>
        <p className="mt-1 text-tinta-2">Um passo de cada vez.</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {MODULOS.map((m) => (
          <li key={m.rota}>
            <Link
              to={m.rota}
              className="block rounded-2xl border border-borda bg-superficie p-4 transition-colors hover:border-destaque"
            >
              <span className="text-lg font-semibold">{m.nome}</span>
              <span className="mt-1 block text-sm text-tinta-2">{m.descricao}</span>
            </Link>
          </li>
        ))}
        <li className="rounded-2xl border border-dashed border-borda p-4 text-sm text-tinta-3">
          Mais módulos em breve.
        </li>
      </ul>
    </div>
  );
}
