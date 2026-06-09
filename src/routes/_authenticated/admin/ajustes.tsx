import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Settings, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getAppSettings, updateAppSettings, listDocumentTypes, syncDocumentTypes } from "@/lib/settings/settings.functions";
import { getFlowSettings, updateFlowSettings } from "@/lib/orders/flow.functions";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin/ajustes")({
  component: AjustesPage,
});

type DocType = { siigo_id: number; code: string | null; name: string; description: string | null; type: string | null; active: boolean; automatic_number: boolean; electronic_type: string | null };

function AjustesPage() {
  const fetchSettings = useServerFn(getAppSettings);
  const save = useServerFn(updateAppSettings);
  const fetchDocs = useServerFn(listDocumentTypes);
  const syncDocs = useServerFn(syncDocumentTypes);
  const fetchFlow = useServerFn(getFlowSettings);
  const saveFlow = useServerFn(updateFlowSettings);
  const [val, setVal] = useState<string>("0");
  const [note, setNote] = useState<string>("");
  const [docId, setDocId] = useState<string>("");
  const [docs, setDocs] = useState<DocType[]>([]);
  const [flow, setFlow] = useState<{ confirmation_mode: "signature" | "acceptance"; client_delivery_requires_photo: boolean; client_delivery_requires_geo: boolean }>({ confirmation_mode: "acceptance", client_delivery_requires_photo: true, client_delivery_requires_geo: true });
  const [savingFlow, setSavingFlow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    Promise.all([fetchSettings({}), fetchDocs({}), fetchFlow({})])
      .then(([s, d, f]) => {
        setVal(String(s.max_discount_pct));
        setNote(s.default_invoice_note ?? "");
        setDocId(s.default_document_id != null ? String(s.default_document_id) : "");
        setDocs((d.document_types ?? []) as DocType[]);
        setFlow(f);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    const n = Number(val);
    if (Number.isNaN(n) || n < 0 || n > 100) { toast.error("Ingresa un valor entre 0 y 100"); return; }
    setSaving(true);
    try {
      await save({ data: {
        max_discount_pct: n,
        default_invoice_note: note.trim() || null,
        default_document_id: docId ? Number(docId) : null,
      } });
      toast.success("Ajustes guardados");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setSaving(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await syncDocs({});
      toast.success(`Catálogo importado (${r.inserted}/${r.total})`);
      const d = await fetchDocs({});
      setDocs((d.document_types ?? []) as DocType[]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setSyncing(false);
  };

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5" />
        <h1 className="text-2xl font-bold">Ajustes</h1>
      </div>
      <Card className="p-6 space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Descuento máximo por línea (%)</label>
          <p className="text-xs text-muted-foreground">
            Los vendedores no podrán aplicar un descuento mayor a este porcentaje. Los obsequios (precio 0) no aplican esta restricción.
          </p>
        </div>
        <Input type="number" min={0} max={100} step="0.01" value={val} onChange={(e) => setVal(e.target.value)} />
      </Card>

      <Card className="p-6 space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Nota predefinida en facturas</label>
          <p className="text-xs text-muted-foreground">
            Esta nota se enviará como observaciones en TODAS las facturas. Si el pedido tiene notas propias, se concatenan después.
          </p>
        </div>
        <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: Gracias por su compra. Garantía 30 días..." />
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Tipo de documento Siigo predefinido</label>
            <p className="text-xs text-muted-foreground">
              Documento de factura usado por defecto al facturar. Importa el catálogo desde Siigo si está vacío.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Importar catálogo
          </Button>
        </div>
        <Select value={docId} onValueChange={setDocId}>
          <SelectTrigger>
            <SelectValue placeholder={docs.length === 0 ? "Importa el catálogo primero" : "Selecciona un tipo de documento"} />
          </SelectTrigger>
          <SelectContent>
            {docs.map((d) => (
              <SelectItem key={d.siigo_id} value={String(d.siigo_id)} disabled={!d.automatic_number || !d.active}>
                {d.code ? `${d.code} · ` : ""}{d.name}
                <span className="text-muted-foreground"> #{d.siigo_id}</span>
                {!d.automatic_number && <span className="text-destructive"> (manual)</span>}
                {d.electronic_type ? <span className="text-muted-foreground"> · {d.electronic_type}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Solo los documentos con numeración automática se pueden usar vía API. Si tu opción aparece deshabilitada, configúralo en Siigo o elige otro.
        </p>
        {docId && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDocId("")}>
            Quitar predefinido
          </Button>
        )}
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Guardar ajustes
      </Button>

    <Card className="p-6 space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">Modo de confirmación de transferencias</label>
        <p className="text-xs text-muted-foreground">
          <strong>Firma:</strong> el emisor firma y el pedido pasa de inmediato. <strong>Aceptación:</strong> queda pendiente hasta que el receptor acepte o rechace.
        </p>
      </div>
      <Select value={flow.confirmation_mode} onValueChange={(v) => setFlow((p) => ({ ...p, confirmation_mode: v as "signature" | "acceptance" }))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="acceptance">Aceptación por el receptor</SelectItem>
          <SelectItem value="signature">Firma del emisor</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center justify-between">
        <label className="text-sm">Entrega a cliente requiere foto</label>
        <Switch checked={flow.client_delivery_requires_photo} onCheckedChange={(c) => setFlow((p) => ({ ...p, client_delivery_requires_photo: c }))} />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm">Entrega a cliente requiere geolocalización</label>
        <Switch checked={flow.client_delivery_requires_geo} onCheckedChange={(c) => setFlow((p) => ({ ...p, client_delivery_requires_geo: c }))} />
      </div>
      <Button onClick={async () => {
        setSavingFlow(true);
        try { await saveFlow({ data: flow }); toast.success("Flujo actualizado"); }
        catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
        setSavingFlow(false);
      }} disabled={savingFlow}>
        {savingFlow && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Guardar flujo
      </Button>
    </Card>
    </div>
  );
}
