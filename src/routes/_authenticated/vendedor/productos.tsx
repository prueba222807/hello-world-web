import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Package } from "lucide-react";
import { toast } from "sonner";
import { listProducts } from "@/lib/catalog/catalog.functions";

export const Route = createFileRoute("/_authenticated/vendedor/productos")({
  component: ProductosPage,
});

type Product = { id: string; code: string | null; name: string; price: number; tax_rate: number; stock: number | null; active: boolean };

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function ProductosPage() {
  const fetchList = useServerFn(listProducts);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "stock">("all");
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetchList({ data: {
          search: q || undefined,
          limit: 200,
          active: filter === "active" ? true : undefined,
          inStockOnly: filter === "stock" ? true : undefined,
        } });
        setRows(r.products as Product[]);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, filter]);

  const items = useMemo(() => rows.map((p) => {
    const priceWith = round2(p.price * (1 + (p.tax_rate ?? 0) / 100));
    return { ...p, priceWith };
  }), [rows]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Package className="w-5 h-5" />
        <h1 className="text-xl font-bold">Productos</h1>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código o nombre" className="pl-9" />
      </div>
      <div className="flex gap-2 text-xs">
        {(["all","active","stock"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md border transition-colors ${filter===f ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent/40"}`}>
            {f === "all" ? "Todos" : f === "active" ? "Activos" : "Con stock"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Sin productos. El admin debe sincronizar el catálogo.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <Card key={p.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">Código: {p.code ?? "—"}</div>
                </div>
                <Badge variant={p.active ? "secondary" : "outline"} className="shrink-0">
                  {p.active ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Stat label="Sin IVA" value={fmt(p.price)} />
                <Stat label={`IVA ${p.tax_rate}%`} value={fmt(p.price * (p.tax_rate / 100))} />
                <Stat label="Con IVA" value={fmt(p.priceWith)} bold />
                <Stat label="Stock" value={p.stock == null ? "—" : String(p.stock)} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="bg-accent/20 rounded-md px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={bold ? "font-semibold" : ""}>{value}</div>
    </div>
  );
}

function round2(n: number) { return Math.round(n * 100) / 100; }
