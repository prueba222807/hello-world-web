import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Settings,
  LogOut,
  Building2,
  Shield,
  SlidersHorizontal,
  CreditCard,
  Inbox,
  ClipboardList,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/flow/NotificationBell";

const sections = [
  {
    label: "Resumen",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Operación",
    items: [
      { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingCart, exact: false },
      { to: "/cola", label: "Cola operativa", icon: Inbox, exact: false },
      { to: "/bandeja", label: "Mi bandeja", icon: Inbox, exact: false },
      { to: "/admin/solicitudes", label: "Solicitudes", icon: ClipboardList, exact: false },
    ],
  },
  {
    label: "Maestros",
    items: [
      { to: "/admin/clientes", label: "Clientes", icon: Users, exact: false },
      { to: "/admin/clientes-pendientes", label: "Aprobar clientes", icon: UserPlus, exact: false },
      { to: "/admin/productos", label: "Productos", icon: Package, exact: false },
      { to: "/admin/medios-pago", label: "Medios de pago", icon: CreditCard, exact: false },
    ],
  },
  {
    label: "Análisis",
    items: [
      { to: "/admin/reportes", label: "Reportes", icon: ClipboardList, exact: false },
    ],
  },
  {
    label: "Administración",
    items: [
      { to: "/admin/usuarios", label: "Usuarios", icon: Shield, exact: false },
      { to: "/admin/ajustes", label: "Ajustes", icon: SlidersHorizontal, exact: false },
      { to: "/admin/siigo", label: "Configuración Siigo", icon: Settings, exact: false },
    ],
  },
] as const;

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-sidebar-border">
          <div className="grid place-items-center w-9 h-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold leading-tight">ConTaxes</div>
            <div className="text-xs text-sidebar-foreground/70">Sales App · Admin</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.label} className="space-y-1">
              <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {section.label}
              </div>
              {section.items.map((item) => {
                const active = item.exact
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="px-3 py-2 text-xs text-sidebar-foreground/70 truncate">
            {user?.email}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Salir
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b bg-card md:bg-transparent md:border-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary md:hidden" />
            <span className="font-semibold md:hidden">ConTaxes Admin</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <NotificationBell />
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="md:hidden">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
