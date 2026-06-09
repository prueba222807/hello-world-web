import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Receipt, Truck, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getAdminDashboard } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n) || 0);
}

const LABEL: Record<string, string> = {
  draft: "Borrador", pending: "Pendiente", confirmed: "Confirmado",
  invoiced: "Facturado", dispatched: "Reparto", cancelled: "Cancelado",
};

type Dash = Awaited<ReturnType<typeof getAdminDashboard>>;

function Dashboard() {
  const { user } = useAuth();
  const fetchDash = useServerFn(getAdminDashboard);
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDash({})
      .then((r) => setData(r as Dash))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Error cargando dashboard"))
      .finally(() => setLoading(false));
  }, [fetchDash]);

  if (loading) {
    return <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return null;

  const k = data.kpis;
  const stats = [
    { label: "Pedidos hoy", value: k.orders_today, icon: ShoppingCart },
    { label: "Pedidos semana", value: k.orders_week, icon: Clock },
    { label: "Pendientes", value: k.pending + k.confirmed, icon: AlertTriangle },
    { label: "Sin despachar", value: k.invoiced_pending_dispatch, icon: Truck },
    { label: "Facturado mes", value: fmt(k.invoiced_total_month), icon: Receipt },
    { label: "Ajustes por confirmar", value: k.manual_price_pending, icon: AlertTriangle },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Bienvenido, {user?.email}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground truncate">{label}</div>
                <div className="text-xl font-bold mt-1 truncate">{value}</div>
              </div>
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {data.manual_orders.length > 0 && (
        <Card className="p-4 space-y-2 border-amber-500/50 bg-amber-500/5">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Pedidos con ajuste manual sin confirmar
          </div>
          <div className="space-y-1">
            {data.manual_orders.map((o) => (
              <Link key={o.id} to="/pedidos/$id" params={{ id: o.id }} className="block hover:bg-accent/30 rounded px-2 py-1.5">
                <div className="flex justify-between text-sm">
                  <span className="truncate">{o.customer?.display_name ?? "—"}</span>
                  <span className="font-medium">{fmt(o.total)}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <div className="font-medium">Actividad reciente</div>
        {data.recent.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin pedidos aún.</div>
        ) : (
          <div className="space-y-1">
            {data.recent.map((o) => (
              <Link key={o.id} to="/pedidos/$id" params={{ id: o.id }} className="block hover:bg-accent/30 rounded px-2 py-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0 flex-1 truncate">{o.customer?.display_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground hidden sm:block">{new Date(o.created_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</div>
                  <div className="font-medium">{fmt(o.total)}</div>
                  <Badge variant="secondary" className="text-[10px]">{LABEL[o.status] ?? o.status}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
