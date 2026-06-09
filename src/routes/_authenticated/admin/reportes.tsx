import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { reportSalesBySeller, reportSalesByProduct, reportSalesByCustomer, reportTraceability } from "@/lib/reports/reports.functions";
import { downloadWorkbook } from "@/lib/reports/export-excel";
import { formatCurrency } from "@/lib/order-flow";

export const Route = createFileRoute("/_authenticated/admin/reportes")({
  component: ReportesPage,
});

function defaultRange() {
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30);
  const s = (d: Date) => d.toISOString().slice(0, 10);
  return { from: s(from), to: s(to) };
}

type ReportData = { summary: Array<Record<string, unknown>>; detail: Array<Record<string, unknown>> };

function ReportesPage() {
  const [{ from, to }, setRange] = useState(defaultRange());
  const [busy, setBusy] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, ReportData>>({});
  const fns = {
    seller: useServerFn(reportSalesBySeller),
    product: useServerFn(reportSalesByProduct),
    customer: useServerFn(reportSalesByCustomer),
    trace: useServerFn(reportTraceability),
  };

  const run = async (key: keyof typeof fns) => {
    setBusy(key);
    try {
      const r = await fns[key]({ data: { from, to } });
      setData((p) => ({ ...p, [key]: r as ReportData }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setBusy(null);
  };

  const download = (key: string, name: string) => {
    const d = data[key];
    if (!d) return toast.error("Genera el reporte primero");
    downloadWorkbook({ Resumen: d.summary, Detalle: d.detail }, `${name}-${from}-a-${to}.xlsx`);
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5" />
        <h1 className="text-2xl font-bold">Reportes</h1>
      </div>
      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Desde (facturación)</label>
          <Input type="date" value={from} onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={to} onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))} />
        </div>
        <div className="text-xs text-muted-foreground">Solo se incluyen pedidos con factura Siigo emitida.</div>
      </Card>

      <Tabs defaultValue="seller">
        <TabsList>
          <TabsTrigger value="seller">Por vendedor</TabsTrigger>
          <TabsTrigger value="product">Por producto</TabsTrigger>
          <TabsTrigger value="customer">Por cliente</TabsTrigger>
          <TabsTrigger value="trace">Trazabilidad</TabsTrigger>
        </TabsList>

        <TabsContent value="seller" className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={() => run("seller")} disabled={busy === "seller"}>
              {busy === "seller" && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Generar
            </Button>
            <Button variant="outline" onClick={() => download("seller", "ventas-por-vendedor")} disabled={!data.seller}>
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>
          </div>
          {data.seller && (
            <Card className="p-3 overflow-x-auto">
              <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr>
                <th className="text-left p-2">Vendedor</th><th className="text-right p-2">Pedidos</th><th className="text-right p-2">Total</th><th className="text-right p-2">Promedio</th>
              </tr></thead><tbody>
                {(data.seller.summary as Array<{ seller: string; orders: number; total: number; average: number }>).map((r, i) => (
                  <tr key={i} className="border-t"><td className="p-2">{r.seller}</td><td className="text-right p-2">{r.orders}</td><td className="text-right p-2">{formatCurrency(r.total)}</td><td className="text-right p-2">{formatCurrency(r.average)}</td></tr>
                ))}
              </tbody></table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="product" className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={() => run("product")} disabled={busy === "product"}>
              {busy === "product" && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Generar
            </Button>
            <Button variant="outline" onClick={() => download("product", "ventas-por-producto")} disabled={!data.product}>
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>
          </div>
          {data.product && (
            <Card className="p-3 overflow-x-auto">
              <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr>
                <th className="text-left p-2">Código</th><th className="text-left p-2">Producto</th><th className="text-right p-2">Cant.</th><th className="text-right p-2">Subtotal</th><th className="text-right p-2">IVA</th><th className="text-right p-2">Total</th><th className="text-right p-2">% Part.</th>
              </tr></thead><tbody>
                {(data.product.summary as Array<{ code: string; name: string; qty: number; subtotal: number; tax: number; total: number; share_pct: number }>).map((r, i) => (
                  <tr key={i} className="border-t"><td className="p-2">{r.code}</td><td className="p-2">{r.name}</td><td className="text-right p-2">{r.qty}</td><td className="text-right p-2">{formatCurrency(r.subtotal)}</td><td className="text-right p-2">{formatCurrency(r.tax)}</td><td className="text-right p-2">{formatCurrency(r.total)}</td><td className="text-right p-2">{r.share_pct.toFixed(1)}%</td></tr>
                ))}
              </tbody></table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="customer" className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={() => run("customer")} disabled={busy === "customer"}>
              {busy === "customer" && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Generar
            </Button>
            <Button variant="outline" onClick={() => download("customer", "ventas-por-cliente")} disabled={!data.customer}>
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>
          </div>
          {data.customer && (
            <Card className="p-3 overflow-x-auto">
              <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr>
                <th className="text-left p-2">Cliente</th><th className="text-left p-2">Identificación</th><th className="text-right p-2">Facturas</th><th className="text-right p-2">Total</th><th className="text-right p-2">Última</th>
              </tr></thead><tbody>
                {(data.customer.summary as Array<{ customer: string; identification: string; orders: number; total: number; last: string | null }>).map((r, i) => (
                  <tr key={i} className="border-t"><td className="p-2">{r.customer}</td><td className="p-2">{r.identification}</td><td className="text-right p-2">{r.orders}</td><td className="text-right p-2">{formatCurrency(r.total)}</td><td className="text-right p-2">{r.last ? new Date(r.last).toLocaleDateString("es-CO") : "—"}</td></tr>
                ))}
              </tbody></table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="trace" className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={() => run("trace")} disabled={busy === "trace"}>
              {busy === "trace" && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Generar
            </Button>
            <Button variant="outline" onClick={() => download("trace", "trazabilidad")} disabled={!data.trace}>
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>
          </div>
          {data.trace && (
            <>
              <Card className="p-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  {(data.trace.summary as Array<{ total_orders: number; finalized: number; open: number; avg_min_to_delivered: number | null; avg_min_to_finalized: number | null }>).map((r, i) => (
                    <div key={i} className="contents">
                      <div><div className="text-xs text-muted-foreground">Pedidos</div><div className="font-bold">{r.total_orders}</div></div>
                      <div><div className="text-xs text-muted-foreground">Finalizados</div><div className="font-bold">{r.finalized}</div></div>
                      <div><div className="text-xs text-muted-foreground">Abiertos</div><div className="font-bold">{r.open}</div></div>
                      <div><div className="text-xs text-muted-foreground">Min prom. a entrega</div><div className="font-bold">{r.avg_min_to_delivered ?? "—"}</div></div>
                      <div><div className="text-xs text-muted-foreground">Min prom. a finalizar</div><div className="font-bold">{r.avg_min_to_finalized ?? "—"}</div></div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-3 overflow-x-auto">
                <table className="w-full text-xs"><thead className="text-muted-foreground"><tr>
                  <th className="text-left p-2">Factura</th><th className="text-left p-2">Cliente</th><th className="text-left p-2">Estado</th>
                  <th className="text-right p-2">Fact→Bod</th><th className="text-right p-2">Bod→Cond</th><th className="text-right p-2">Cond→Cli</th>
                  <th className="text-right p-2">Total a entrega</th><th className="text-right p-2">Total a finalizar</th>
                </tr></thead><tbody>
                  {(data.trace.detail as Array<{ invoice: string | null; customer: string; status: string; min_billing_to_warehouse: number | null; min_warehouse_to_driver: number | null; min_driver_to_customer: number | null; min_invoiced_to_delivered: number | null; min_total_to_finalized: number | null; is_open: boolean; elapsed_mins_open: number | null }>).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.invoice}</td><td className="p-2">{r.customer}</td><td className="p-2">{r.status}</td>
                      <td className="text-right p-2">{r.min_billing_to_warehouse ?? "—"}</td>
                      <td className="text-right p-2">{r.min_warehouse_to_driver ?? "—"}</td>
                      <td className="text-right p-2">{r.min_driver_to_customer ?? "—"}</td>
                      <td className="text-right p-2">{r.min_invoiced_to_delivered ?? (r.is_open ? `${r.elapsed_mins_open ?? "—"} (abierto)` : "—")}</td>
                      <td className="text-right p-2">{r.min_total_to_finalized ?? (r.is_open ? `${r.elapsed_mins_open ?? "—"} (abierto)` : "—")}</td>
                    </tr>
                  ))}
                </tbody></table>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}