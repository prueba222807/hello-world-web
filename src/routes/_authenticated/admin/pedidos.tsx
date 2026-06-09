import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { listOrders } from "@/lib/orders/orders.functions";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  component: AdminPedidosPage,
});

type OrderRow = {
  id: string; status: string; total: number; created_at: string;
  delivery_date: string | null; due_date: string | null;
  has_manual_price: boolean; manual_price_acknowledged: boolean;
  siigo_invoice_number: string | null;
  customer: { display_name: string; identification: string } | null;
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

const STATUSES = ["all", "pending", "confirmed", "invoiced", "dispatched", "cancelled"] as const;
const LABEL: Record<string, string> = {
  pending: "Pendientes", confirmed: "Confirmados", invoiced: "Facturados",
  dispatched: "Reparto", cancelled: "Cancelados", all: "Todos", draft: "Borrador",
};

function AdminPedidosPage() {
  const fetchList = useServerFn(listOrders);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");

  useEffect(() => {
    setLoading(true);
    fetchList({ data: { scope: "all", limit: 300, status: status === "all" ? undefined : status } })
      .then((r) => setRows(r.orders as unknown as OrderRow[]))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [status, fetchList]);

  return (
    <div className="p-4 md:p-6 space-y-3">
      <h1 className="text-xl font-bold">Pedidos</h1>
      <div className="flex gap-2 flex-wrap text-xs">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-md border transition-colors ${status===s ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent/40"}`}>
            {LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-50" />
          Sin pedidos en este estado.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((o) => (
            <Link key={o.id} to="/pedidos/$id" params={{ id: o.id }}>
              <Card className="p-3 hover:bg-accent/30 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{o.customer?.display_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.customer?.identification ?? ""} · {new Date(o.created_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                      {o.delivery_date ? ` · Entrega ${o.delivery_date}` : ""}
                      {o.due_date ? ` · Vence ${o.due_date}` : ""}
                    </div>
                    {o.siigo_invoice_number && (
                      <div className="text-xs mt-1">Factura: <span className="font-medium">{o.siigo_invoice_number}</span></div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{fmt(Number(o.total))}</div>
                    <Badge variant="secondary" className="mt-1 text-xs">{LABEL[o.status] ?? o.status}</Badge>
                    {o.has_manual_price && !o.manual_price_acknowledged && (
                      <Badge variant="outline" className="ml-1 mt-1 text-[10px]">Ajustado</Badge>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
