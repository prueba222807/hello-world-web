import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listPaymentMethods, updatePaymentMethod, syncPaymentMethods } from "@/lib/catalog/catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/medios-pago")({
  component: MediosPagoPage,
});

type PM = {
  id: string;
  siigo_id: number;
  name: string;
  display_name: string | null;
  type: string | null;
  active: boolean;
  is_credit: boolean;
  visible_to_sellers: boolean;
  credit_days_options: number[] | null;
};

function MediosPagoPage() {
  const fetchAll = useServerFn(listPaymentMethods);
  const update = useServerFn(updatePaymentMethod);
  const sync = useServerFn(syncPaymentMethods);
  const [items, setItems] = useState<PM[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchAll({ data: { scope: "all" } });
      setItems(r.methods as PM[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error cargando medios de pago");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const patch = async (id: string, body: Partial<{ is_credit: boolean; credit_days_options: number[]; visible_to_sellers: boolean; display_name: string | null }>) => {
    try {
      await update({ data: { id, ...body } });
      setItems((prev) => prev.map((m) => m.id === id ? { ...m, ...body } as PM : m));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error guardando");
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await sync({});
      if (r.ok) toast.success(`Sincronización OK · ${r.inserted} nuevos, ${r.updated} actualizados`);
      else toast.error(r.message ?? "Error sincronizando");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
    setSyncing(false);
  };

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          <h1 className="text-2xl font-bold">Medios de pago</h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Sincronizar desde Siigo
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Habilita cuáles métodos verán los vendedores al crear un pedido. Puedes asignar un nombre alternativo
        (alias) y configurar los días de crédito disponibles.
      </p>

      <div className="grid gap-3">
        {items.map((m) => (
          <Card key={m.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">{m.name}</div>
                <div className="text-xs text-muted-foreground">
                  Siigo ID: {m.siigo_id} · {m.type ?? "—"} {!m.active && <Badge variant="outline" className="ml-1">Inactivo</Badge>}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={m.visible_to_sellers}
                  onCheckedChange={(v) => patch(m.id, { visible_to_sellers: v })}
                />
                Visible para vendedores
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nombre visible (alias)</label>
                <Input
                  defaultValue={m.display_name ?? ""}
                  placeholder={m.name}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if ((m.display_name ?? "") !== v) patch(m.id, { display_name: v || null });
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={m.is_credit}
                    onCheckedChange={(v) => patch(m.id, { is_credit: v })}
                  />
                  Maneja fecha de vencimiento (crédito)
                </label>
                {m.is_credit && (
                  <div className="text-xs text-muted-foreground">
                    Opciones de días: {(m.credit_days_options ?? [15, 30, 45, 60, 90]).join(", ")}
                  </div>
                )}
              </div>
            </div>

            {m.is_credit && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Días de crédito disponibles (separados por coma)</label>
                <Input
                  defaultValue={(m.credit_days_options ?? [15, 30, 45, 60, 90]).join(", ")}
                  onBlur={(e) => {
                    const parsed = e.currentTarget.value
                      .split(/[,\s]+/)
                      .map((s) => Number(s.trim()))
                      .filter((n) => Number.isFinite(n) && n > 0 && n <= 365);
                    if (parsed.length === 0) { toast.error("Ingresa al menos un valor válido"); return; }
                    patch(m.id, { credit_days_options: parsed });
                  }}
                />
              </div>
            )}
          </Card>
        ))}
        {items.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No hay medios de pago. Sincroniza desde Siigo para cargarlos.
          </Card>
        )}
      </div>
    </div>
  );
}
