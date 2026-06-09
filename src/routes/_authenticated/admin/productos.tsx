import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, Search, Package } from "lucide-react";
import { toast } from "sonner";
import { listProducts, syncProducts, getLastSync, setProductStockOverride } from "@/lib/catalog/catalog.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/productos")({
  component: ProductosPage,
});

const fmtCop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

function ProductosPage() {
  const list = useServerFn(listProducts);
  const sync = useServerFn(syncProducts);
  const lastSync = useServerFn(getLastSync);
  const setOverride = useServerFn(setProductStockOverride);

  const [rows, setRows] = useState<Awaited<ReturnType<typeof list>>["products"]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [last, setLast] = useState<Awaited<ReturnType<typeof lastSync>>["last"]>(null);
  const [editing, setEditing] = useState<null | (typeof rows)[number]>(null);
  const [overrideValue, setOverrideValue] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async (q?: string) => {
    setLoading(true);
    try {
      const r = await list({ data: { search: q || undefined, limit: 100 } });
      setRows(r.products);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error cargando productos");
    }
    setLoading(false);
  };
  const reloadLast = () => lastSync({ data: { entity: "products" } }).then((r) => setLast(r.last)).catch(() => {});

  useEffect(() => {
    reload();
    reloadLast();
  }, []);

  const onSync = async () => {
    setSyncing(true);
    toast.info("Sincronizando productos desde Siigo…");
    try {
      const r = await sync({});
      if (r.ok) toast.success(`Listo: ${r.inserted} nuevos, ${r.updated} actualizados, ${r.errors} errores`);
      else toast.error(r.message ?? "Error en la sincronización");
      await reload(search);
      await reloadLast();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
    setSyncing(false);
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6" /> Productos</h1>
          <p className="text-sm text-muted-foreground">Catálogo sincronizado desde Siigo (precios e impuestos incluidos).</p>
        </div>
        <Button onClick={onSync} disabled={syncing}>
          {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Sincronizar con Siigo
        </Button>
      </div>

      {last && (
        <Card className="p-4 text-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              Última sincronización:{" "}
              <span className="font-medium">{last.finished_at ? new Date(last.finished_at).toLocaleString() : "—"}</span>
            </div>
            <div className="flex gap-2">
              <Badge variant={last.status === "ok" ? "default" : "destructive"}>{last.status}</Badge>
              <Badge variant="secondary">{last.total} total</Badge>
              <Badge variant="secondary">{last.inserted} nuevos</Badge>
              <Badge variant="secondary">{last.updated} act.</Badge>
              {last.errors ? <Badge variant="destructive">{last.errors} err</Badge> : null}
            </div>
          </div>
          {last.message && <p className="text-xs text-muted-foreground mt-2 break-all">{last.message}</p>}
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código o nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") reload(search); }}
          />
          <Button variant="outline" onClick={() => reload(search)}>Buscar</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-4">Código</th>
                <th className="py-2 pr-4">Producto</th>
                <th className="py-2 pr-4 text-right">Precio</th>
                <th className="py-2 pr-4 text-right">IVA</th>
                <th className="py-2 pr-4 text-right">Stock</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Cargando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No hay productos. Sincroniza con Siigo para empezar.</td></tr>
              ) : rows.map((p) => (
                <tr key={p.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 font-mono text-xs">{p.code}</td>
                  <td className="py-2 pr-4">{p.name}</td>
                  <td className="py-2 pr-4 text-right">{fmtCop(Number(p.price))}</td>
                  <td className="py-2 pr-4 text-right text-muted-foreground">{Number(p.tax_rate)}%</td>
                  <td className="py-2 pr-4 text-right">
                    <span className="font-medium">{p.stock ?? "—"}</span>
                    {(p as { stock_override?: number | null }).stock_override != null && (
                      <Badge variant="outline" className="ml-2 text-[10px]">Ajustado</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {p.active ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditing(p);
                      const ov = (p as { stock_override?: number | null }).stock_override;
                      setOverrideValue(ov != null ? String(ov) : "");
                    }}>Ajustar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar stock</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="font-medium">{editing.name}</div>
                <div className="text-xs text-muted-foreground">{editing.code}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Stock original (Siigo): <span className="font-medium">{(editing as { stock?: number | null }).stock ?? "—"}</span>
              </div>
              <div>
                <Label className="text-xs">Cantidad ajustada (vacío = usar Siigo)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={overrideValue}
                  onChange={(e) => setOverrideValue(e.target.value)}
                  placeholder="Ej: 3"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button
              disabled={saving}
              onClick={async () => {
                if (!editing) return;
                setSaving(true);
                try {
                  const v = overrideValue.trim();
                  await setOverride({ data: {
                    product_id: editing.id,
                    stock_override: v === "" ? null : Number(v),
                  }});
                  toast.success("Stock actualizado");
                  setEditing(null);
                  await reload(search);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Error");
                } finally { setSaving(false); }
              }}
            >{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
