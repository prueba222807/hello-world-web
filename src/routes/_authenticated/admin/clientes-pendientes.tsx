import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Check, X, Inbox, Pencil } from "lucide-react";
import { toast } from "sonner";
import { listPendingCustomers, approveCustomer, rejectCustomer } from "@/lib/catalog/catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/clientes-pendientes")({
  component: PendingCustomersPage,
});

type Pending = {
  id: string;
  identification: string;
  id_type: string | null;
  person_type: string | null;
  display_name: string;
  commercial_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city_name: string | null;
  city_code: string | null;
  country_code: string | null;
  seller_siigo_id: string | null;
  created_at: string;
};

function PendingCustomersPage() {
  const fetchList = useServerFn(listPendingCustomers);
  const approveFn = useServerFn(approveCustomer);
  const rejectFn = useServerFn(rejectCustomer);
  const [rows, setRows] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Pending | null>(null);
  const [rejecting, setRejecting] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    fetchList({})
      .then((r) => setRows(r.customers as unknown as Pending[]))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const onApprove = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await approveFn({ data: { id: editing.id, patch: {
        identification: editing.identification,
        id_type: editing.id_type ?? "13",
        person_type: (editing.person_type ?? "Person") as "Person" | "Company",
        display_name: editing.display_name,
        commercial_name: editing.commercial_name ?? undefined,
        first_name: editing.first_name ?? undefined,
        last_name: editing.last_name ?? undefined,
        email: editing.email ?? undefined,
        phone: editing.phone ?? undefined,
        address: editing.address ?? undefined,
        city_name: editing.city_name ?? undefined,
        city_code: editing.city_code ?? undefined,
        country_code: editing.country_code ?? "Co",
      } } });
      toast.success("Cliente aprobado y creado en Siigo");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al aprobar");
    } finally { setBusy(false); }
  };

  const onReject = async () => {
    if (!rejecting) return;
    if (reason.trim().length < 3) return toast.error("Motivo obligatorio");
    setBusy(true);
    try {
      await rejectFn({ data: { id: rejecting.id, reason: reason.trim() } });
      toast.success("Cliente rechazado");
      setRejecting(null); setReason("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  };

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 md:p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Clientes por aprobar</h1>
        <p className="text-sm text-muted-foreground">Verifica los datos y autoriza la creación en Siigo. Mientras estén pendientes, no se podrán facturar pedidos de estos clientes.</p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No hay clientes pendientes.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.display_name}</span>
                    <Badge variant="secondary">{c.person_type === "Company" ? "Jurídica" : "Natural"}</Badge>
                    <Badge variant="outline">{c.id_type ?? "—"} · {c.identification}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {c.email ?? "sin email"} · {c.phone ?? "sin tel"} · {c.city_name ?? "sin ciudad"}
                  </div>
                  <div className="text-xs text-muted-foreground">{c.address ?? "sin dirección"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">Solicitado: {new Date(c.created_at).toLocaleString("es-CO")}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                    <Pencil className="w-4 h-4 mr-1" /> Revisar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { setRejecting(c); setReason(""); }}>
                    <X className="w-4 h-4 mr-1" /> Rechazar
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal aprobar / editar */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Revisar y aprobar cliente</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Tipo persona</Label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={editing.person_type ?? "Person"}
                    onChange={(e) => setEditing({ ...editing, person_type: e.target.value })}
                  >
                    <option value="Person">Natural</option>
                    <option value="Company">Jurídica</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Tipo doc.</Label>
                  <Input value={editing.id_type ?? ""} onChange={(e) => setEditing({ ...editing, id_type: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Identificación</Label>
                <Input value={editing.identification} onChange={(e) => setEditing({ ...editing, identification: e.target.value })} />
              </div>
              {editing.person_type === "Person" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Nombres</Label>
                    <Input value={editing.first_name ?? ""} onChange={(e) => setEditing({ ...editing, first_name: e.target.value, display_name: `${e.target.value} ${editing.last_name ?? ""}`.trim() })} />
                  </div>
                  <div>
                    <Label className="text-xs">Apellidos</Label>
                    <Input value={editing.last_name ?? ""} onChange={(e) => setEditing({ ...editing, last_name: e.target.value, display_name: `${editing.first_name ?? ""} ${e.target.value}`.trim() })} />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">Razón social</Label>
                    <Input value={editing.display_name} onChange={(e) => setEditing({ ...editing, display_name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Nombre comercial</Label>
                    <Input value={editing.commercial_name ?? ""} onChange={(e) => setEditing({ ...editing, commercial_name: e.target.value })} />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Teléfono</Label>
                  <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Dirección</Label>
                <Input value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Ciudad</Label>
                  <Input value={editing.city_name ?? ""} onChange={(e) => setEditing({ ...editing, city_name: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Cód. ciudad DIVIPOLA (5 dígitos)</Label>
                  <Input value={editing.city_code ?? ""} onChange={(e) => setEditing({ ...editing, city_code: e.target.value })} placeholder="ej: 11001" />
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground bg-muted/40 rounded p-2">
                Al aprobar, se crea el cliente en Siigo con los datos de arriba. Si no se especifica código DIVIPOLA, se usará Bogotá (11001).
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={onApprove} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              Aprobar y crear en Siigo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal rechazar */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechazar cliente</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm">{rejecting?.display_name} ({rejecting?.identification})</div>
            <Label className="text-xs">Motivo</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Datos inválidos, duplicado..." />
            <div className="text-[11px] text-muted-foreground">El cliente quedará inactivo y no podrá facturarse.</div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={busy}>Cancelar</Button>
            <Button variant="destructive" onClick={onReject} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}