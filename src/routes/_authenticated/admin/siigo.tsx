import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { saveSiigoConfig, getSiigoStatus, testSiigoConnection } from "@/lib/siigo/siigo.functions";
import { syncCustomers, syncProducts, syncSellers, syncPaymentMethods } from "@/lib/catalog/catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/siigo")({
  component: SiigoConfigPage,
});

function SiigoConfigPage() {
  const save = useServerFn(saveSiigoConfig);
  const status = useServerFn(getSiigoStatus);
  const test = useServerFn(testSiigoConnection);

  const [username, setUsername] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [partnerId, setPartnerId] = useState("ConTaxesSalesApp");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [current, setCurrent] = useState<Awaited<ReturnType<typeof status>>["config"]>(null);

  const reload = () => {
    status({}).then((r) => {
      setCurrent(r.config);
      if (r.config) {
        setUsername(r.config.username);
        setPartnerId(r.config.partner_id);
      }
    }).catch(() => {});
  };
  useEffect(() => { reload(); }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await save({ data: { username, access_key: accessKey, partner_id: partnerId } });
      if (res.ok) {
        toast.success(res.message);
        setAccessKey("");
        reload();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
    setBusy(false);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await test({});
      if (res.ok) toast.success("Conexión OK");
      else toast.error(res.message);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
    setTesting(false);
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración de Siigo</h1>
        <p className="text-sm text-muted-foreground">
          Las credenciales se almacenan cifradas. La <code>access_key</code> nunca se expone al navegador.
        </p>
      </div>

      {current && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground">Configuración activa</div>
              <div className="font-medium">{current.username}</div>
              <div className="text-xs text-muted-foreground">Partner: {current.partner_id}</div>
            </div>
            <div className="flex items-center gap-3">
              {current.last_test_ok === true && (
                <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />Conectado</Badge>
              )}
              {current.last_test_ok === false && (
                <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Falla</Badge>
              )}
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Probar conexión"}
              </Button>
            </div>
          </div>
          {current.last_test_message && (
            <p className="text-xs text-muted-foreground mt-3 break-all">{current.last_test_message}</p>
          )}
        </Card>
      )}

      <Card className="p-6">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuario Siigo (correo)</Label>
            <Input id="username" type="email" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="usuario@empresa.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accessKey">Access Key</Label>
            <Input id="accessKey" type="password" required value={accessKey} onChange={(e) => setAccessKey(e.target.value)} placeholder={current ? "(dejar en blanco para no cambiar… o ingresar nueva)" : "Tu access key de Siigo"} />
            <p className="text-xs text-muted-foreground">
              La obtienes en tu panel Siigo → API. Se valida contra Siigo antes de guardarla.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="partner">Partner-Id</Label>
            <Input id="partner" required value={partnerId} onChange={(e) => setPartnerId(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy || !accessKey}>
            {busy ? "Verificando y guardando…" : "Guardar y verificar"}
          </Button>
        </form>
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Sincronización de catálogos</h2>
        <p className="text-xs text-muted-foreground">Trae datos de Siigo a la base local. Ejecuta cuando haya cambios en Siigo.</p>
        <div className="grid grid-cols-2 gap-2">
          <SyncButton label="Clientes" fn={syncCustomers} />
          <SyncButton label="Productos" fn={syncProducts} />
          <SyncButton label="Vendedores" fn={syncSellers} />
          <SyncButton label="Formas de pago" fn={syncPaymentMethods} />
        </div>
      </Card>
    </div>
  );
}

function SyncButton({ label, fn }: { label: string; fn: Parameters<typeof useServerFn>[0] }) {
  const run = useServerFn(fn);
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      const r = await run({}) as { ok: boolean; total?: number; inserted?: number; updated?: number; errors?: number; message?: string };
      if (r.ok) toast.success(`${label}: ${r.inserted} nuevos · ${r.updated} actualizados · ${r.errors} errores`);
      else toast.error(`${label}: ${r.message ?? "Error"}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setBusy(false);
  };
  return (
    <Button variant="outline" onClick={handle} disabled={busy} className="justify-start">
      {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
      {label}
    </Button>
  );
}
