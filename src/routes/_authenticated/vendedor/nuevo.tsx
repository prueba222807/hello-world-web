import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Plus, Trash2, Check, ArrowLeft, Save, Copy } from "lucide-react";
import { toast } from "sonner";
import { listCustomers, listPaymentMethods, listProducts, createLocalCustomer } from "@/lib/catalog/catalog.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getOrder, saveOrder } from "@/lib/orders/orders.functions";
import { getAppSettings } from "@/lib/settings/settings.functions";
import { getGeo } from "@/lib/geo";

export const Route = createFileRoute("/_authenticated/vendedor/nuevo")({
  validateSearch: (search) => ({
    orderId: typeof search.orderId === "string" ? search.orderId : undefined,
  }),
  component: NuevoPedidoPage,
});

type Customer = {
  id: string; display_name: string; identification: string;
  email?: string | null; phone?: string | null; city_name?: string | null; address?: string | null;
};

type Product = {
  id: string; code: string | null; name: string;
  price: number; tax_rate: number; stock: number | null; active?: boolean;
};

type PaymentMethod = {
  id: string; name: string; display_name: string | null; siigo_id: number; type: string | null;
  is_credit: boolean; credit_days_options: number[] | null;
};

type Line = {
  lineId: string; // client-side id (uuid)
  product: Product;
  quantity: string;
  discount: string;
  unitPrice: string;
  is_gift: boolean;
};

function newId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}
function round2(n: number) { return Math.round(n * 100) / 100; }
function num(s: string, d = 0) { const v = Number(s); return Number.isFinite(v) ? v : d; }

function lineAmounts(line: Line) {
  const qty = num(line.quantity, 0);
  const taxRate = line.is_gift ? 0 : Number(line.product.tax_rate ?? 0);
  const grossInput = line.is_gift ? 0 : num(line.unitPrice, 0);
  // El vendedor edita el precio CON IVA; lo convertimos a neto (sin IVA).
  const unitPriceNet = grossInput / (1 + taxRate / 100);
  const discount = line.is_gift ? 100 : num(line.discount, 0);
  const subtotal = qty * unitPriceNet * (1 - discount / 100);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;
  const defaultGross = Number(line.product.price ?? 0) * (1 + Number(line.product.tax_rate ?? 0) / 100);
  const manual = !line.is_gift && Math.abs(grossInput - defaultGross) > 0.01;
  return { subtotal: round2(subtotal), tax: round2(tax), total: round2(total), manual, unitPriceNet: round2(unitPriceNet), defaultGross: round2(defaultGross) };
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function NuevoPedidoPage() {
  const navigate = useNavigate();
  const { orderId } = Route.useSearch();
  const findCustomers = useServerFn(listCustomers);
  const findProducts = useServerFn(listProducts);
  const fetchPayments = useServerFn(listPaymentMethods);
  const fetchSettings = useServerFn(getAppSettings);
  const fetchOrder = useServerFn(getOrder);
  const submit = useServerFn(saveOrder);
  const createCustomerFn = useServerFn(createLocalCustomer);

  const [step, setStep] = useState<"customer" | "items" | "review">("customer");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState<string | undefined>();
  const [creditDays, setCreditDays] = useState<number | null>(null);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [maxDiscount, setMaxDiscount] = useState(0);
  const [loadingOrder, setLoadingOrder] = useState(!!orderId);
  const [submitting, setSubmitting] = useState<"pending" | "final" | null>(null);

  const [cQuery, setCQuery] = useState("");
  const [cResults, setCResults] = useState<Customer[]>([]);
  const [cLoading, setCLoading] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    identification: "", display_name: "", email: "", phone: "", address: "", city_name: "",
    first_name: "", last_name: "", commercial_name: "",
    person_type: "Person" as "Person" | "Company",
    id_type: "13",
  });
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [pQuery, setPQuery] = useState("");
  const [pResults, setPResults] = useState<Product[]>([]);
  const [pLoading, setPLoading] = useState(false);

  const selectedPm = paymentMethods.find((m) => m.id === paymentMethodId);
  const isCredit = !!selectedPm?.is_credit;
  const creditOptions: number[] = selectedPm?.credit_days_options && selectedPm.credit_days_options.length > 0
    ? selectedPm.credit_days_options
    : [15, 30, 45, 60, 90];

  useEffect(() => {
    fetchPayments({ data: { scope: "vendor" } })
      .then((r) => setPaymentMethods(r.methods as PaymentMethod[]))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Error cargando métodos de pago"));
    fetchSettings({})
      .then((r) => setMaxDiscount(Number(r.max_discount_pct ?? 0)))
      .catch(() => setMaxDiscount(0));
  }, [fetchPayments, fetchSettings]);

  // Auto-selecciona el primer plazo disponible cuando se elige un método a crédito
  useEffect(() => {
    if (isCredit) {
      if (!creditDays && creditOptions.length > 0) setCreditDays(creditOptions[0]);
    } else if (creditDays !== null) {
      setCreditDays(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethodId, isCredit]);

  useEffect(() => {
    if (!orderId) return;
    setLoadingOrder(true);
    fetchOrder({ data: { id: orderId } })
      .then((r) => {
        const order = r.order as unknown as {
          status: string; notes: string | null; delivery_date: string | null;
          payment_method_id: string | null; credit_days: number | null;
          customer: Customer | null;
          items: Array<{
            product_id: string; quantity: number; unit_price: number; discount: number;
            tax_rate: number; is_gift: boolean; manual_total: number | null; product: Product | null;
          }>;
        };
        if (!order || !["draft", "pending"].includes(order.status)) {
          toast.error("Este pedido ya no se puede editar");
          navigate({ to: "/vendedor/pedidos" });
          return;
        }
        setCustomer(order.customer);
        setNotes(order.notes ?? "");
        setDeliveryDate(order.delivery_date ?? "");
        setPaymentMethodId(order.payment_method_id ?? undefined);
        setCreditDays(order.credit_days ?? null);
        setLines((order.items ?? []).map((item) => {
          const product = item.product ?? {
            id: item.product_id, code: null, name: "Producto",
            price: Number(item.unit_price ?? 0), tax_rate: Number(item.tax_rate ?? 0), stock: null,
          };
          const rate = Number(item.tax_rate ?? product.tax_rate ?? 0);
          const grossUnit = Number(item.unit_price ?? product.price ?? 0) * (1 + rate / 100);
          return {
          lineId: newId(),
          product,
          quantity: String(Number(item.quantity ?? 1)),
          discount: String(Number(item.discount ?? 0)),
          unitPrice: String(round2(grossUnit)),
          is_gift: Boolean(item.is_gift),
          };
        }));
        setStep("items");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar el pedido"))
      .finally(() => setLoadingOrder(false));
  }, [orderId, fetchOrder, navigate]);

  useEffect(() => {
    if (step !== "customer" || orderId) return;
    const t = setTimeout(async () => {
      setCLoading(true);
      try {
        const r = await findCustomers({ data: { search: cQuery || undefined, limit: 30, active: true } });
        setCResults(r.customers as Customer[]);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
      setCLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [cQuery, step, orderId, findCustomers]);

  useEffect(() => {
    if (step !== "items") return;
    const t = setTimeout(async () => {
      setPLoading(true);
      try {
        const r = await findProducts({ data: { search: pQuery || undefined, limit: 40, active: true } });
        setPResults(r.products as Product[]);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
      setPLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [pQuery, step, findProducts]);

  // Stock acumulado por producto (suma de líneas)
  const stockByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.product.id, (m.get(l.product.id) ?? 0) + Number(l.quantity));
    return m;
  }, [lines]);

  const totals = useMemo(() => {
    return lines.reduce((acc, line) => {
      const a = lineAmounts(line);
      acc.subtotal += a.subtotal; acc.tax += a.tax; acc.total += a.total;
      return acc;
    }, { subtotal: 0, tax: 0, total: 0 });
  }, [lines]);

  const dueDate = useMemo(() => {
    if (!isCredit || !creditDays || !deliveryDate) return null;
    return addDays(deliveryDate, creditDays);
  }, [isCredit, creditDays, deliveryDate]);

  const addLine = (product: Product) => {
    const used = stockByProduct.get(product.id) ?? 0;
    if (product.stock != null && used + 1 > Number(product.stock)) {
      toast.error(`Stock insuficiente para ${product.name} (disp: ${product.stock})`);
      return;
    }
    const gross = Number(product.price ?? 0) * (1 + Number(product.tax_rate ?? 0) / 100);
    setLines((prev) => [...prev, { lineId: newId(), product, quantity: "1", discount: "0", unitPrice: String(round2(gross)), is_gift: false }]);
  };

  const updateLine = (id: string, patch: Partial<Line>) => {
    setLines((prev) => prev.map((line) => {
      if (line.lineId !== id) return line;
      const next = { ...line, ...patch };
      if (!next.is_gift && num(next.discount) > maxDiscount) {
        toast.error(`Descuento máximo permitido: ${maxDiscount}%`);
        next.discount = String(maxDiscount);
      }
      if (next.is_gift) { next.discount = "100"; }
      // Validar stock acumulado
      const otherQty = prev.filter((l) => l.product.id === next.product.id && l.lineId !== next.lineId)
        .reduce((s, l) => s + num(l.quantity), 0);
      const nextQty = num(next.quantity);
      if (next.product.stock != null && otherQty + nextQty > Number(next.product.stock)) {
        toast.error(`Stock máximo para ${next.product.name}: ${next.product.stock}`);
        next.quantity = String(Math.max(0, Number(next.product.stock) - otherQty));
      }
      return next;
    }));
  };

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.lineId !== id));

  const duplicateLine = (id: string) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.lineId === id);
      if (idx < 0) return prev;
      const src = prev[idx];
      const used = prev.filter((l) => l.product.id === src.product.id).reduce((s, l) => s + num(l.quantity), 0);
      if (src.product.stock != null && used + num(src.quantity) > Number(src.product.stock)) {
        toast.error(`Stock insuficiente para duplicar ${src.product.name}`);
        return prev;
      }
      const copy: Line = { ...src, lineId: newId() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const onSubmit = async (finalize: boolean) => {
    if (!customer || lines.length === 0) return;
    if (finalize) {
      if (!paymentMethodId) return toast.error("Selecciona un método de pago");
      if (!deliveryDate) return toast.error("Selecciona fecha de entrega");
      if (isCredit && !creditDays) return toast.error("Selecciona los días de crédito");
    }

    setSubmitting(finalize ? "final" : "pending");
    try {
      const geo = await getGeo();
      const r = await submit({
        data: {
          id: orderId,
          customer_id: customer.id,
          payment_method_id: paymentMethodId ?? null,
          delivery_date: deliveryDate || null,
          credit_days: isCredit ? creditDays ?? null : null,
          notes: notes || undefined,
          finalize,
          created_lat: geo.lat,
          created_lng: geo.lng,
          created_geo_accuracy: geo.accuracy,
          items: lines.map((line) => ({
            product_id: line.product.id,
            quantity: num(line.quantity),
            unit_price: line.is_gift ? 0 : lineAmounts(line).unitPriceNet,
            discount: line.is_gift ? 100 : num(line.discount),
            tax_rate: line.is_gift ? 0 : line.product.tax_rate,
            is_gift: line.is_gift,
            manual_total: null,
          })),
        },
      });
      toast.success(finalize ? `Pedido finalizado por ${fmt(r.total)}` : `Pedido guardado por ${fmt(r.total)}`);
      navigate({ to: "/vendedor/pedidos" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar pedido");
    } finally {
      setSubmitting(null);
    }
  };

  if (loadingOrder) {
    return <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 space-y-4 pb-32">
      <div className="flex items-center gap-2">
        {step !== "customer" && (
          <Button variant="ghost" size="icon" onClick={() => setStep(step === "review" ? "items" : "customer")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <h1 className="text-xl font-bold">
          {orderId ? "Editar pedido" : step === "customer" ? "Selecciona cliente" : step === "items" ? "Agrega productos" : "Revisar pedido"}
        </h1>
      </div>

      {step === "customer" && (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={cQuery} onChange={(e) => setCQuery(e.target.value)} placeholder="Buscar cliente" className="pl-9" />
            </div>
            <Button variant="outline" onClick={() => setNewCustomerOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nuevo
            </Button>
          </div>
          {cLoading ? (
            <div className="grid place-items-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : cResults.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin resultados.</p>
          ) : (
            <div className="space-y-2">
              {cResults.map((item) => (
                <button key={item.id} onClick={() => { setCustomer(item); setStep("items"); }} className="w-full text-left">
                  <Card className="p-3 hover:bg-accent/30 transition-colors">
                    <div className="font-medium">{item.display_name}</div>
                    <div className="text-xs text-muted-foreground">{item.identification} · {item.email ?? "sin email"} · {item.city_name ?? "sin ciudad"}</div>
                  </Card>
                </button>
              ))}
            </div>
          )}

          <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo cliente</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      value={newCustomer.person_type}
                      onChange={(e) => {
                        const pt = e.target.value as "Person" | "Company";
                        setNewCustomer((s) => ({ ...s, person_type: pt, id_type: pt === "Company" ? "31" : "13" }));
                      }}
                    >
                      <option value="Person">Persona Natural</option>
                      <option value="Company">Persona Jurídica (NIT)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Tipo de doc.</Label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      value={newCustomer.id_type}
                      onChange={(e) => setNewCustomer((s) => ({ ...s, id_type: e.target.value }))}
                    >
                      {newCustomer.person_type === "Person" ? (
                        <>
                          <option value="13">Cédula de ciudadanía (CC)</option>
                          <option value="22">Cédula de extranjería (CE)</option>
                          <option value="41">Pasaporte</option>
                          <option value="42">Doc. identificación extranjero</option>
                          <option value="50">NIT otro país</option>
                          <option value="91">NUIP</option>
                          <option value="11">Registro civil</option>
                          <option value="12">Tarjeta de identidad</option>
                          <option value="21">Tarjeta de extranjería</option>
                        </>
                      ) : (
                        <>
                          <option value="31">NIT</option>
                          <option value="50">NIT otro país</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{newCustomer.person_type === "Company" ? "NIT *" : "Número de documento *"}</Label>
                  <Input value={newCustomer.identification} onChange={(e) => setNewCustomer((s) => ({ ...s, identification: e.target.value }))} />
                </div>
                {newCustomer.person_type === "Person" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Nombres *</Label>
                      <Input value={newCustomer.first_name} onChange={(e) => setNewCustomer((s) => ({ ...s, first_name: e.target.value, display_name: `${e.target.value} ${s.last_name}`.trim() }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Apellidos *</Label>
                      <Input value={newCustomer.last_name} onChange={(e) => setNewCustomer((s) => ({ ...s, last_name: e.target.value, display_name: `${s.first_name} ${e.target.value}`.trim() }))} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <Label className="text-xs">Razón social *</Label>
                      <Input value={newCustomer.display_name} onChange={(e) => setNewCustomer((s) => ({ ...s, display_name: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Nombre comercial</Label>
                      <Input value={newCustomer.commercial_name} onChange={(e) => setNewCustomer((s) => ({ ...s, commercial_name: e.target.value }))} />
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Teléfono *</Label>
                    <Input value={newCustomer.phone} onChange={(e) => setNewCustomer((s) => ({ ...s, phone: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Ciudad *</Label>
                    <Input value={newCustomer.city_name} onChange={(e) => setNewCustomer((s) => ({ ...s, city_name: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer((s) => ({ ...s, email: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Dirección *</Label>
                  <Input value={newCustomer.address} onChange={(e) => setNewCustomer((s) => ({ ...s, address: e.target.value }))} />
                </div>
                <div className="text-[11px] text-muted-foreground bg-amber-500/10 border border-amber-500/30 rounded p-2">
                  El cliente quedará en <strong>pendiente de aprobación</strong>. Podrás crear el pedido normalmente, pero el área de facturación no podrá facturarlo hasta que el administrador apruebe el tercero y se cree en Siigo.
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setNewCustomerOpen(false)} disabled={creatingCustomer}>Cancelar</Button>
                <Button
                  disabled={creatingCustomer}
                  onClick={async () => {
                    const isPerson = newCustomer.person_type === "Person";
                    const display = isPerson
                      ? `${newCustomer.first_name} ${newCustomer.last_name}`.trim()
                      : newCustomer.display_name.trim();
                    if (!newCustomer.identification.trim()) return toast.error("El número de documento es obligatorio");
                    if (isPerson && (!newCustomer.first_name.trim() || !newCustomer.last_name.trim())) {
                      return toast.error("Nombres y apellidos son obligatorios");
                    }
                    if (!isPerson && !display) return toast.error("La razón social es obligatoria");
                    if (!newCustomer.phone.trim()) return toast.error("Teléfono obligatorio");
                    if (!newCustomer.email.trim()) return toast.error("Email obligatorio");
                    if (!newCustomer.address.trim()) return toast.error("Dirección obligatoria");
                    if (!newCustomer.city_name.trim()) return toast.error("Ciudad obligatoria");
                    setCreatingCustomer(true);
                    try {
                      const r = await createCustomerFn({ data: {
                        identification: newCustomer.identification.trim(),
                        display_name: display,
                        person_type: newCustomer.person_type,
                        id_type: newCustomer.id_type,
                        first_name: isPerson ? newCustomer.first_name.trim() : undefined,
                        last_name: isPerson ? newCustomer.last_name.trim() : undefined,
                        commercial_name: !isPerson && newCustomer.commercial_name.trim() ? newCustomer.commercial_name.trim() : undefined,
                        email: newCustomer.email.trim() || undefined,
                        phone: newCustomer.phone.trim() || undefined,
                        address: newCustomer.address.trim() || undefined,
                        city_name: newCustomer.city_name.trim() || undefined,
                      }});
                      toast.success("Cliente enviado a aprobación. Puedes continuar con el pedido.");
                      setNewCustomerOpen(false);
                      setNewCustomer({ identification: "", display_name: "", email: "", phone: "", address: "", city_name: "", first_name: "", last_name: "", commercial_name: "", person_type: "Person", id_type: "13" });
                      setCustomer(r.customer as Customer);
                      setStep("items");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Error");
                    } finally { setCreatingCustomer(false); }
                  }}
                >{creatingCustomer ? <Loader2 className="w-4 h-4 animate-spin" /> : "Solicitar y continuar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {false && (
        <Dialog open={false} onOpenChange={() => {}}>
          <DialogContent>
            <DialogFooter className="gap-2">
              <Button
                onClick={async () => {
                  if (!newCustomer.identification.trim() || !newCustomer.display_name.trim()) {
                      toast.error("Identificación y nombre son obligatorios");
                      return;
                    }
                    setCreatingCustomer(true);
                    try {
                      const r = await createCustomerFn({ data: {
                        identification: newCustomer.identification.trim(),
                        display_name: newCustomer.display_name.trim(),
                        person_type: newCustomer.person_type,
                        id_type: newCustomer.id_type,
                        email: newCustomer.email.trim() || undefined,
                        phone: newCustomer.phone.trim() || undefined,
                        address: newCustomer.address.trim() || undefined,
                        city_name: newCustomer.city_name.trim() || undefined,
                      }});
                      toast.success("Cliente creado");
                      setNewCustomerOpen(false);
                      setNewCustomer({ identification: "", display_name: "", email: "", phone: "", address: "", city_name: "", first_name: "", last_name: "", commercial_name: "", person_type: "Person", id_type: "13" });
                      setCustomer(r.customer as Customer);
                      setStep("items");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Error");
                    } finally { setCreatingCustomer(false); }
                  }}
              >{creatingCustomer ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear y continuar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {step === "items" && customer && (
        <>
          <Card className="p-3 bg-accent/20">
            <div className="text-xs text-muted-foreground">Cliente</div>
            <div className="font-medium">{customer.display_name}</div>
            <div className="text-xs text-muted-foreground">{customer.identification}</div>
          </Card>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={pQuery} onChange={(e) => setPQuery(e.target.value)} placeholder="Buscar producto por código o nombre" className="pl-9" />
          </div>
          {pLoading ? (
            <div className="grid place-items-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {pResults.map((product) => {
                const tax = Number(product.price) * (Number(product.tax_rate) / 100);
                const used = stockByProduct.get(product.id) ?? 0;
                const remaining = product.stock != null ? Number(product.stock) - used : null;
                const noStock = remaining != null && remaining <= 0;
                return (
                  <Card key={product.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {product.code} · Base {fmt(Number(product.price))} · IVA {product.tax_rate}% · Total {fmt(Number(product.price) + tax)}
                      </div>
                      <div className="text-xs text-muted-foreground">Stock: {product.stock ?? "sin control"}{remaining != null ? ` · disp: ${remaining}` : ""}</div>
                    </div>
                    <Button size="icon" onClick={() => addLine(product)} disabled={noStock}><Plus className="w-4 h-4" /></Button>
                  </Card>
                );
              })}
            </div>
          )}

          {lines.length > 0 && (
            <Card className="p-3 space-y-3">
              <div className="font-medium">Líneas ({lines.length})</div>
              {lines.map((line) => {
                const a = lineAmounts(line);
                return (
                  <div key={line.lineId} className="border-b last:border-0 pb-3 last:pb-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{line.product.name} {a.manual && <Badge variant="outline" className="ml-1 text-[10px]">Ajustado</Badge>}{line.is_gift && <Badge variant="outline" className="ml-1 text-[10px]">Obsequio</Badge>}</div>
                        <div className="text-xs text-muted-foreground">{line.product.code} · {fmt(line.product.price)} · IVA {line.product.tax_rate}%</div>
                      </div>
                      <div className="flex">
                        <Button variant="ghost" size="icon" onClick={() => duplicateLine(line.lineId)} title="Duplicar línea">
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeLine(line.lineId)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Cantidad</Label>
                        <Input type="number" min={0.01} step="0.01" value={line.quantity}
                          onChange={(e) => updateLine(line.lineId, { quantity: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Desc. % (máx {maxDiscount}%)</Label>
                        <Input type="number" min={0} max={maxDiscount} step="0.01" disabled={line.is_gift}
                          value={line.is_gift ? "100" : line.discount}
                          onChange={(e) => updateLine(line.lineId, { discount: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={line.is_gift} onCheckedChange={(checked) => updateLine(line.lineId, { is_gift: checked })} />
                        Obsequio
                      </label>
                      <div className="text-xs text-right text-muted-foreground">
                        Sub {fmt(a.subtotal)} + IVA {fmt(a.tax)} = {fmt(a.total)}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Precio unitario (con IVA) — editable</Label>
                      <Input type="number" min={0} step="0.01" disabled={line.is_gift}
                        value={line.is_gift ? "0" : line.unitPrice}
                        onChange={(e) => updateLine(line.lineId, { unitPrice: e.target.value })} />
                      {a.manual && (
                        <button type="button" className="text-[10px] text-primary mt-1 underline"
                          onClick={() => updateLine(line.lineId, { unitPrice: String(a.defaultGross) })}>
                          Restablecer precio del producto ({fmt(a.defaultGross)})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {lines.length > 0 && (
            <Button className="w-full" onClick={() => setStep("review")} disabled={lines.some((l) => num(l.quantity) <= 0)}>
              Continuar · {fmt(totals.total)}
            </Button>
          )}
        </>
      )}

      {step === "review" && customer && (
        <>
          <Card className="p-3 space-y-1">
            <div className="text-xs text-muted-foreground">Cliente</div>
            <div className="font-medium">{customer.display_name}</div>
            <div className="text-xs text-muted-foreground">NIT/CC: {customer.identification}</div>
          </Card>

          <Card className="p-3 space-y-3">
            <div className="font-medium">Datos para finalizar</div>
            <div className="space-y-2">
              <Label>Método de pago</Label>
              <Select value={paymentMethodId} onValueChange={(v) => { setPaymentMethodId(v); setCreditDays(null); }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar método" /></SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.display_name || m.name}{m.is_credit ? " (crédito)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCredit && (
              <div className="space-y-2">
                <Label>Días de crédito</Label>
                <div className="flex flex-wrap gap-2">
                  {creditOptions.map((d) => (
                    <button key={d} type="button" onClick={() => setCreditDays(d)}
                      className={`px-3 py-1.5 rounded-md border text-sm ${creditDays === d ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent/40"}`}>
                      {d} días
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Fecha de entrega</Label>
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>

            {dueDate && (
              <div className="text-xs text-muted-foreground">Vencimiento estimado: <span className="font-medium text-foreground">{dueDate}</span></div>
            )}
          </Card>

          <Card className="p-3 space-y-2">
            <div className="font-medium">Productos</div>
            {lines.map((line) => {
              const a = lineAmounts(line);
              return (
                <div key={line.lineId} className="flex justify-between gap-2 text-sm">
                  <div className="min-w-0 truncate">
                    {line.quantity} × {line.product.name}
                    {line.is_gift && <Badge variant="outline" className="ml-1">Obsequio</Badge>}
                    {a.manual && <Badge variant="outline" className="ml-1">Ajustado</Badge>}
                  </div>
                  <div className="font-medium ml-2">{fmt(a.total)}</div>
                </div>
              );
            })}
          </Card>

          <Card className="p-3 space-y-2">
            <Label className="text-xs text-muted-foreground">Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Card>

          <Card className="p-3 space-y-1">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span>IVA</span><span>{fmt(totals.tax)}</span></div>
            <div className="flex justify-between text-base font-bold border-t pt-2"><span>Total</span><span>{fmt(totals.total)}</span></div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => onSubmit(false)} disabled={!!submitting}>
              {submitting === "pending" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar pendiente
            </Button>
            <Button onClick={() => onSubmit(true)} disabled={!!submitting}>
              {submitting === "final" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              Finalizar pedido
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
