import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ShoppingBag, ListChecks, User, LogOut, Plus, Package, Users, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/flow/NotificationBell";

const tabs = [
  { to: "/vendedor", label: "Inicio", icon: ShoppingBag, exact: true },
  { to: "/vendedor/nuevo", label: "Nuevo", icon: Plus, exact: false },
  { to: "/vendedor/pedidos", label: "Pedidos", icon: ListChecks, exact: false },
  { to: "/bandeja", label: "Bandeja", icon: Inbox, exact: false },
  { to: "/vendedor/productos", label: "Productos", icon: Package, exact: false },
  { to: "/vendedor/clientes", label: "Clientes", icon: Users, exact: false },
  { to: "/vendedor/perfil", label: "Perfil", icon: User, exact: false },
] as const;

export function VendedorLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Vendedor</div>
          <div className="font-semibold truncate max-w-[200px]">{user?.email}</div>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Salir">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-card border-t flex items-stretch z-10">
        {tabs.map((t) => {
          const active = t.exact
            ? location.pathname === t.to
            : location.pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-5 h-5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
