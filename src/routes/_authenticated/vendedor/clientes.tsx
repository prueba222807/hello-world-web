import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Search, Users, MapPin, History, Wallet, Phone, Mail, FileText, Receipt, Package, ExternalLink, ChevronRight, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { listCustomers } from "@/lib/catalog/catalog.functions";
import { listEventTypes, createCustomerEvent, listCustomerEvents } from "@/lib/customers/events.functions";
import { getCustomerFinancials, type CustomerInvoice } from "@/lib/customers/financials.functions";
import { getGeo } from "@/lib/geo";
import { EvidenceCapture, clearEvidence } from "@/components/flow/EvidenceCapture";

export const Route = createFileRoute("/_authenticated/vendedor/clientes")({
  component: ClientesPage,
});

type Customer = {
  id: string;
  identification: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city_name: string | null;
  seller_siigo_id: string | null;
};

type EventType = { id: string; code: string; label: string; icon: string | null };
type CustomerEvent = { id: string; event_type: string; notes: string | null; lat: number | null; lng: number | null; photo_url: string | null; created_at: string };

const fmtCOP = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function ClientesPage() {
  const fetchCustomers = useServerFn(listCustomers);
  const fetchTypes = useServerFn(listEventTypes);
  const createEvent = useServerFn(createCustomerEvent);
  const fetchEvents = useServerFn(listCustomerEvents);
  const fetchFinancials = useServerFn(getCustomerFinancials);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<EventType[]>([]);
  const [evtCustomer, setEvtCustomer] = useState<Customer | null>(null);
  const [evtType, setEvtType] = useState<string>("");
  const [evtNotes, setEvtNotes] = useState("");
  const [evtPhotoUrls, setEvtPhotoUrls] = useState<string[]>([]);
  const [evtBusy, setEvtBusy] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<CustomerEvent[]>([]);
  const [finCustomer, setFinCustomer] = useState<Customer | null>(null);
  const [finData, setFinData] = useState<Awaited<ReturnType<typeof fetchFinancials>> | null>(null);
  const [finLoading, setFinLoading] = useState(false);
  const [finTab, setFinTab] = useState<"cartera" | "facturas" | "pedidos">("cartera");

  useEffect(() => {
    fetchTypes({}).then((r) => setTypes(r.types as EventType[])).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetchCustomers({ data: { search: q || undefined, limit: 300 } });
        setRows(r.customers as Customer[]);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const submitEvent = async () => {
    if (!evtCustomer || !evtType) return toast.error("Selecciona tipo de evento");
    setEvtBusy(true);
    try {
      const geo = await getGeo();
      const photo_url = evtPhotoUrls[0] ?? null;
      await createEvent({ data: { customer_id: evtCustomer.id, event_type: evtType, notes: evtNotes || undefined, lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy, photo_url } });
      toast.success("Evento registrado");
      if (evtCustomer) clearEvidence(`evidence:visit:${evtCustomer.id}`);
      setEvtCustomer(null); setEvtType(""); setEvtNotes(""); setEvtPhotoUrls([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setEvtBusy(false);
  };

  const openHistory = async (c: Customer) => {
    setHistoryCustomer(c); setHistory([]);
    try {
      const r = await fetchEvents({ data: { customer_id: c.id } });
      setHistory(r.events as CustomerEvent[]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  };

  const openFinancials = async (c: Customer) => {
    setFinCustomer(c); setFinData(null); setFinLoading(true); setFinTab("cartera");
    try {
      const r = await fetchFinancials({ data: { customer_id: c.id } });
      setFinData(r);
      if (r.siigoError) toast.error(`Siigo: ${r.siigoError}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setFinLoading(false);
  };

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 grid place-items-center"><Users className="w-5 h-5 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight">Mis clientes</h1>
            <p className="text-[11px] text-muted-foreground">{loading ? "Cargando…" : `${rows.length} asignados`}</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="NIT, nombre, email, ciudad…" className="pl-9 h-11 rounded-xl" />
        </div>
      </div>

      <div className="px-4 pt-3">
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl">
            <Users className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
            Sin clientes asignados todavía.
          </Card>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((c) => (
              <li key={c.id}>
                <Card className="overflow-hidden rounded-2xl border-border/60 active:scale-[0.99] transition-transform">
                  <button onClick={() => openFinancials(c)} className="w-full text-left p-3 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 grid place-items-center text-sm font-semibold text-primary shrink-0">
                      {initials(c.display_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate text-[15px]">{c.display_name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">NIT {c.identification}{c.city_name ? ` · ${c.city_name}` : ""}</div>
                      <div className="flex gap-3 mt-0.5 text-[11px] text-muted-foreground">
                        {c.phone && <span className="flex items-center gap-1 truncate"><Phone className="w-3 h-3" />{c.phone}</span>}
                        {c.email && <span className="flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{c.email}</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                  <div className="grid grid-cols-3 border-t border-border/60 divide-x divide-border/60 text-[11px] font-medium">
                    <button onClick={() => openFinancials(c)} className="py-2.5 flex items-center justify-center gap-1 text-primary active:bg-accent/50">
                      <Wallet className="w-3.5 h-3.5" />Cartera
                    </button>
                    <button onClick={() => setEvtCustomer(c)} className="py-2.5 flex items-center justify-center gap-1 active:bg-accent/50">
                      <MapPin className="w-3.5 h-3.5" />Visita
                    </button>
                    <button onClick={() => openHistory(c)} className="py-2.5 flex items-center justify-center gap-1 active:bg-accent/50">
                      <History className="w-3.5 h-3.5" />Historial
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!evtCustomer} onOpenChange={(o) => !o && setEvtCustomer(null)}>
        <DialogContent className="sm:max-w-md rounded-t-3xl sm:rounded-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base"><MapPin className="w-4 h-4 text-primary" />Registrar visita</DialogTitle>
            <p className="text-xs text-muted-foreground truncate">{evtCustomer?.display_name}</p>
          </DialogHeader>
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {types.map((t) => (
                <button key={t.code} type="button" onClick={() => setEvtType(t.code)}
                  className={`p-2.5 rounded-xl border text-xs font-medium transition-colors ${evtType === t.code ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border/60 hover:bg-accent/40"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <Textarea placeholder="Notas (opcional)" value={evtNotes} onChange={(e) => setEvtNotes(e.target.value)} className="rounded-xl" rows={3} />
            {evtCustomer && (
              <EvidenceCapture
                folder={`events/${evtCustomer.id}`}
                persistKey={`evidence:visit:${evtCustomer.id}`}
                label="Evidencia (opcional)"
                onChange={setEvtPhotoUrls}
              />
            )}
            <p className="text-[11px] text-muted-foreground">📍 Se capturará tu ubicación actual automáticamente.</p>
          </div>
          <DialogFooter className="px-5 pb-5 pt-2 gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => setEvtCustomer(null)}>Cancelar</Button>
            <Button className="flex-1 rounded-xl h-11" onClick={submitEvent} disabled={evtBusy || !evtType}>
              {evtBusy && <Loader2 className="w-4 h-4 animate-spin" />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyCustomer} onOpenChange={(o) => !o && setHistoryCustomer(null)}>
        <DialogContent className="sm:max-w-md rounded-t-3xl sm:rounded-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base"><History className="w-4 h-4 text-primary" />Historial de visitas</DialogTitle>
            <p className="text-xs text-muted-foreground truncate">{historyCustomer?.display_name}</p>
          </DialogHeader>
          <div className="px-5 py-4 max-h-[65vh] overflow-auto">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin eventos registrados.</p>
            ) : (
              <ol className="space-y-3">
                {history.map((e) => (
                  <li key={e.id} className="relative pl-5 border-l-2 border-primary/30">
                    <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-primary" />
                    <div className="text-sm font-semibold">{e.event_type}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString("es-CO")}</div>
                    {e.notes && <div className="text-xs italic mt-0.5 text-muted-foreground">{e.notes}</div>}
                    <div className="flex gap-3 text-[11px] mt-1">
                      {e.lat && e.lng && <a href={`https://maps.google.com/?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary"><MapPin className="w-3 h-3" />mapa</a>}
                      {e.photo_url && <a href={e.photo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary"><Camera className="w-3 h-3" />evidencia</a>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!finCustomer} onOpenChange={(o) => !o && setFinCustomer(null)}>
        <DialogContent className="sm:max-w-xl rounded-t-3xl sm:rounded-2xl p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base"><Wallet className="w-4 h-4 text-primary" />Cartera</DialogTitle>
            <p className="text-xs text-muted-foreground truncate">{finCustomer?.display_name}</p>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {finLoading ? (
              <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : !finData ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos.</p>
            ) : (
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <KpiCard icon={<CheckCircle2 className="w-4 h-4" />} label="Pagado" value={fmtCOP(finData.summary.paid)} tone="ok" />
                  <KpiCard icon={<Receipt className="w-4 h-4" />} label="Por pagar" value={fmtCOP(finData.summary.pending_total)} tone="neutral" />
                  <KpiCard icon={<Clock className="w-4 h-4" />} label="Sin vencer" value={fmtCOP(finData.summary.pending_not_due)} tone="warn" />
                  <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="Vencidas" value={fmtCOP(finData.summary.overdue)} tone="danger" />
                </div>

                <div className="flex gap-1 p-1 bg-muted/60 rounded-xl">
                  {([
                    { k: "cartera", label: "Cartera", icon: <Wallet className="w-3.5 h-3.5" /> },
                    { k: "facturas", label: "Facturas", icon: <FileText className="w-3.5 h-3.5" /> },
                    { k: "pedidos", label: "Pedidos", icon: <Package className="w-3.5 h-3.5" /> },
                  ] as const).map((t) => (
                    <button key={t.k} onClick={() => setFinTab(t.k)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors ${finTab === t.k ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}>
                      {t.icon}{t.label}
                    </button>
                  ))}
                </div>

                <div>
                  {finTab === "cartera" && (
                    <CarteraList invoices={finData.invoices.filter((i: CustomerInvoice) => i.status !== "paid")} />
                  )}
                  {finTab === "facturas" && (
                    <CarteraList invoices={finData.invoices} showStatus />
                  )}
                  {finTab === "pedidos" && (
                    finData.orders.length === 0 ? (
                      <EmptyState icon={<Package className="w-5 h-5" />} text="Sin pedidos." />
                    ) : (
                      <ul className="space-y-2">
                        {finData.orders.map((o: { id: string; order_number: string | null; status: string; total: number; created_at: string; siigo_invoice_number: string | null; current_holder_role: string | null }) => (
                          <li key={o.id}>
                            <Card className="p-3 rounded-xl">
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm">{o.order_number ?? o.id.slice(0, 8)}</div>
                                  <div className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString("es-CO")}</div>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{o.status}</span>
                                    {o.current_holder_role && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{o.current_holder_role}</span>}
                                    {o.siigo_invoice_number && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">FV {o.siigo_invoice_number}</span>}
                                  </div>
                                </div>
                                <div className="text-right font-mono text-sm font-semibold shrink-0">{fmtCOP(Number(o.total))}</div>
                              </div>
                            </Card>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>

                {finData.siigoError && (
                  <div className="text-[11px] text-destructive p-2.5 bg-destructive/5 rounded-lg flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>No se pudo conectar a Siigo: {finData.siigoError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "ok" | "neutral" | "warn" | "danger" }) {
  const toneClasses = {
    ok: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    neutral: "from-primary/15 to-primary/5 text-primary",
    warn: "from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-400",
    danger: "from-red-500/15 to-red-500/5 text-red-700 dark:text-red-400",
  }[tone];
  return (
    <div className={`rounded-2xl p-3 bg-gradient-to-br border border-border/40 ${toneClasses}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">{icon}{label}</div>
      <div className="mt-1 font-bold text-[15px] tracking-tight">{value}</div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">
      <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-muted grid place-items-center text-muted-foreground/60">{icon}</div>
      {text}
    </div>
  );
}

function CarteraList({ invoices, showStatus }: { invoices: CustomerInvoice[]; showStatus?: boolean }) {
  if (invoices.length === 0) return <EmptyState icon={<Receipt className="w-5 h-5" />} text="Sin facturas." />;
  const statusBadge = (s: CustomerInvoice["status"]) => {
    if (s === "paid") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Pagada</span>;
    if (s === "overdue") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-400">Vencida</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">Pendiente</span>;
  };
  return (
    <ul className="space-y-2">
      {invoices.map((i) => (
        <li key={i.id}>
          <Card className="p-3 rounded-xl">
            <div className="flex justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-sm truncate">{i.number}</span>
                  {showStatus && statusBadge(i.status)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {i.date ? new Date(i.date).toLocaleDateString("es-CO") : "—"}
                  {i.due_date ? ` · vence ${new Date(i.due_date).toLocaleDateString("es-CO")}` : ""}
                </div>
                {i.pdf_url && (
                  <a href={i.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary mt-1">
                    <ExternalLink className="w-3 h-3" />Ver PDF
                  </a>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-semibold text-sm">{fmtCOP(i.total)}</div>
                {i.status !== "paid" && (
                  <div className={`text-[11px] font-mono ${i.status === "overdue" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-500"}`}>
                    saldo {fmtCOP(i.balance)}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
