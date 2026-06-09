import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { listOrderRequests, reviewOrderRequest } from "@/lib/orders/requests.functions";

export const Route = createFileRoute("/_authenticated/admin/solicitudes")({ component: SolicitudesPage });

type Req = {
  id: string; type: "cancel" | "return"; status: "pending" | "approved" | "rejected";
  reason: string | null; created_at: string; reviewer_notes: string | null;
  order: { id: string; order_number: string | null; total: number; status: string; siigo_invoice_number: string | null; customer: { display_name: string } | null } | null;
};

function SolicitudesPage() {
  const fetchAll = useServerFn(listOrderRequests);
  const review = useServerFn(reviewOrderRequest);
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchAll({}).then((r) => setRows(r.requests as unknown as Req[])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const act = async (id: string, decision: "approve" | "reject") => {
    setBusy(id);
    try { await review({ data: { id, decision, notes: notes[id] } }); toast.success("Procesado"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setBusy(null);
  };

  if (loading) return <div className="grid place-items-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-3">
      <h1 className="text-2xl font-bold">Solicitudes</h1>
      {rows.length === 0 && <Card className="p-6 text-center text-muted-foreground">Sin solicitudes</Card>}
      {rows.map((r) => (
        <Card key={r.id} className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium">{r.type === "cancel" ? "Anulación" : "Devolución"} · {r.order?.customer?.display_name}</div>
              <div className="text-xs text-muted-foreground">Pedido {r.order?.order_number ?? r.order?.id?.slice(0, 8)} · {r.order?.siigo_invoice_number ?? "sin factura"}</div>
            </div>
            <Badge variant={r.status === "pending" ? "default" : r.status === "approved" ? "secondary" : "outline"}>{r.status}</Badge>
          </div>
          {r.reason && <div className="text-sm border-l-2 pl-2 italic">{r.reason}</div>}
          {r.status === "pending" && (
            <>
              <Textarea placeholder="Notas (opcional)" value={notes[r.id] ?? ""} onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))} />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, "approve")}><Check className="w-4 h-4 mr-1" />Aprobar</Button>
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, "reject")}><X className="w-4 h-4 mr-1" />Rechazar</Button>
              </div>
            </>
          )}
          {r.reviewer_notes && <div className="text-xs text-muted-foreground">Revisión: {r.reviewer_notes}</div>}
        </Card>
      ))}
    </div>
  );
}