import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { listCustomers, syncCustomers, getLastSync } from "@/lib/catalog/catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  component: ClientesPage,
});

function ClientesPage() {
  const list = useServerFn(listCustomers);
  const sync = useServerFn(syncCustomers);
  const lastSync = useServerFn(getLastSync);

  const [rows, setRows] = useState<Awaited<ReturnType<typeof list>>["customers"]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [last, setLast] = useState<Awaited<ReturnType<typeof lastSync>>["last"]>(null);

  const reload = async (q?: string) => {
    setLoading(true);
    try {
      const r = await list({ data: { search: q || undefined, limit: 100 } });
      setRows(r.customers);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error cargando clientes");
    }
    setLoading(false);
  };
  const reloadLast = () => lastSync({ data: { entity: "customers" } }).then((r) => setLast(r.last)).catch(() => {});

  useEffect(() => {
    reload();
    reloadLast();
  }, []);

  const onSync = async () => {
    setSyncing(true);
    toast.info("Sincronizando clientes desde Siigo…");
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> Clientes</h1>
          <p className="text-sm text-muted-foreground">Sincronizados desde Siigo. Usa el botón para traer los últimos cambios.</p>
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
            placeholder="Buscar por NIT, nombre o nombre comercial…"
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
                <th className="py-2 pr-4">Identificación</th>
                <th className="py-2 pr-4">Nombre</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Teléfono</th>
                <th className="py-2 pr-4">Ciudad</th>
                <th className="py-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Cargando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No hay clientes. Sincroniza con Siigo para empezar.</td></tr>
              ) : rows.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 font-mono text-xs">{c.identification}</td>
                  <td className="py-2 pr-4">
                    <div>{c.display_name}</div>
                    {c.commercial_name && c.commercial_name !== c.display_name && (
                      <div className="text-xs text-muted-foreground">{c.commercial_name}</div>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{c.city_name ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {c.active ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
