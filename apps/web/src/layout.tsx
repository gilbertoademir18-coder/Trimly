import { Link, NavLink, Outlet } from "react-router";

export function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-7 rounded-lg" />
          Trimly
        </Link>
        <nav className="flex gap-1 text-sm">
          <ItemNav to="/" end>
            Início
          </ItemNav>
          <ItemNav to="/wl">WL</ItemNav>
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function ItemNav({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-full px-3 py-1.5 transition-colors ${
          isActive ? "bg-destaque-suave font-medium text-tinta" : "text-tinta-2 hover:text-tinta"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
