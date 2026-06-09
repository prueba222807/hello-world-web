import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, Truck, ExternalLink, Pencil, ArrowLeft, AlertTriangle, Ban, CheckCircle2, Send, MapPin, ImageIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getOrder, invoiceOrder, dispatchOrder, cancelOrder, acknowledgeManualPrice, linkExistingSiigoInvoice } from "@/lib/orders/orders.functions";
import { sendHandoff, deliverToCustomer, listHandoffs, listUsersByRole } from "@/lib/handoffs/handoffs.functions";
import { createOrderRequest } from "@/lib/orders/requests.functions";
import { getGeo } from "@/lib/geo";
import { Input } from "@/components/ui/input";
import { EvidenceCapture, clearEvidence } from "@/components/flow/EvidenceCapture";
import { canSeeHandoffEvidence } from "@/lib/order-visibility";
import type { AppRole } from "@/lib/order-flow";
import { OrderFlowSection } from "@/components/flow/OrderFlowSection";

export const Route = createFileRoute("/_authenticated/pedidos/$id")({
  component: OrderDetailPage,
});

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n) || 0);
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", pending: "Pendiente", confirmed: "Confirmado",
  invoiced: "Facturado", dispatched: "Reparto", cancelled: "Cancelado",
  ready_for_warehouse: "Hacia bodega", in_warehouse: "En bodega",
  ready_for_driver: "Hacia conductor", in_transit: "En ruta",
  delivered: "Entregado", returning_to_billing: "Regreso a facturación",
  with_collections: "En cartera", closed: "Cerrado", voided: "Anulado",
};

type OrderDetail = {
  id: string; status: string; total: number; subtotal: number; tax_total: number;
  notes: string | null; delivery_date: string | null; due_date: string | null; credit_days: number | null;
  has_manual_price: boolean; manual_price_acknowledged: boolean;
  siigo_invoice_id: string | null; siigo_invoice_number: string | null; invoice_pdf_url: string | null;
  invoiced_at: string | null; dispatched_at: string | null; created_at: string;
  seller_id: string;
  confirmed_at?: string | null;
  pending_holder_user?: string | null;
  customer: { id: string; display_name: string; identification: string; email: string | null; phone: string | null; address: string | null; city_name: string | null } | null;
  payment_method: { id: string; name: string; is_credit: boolean } | null;
  seller: { id: string; full_name: string | null; email: string | null } | null;
  items: Array<{
    id: string; product_id: string; quantity: number; unit_price: number; discount: number;
    tax_rate: number; is_gift: boolean; manual_total: number | null;
    line_subtotal: number; line_tax: number; line_total: number;
    product: { id: string; name: string; code: string; tax_rate: number } | null;
  }>;
};

function OrderDetailPage() {
  const { id } = Route.useParams();
  const { user, hasRole, roles } = useAuth();
  const router = useRouter();
  const fetchOrder = useServerFn(getOrder);
  const doInvoice = useServerFn(invoiceOrder);
  const doDispatch = useServerFn(dispatchOrder);
  const doCancel = useServerFn(cancelOrder);
  const doAck = useServerFn(acknowledgeManualPrice);
  const doSend = useServerFn(sendHandoff);
  const doDeliver = useServerFn(deliverToCustomer);
  const fetchHandoffs = useServerFn(listHandoffs);
  const doRequest = useServerFn(createOrderRequest);
  const fetchUsersByRole = useServerFn(listUsersByRole);
  const doLinkInvoice = useServerFn(linkExistingSiigoInvoice);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [handoffs, setHandoffs] = useState<Array<{ id: string; action: string; status: string; from_role: string | null; to_role: string; notes: string | null; lat: number | null; lng: number | null; photo_url: string | null; created_at: string; responded_at: string | null }>>([]);
  const [reqOpen, setReqOpen] = useState(false);
  const [reqType, setReqType] = useState<"cancel" | "return">("cancel");
  const [reqReason, setReqReason] = useState("");
  const [sendOpen, setSendOpen] = useState<null | "bodega" | "conductor" | "facturacion" | "cartera">(null);
  const [sendNotes, setSendNotes] = useState("");
  const [sendUser, setSendUser] = useState<string>("");
  const [sendPhotoUrls, setSendPhotoUrls] = useState<string[]>([]);
  const [sendUsers, setSendUsers] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [delivOpen, setDelivOpen] = useState(false);
  const [delivNotes, setDelivNotes] = useState("");
  const [delivPhotoUrls, setDelivPhotoUrls] = useState<string[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInvoiceId, setLinkInvoiceId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchOrder({ data: { id } }),
      fetchHandoffs({ data: { order_id: id } }).catch(() => ({ handoffs: [] })),
    ])
      .then(([r, h]) => {
        setOrder(r.order as unknown as OrderDetail);
        setHandoffs((h.handoffs ?? []) as typeof handoffs);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [fetchOrder, fetchHandoffs, id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!sendOpen) { setSendUsers([]); setSendUser(""); setSendNotes(""); setSendPhotoUrls([]); return; }
    fetchUsersByRole({ data: { role: sendOpen } })
      .then((r) => setSendUsers(r.users))
      .catch(() => setSendUsers([]));
  }, [sendOpen, fetchUsersByRole]);

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!order) return <div className="p-6">Pedido no encontrado</div>;

  const isOwner = user?.id === order.seller_id;
  const canEdit = isOwner && ["draft", "pending"].includes(order.status);
  const canInvoice = hasRole(["admin", "facturacion"]) && order.status === "confirmed";
  const canDispatch = hasRole(["admin", "facturacion", "bodega"]) && order.status === "invoiced";
  const canCancel = hasRole("admin") && !["invoiced", "dispatched", "cancelled"].includes(order.status);
  const canAck = hasRole(["admin", "facturacion"]) && order.has_manual_price && !order.manual_price_acknowledged;
  const canRequest = (isOwner || hasRole(["admin", "facturacion"])) && ["invoiced", "dispatched", "delivered", "with_collections", "in_warehouse", "in_transit", "ready_for_warehouse", "ready_for_driver"].includes(order.status);
  const canSendBodega = hasRole(["admin", "facturacion"]) && order.status === "invoiced";
  const canSendConductor = hasRole(["admin", "bodega"]) && order.status === "in_warehouse";
  const canSendCartera = hasRole(["admin", "facturacion"]) && (order.status === "invoiced" || order.status === "delivered");
  const canDeliverCustomer = hasRole(["admin", "facturacion", "bodega", "conductor"]) && ["invoiced", "in_warehouse", "in_transit"].includes(order.status);
  const canLinkInvoice = hasRole(["admin", "facturacion"]) && !order.siigo_invoice_id && ["draft", "pending", "confirmed"].includes(order.status);
  const viewerRoles = (roles ?? []) as AppRole[];

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setBusy(false);
  };

  const sendNow = async () => {
    if (!sendOpen) return;
    if (!sendUser) return toast.error("Selecciona el usuario destino");
    setBusy(true);
    try {
      const photo_url = sendPhotoUrls[0];
      const geo = await getGeo();
      await doSend({ data: { order_id: id, to_role: sendOpen, to_user: sendUser, notes: sendNotes || undefined, photo_url, lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy } });
      if (sendOpen) clearEvidence(`evidence:handoff:${id}:${sendOpen}`);
      toast.success(`Enviado a ${sendOpen}`); load(); setSendOpen(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setBusy(false);
  };

  const deliverNow = async () => {
    if (delivPhotoUrls.length === 0) return toast.error("Foto de evidencia requerida");
    setBusy(true);
    try {
      const geo = await getGeo();
      if (!geo.lat || !geo.lng) throw new Error("Activa la geolocalización");
      await doDeliver({ data: { order_id: id, lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy, notes: delivNotes || undefined, photo_url: delivPhotoUrls[0] } });
      clearEvidence(`evidence:deliver:${id}`);
      toast.success("Entregado al cliente"); load();
      setDelivOpen(false); setDelivNotes(""); setDelivPhotoUrls([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setBusy(false);
  };

  const submitRequest = async () => {
    if (reqReason.trim().length < 3) return toast.error("Escribe el motivo");
    await run(() => doRequest({ data: { order_id: id, type: reqType, reason: reqReason.trim() } }), "Solicitud enviada");
    setReqOpen(false); setReqReason("");
  };

  const submitLinkInvoice = async () => {
    if (linkInvoiceId.trim().length < 3) return toast.error("Ingresa el ID o número de factura Siigo");
    await run(() => doLinkInvoice({ data: { order_id: id, invoice_ref: linkInvoiceId.trim() } }), "Factura vinculada");
    setLinkOpen(false); setLinkInvoiceId("");
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
          else router.navigate({ to: "/vendedor/pedidos" });
        }}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold flex-1">Pedido</h1>
        <Badge>{STATUS_LABEL[order.status] ?? order.status}</Badge>
      </div>

      {order.has_manual_price && (
        <Card className="p-3 border-amber-500/50 bg-amber-500/5 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div className="flex-1 text-sm">
            <div className="font-medium">Pedido con ajuste manual de precio</div>
            <div className="text-xs text-muted-foreground">
              {order.manual_price_acknowledged ? "Confirmado por administración." : "Requiere confirmación de admin/facturación antes de facturar."}
            </div>
          </div>
          {canAck && (
            <Button size="sm" onClick={() => run(() => doAck({ data: { id } }), "Ajuste confirmado")} disabled={busy}>
              <CheckCircle2 className="w-4 h-4 mr-1" />Confirmar
            </Button>
          )}
        </Card>
      )}

      <Card className="p-4 space-y-1">
        <div className="text-xs text-muted-foreground">Cliente</div>
        <div className="font-medium">{order.customer?.display_name ?? "—"}</div>
        <div className="text-xs text-muted-foreground">
          {order.customer?.identification} · {order.customer?.email ?? "sin email"} · {order.customer?.phone ?? "sin tel"}
        </div>
        <div className="text-xs text-muted-foreground">{order.customer?.address} {order.customer?.city_name ? `· ${order.customer.city_name}` : ""}</div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4 space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">Vendedor</div>
          <div className="font-medium">{order.seller?.full_name || order.seller?.email || "—"}</div>
          <div className="text-xs text-muted-foreground mt-2">Creado</div>
          <div>{new Date(order.created_at).toLocaleString("es-CO")}</div>
        </Card>
        <Card className="p-4 space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">Pago</div>
          <div className="font-medium">{order.payment_method?.name ?? "—"}{order.payment_method?.is_credit ? " (crédito)" : ""}</div>
          {order.credit_days != null && <div className="text-xs">Días de crédito: <span className="font-medium">{order.credit_days}</span></div>}
          {order.delivery_date && <div className="text-xs">Entrega: <span className="font-medium">{order.delivery_date}</span></div>}
          {order.due_date && <div className="text-xs">Vencimiento: <span className="font-medium">{order.due_date}</span></div>}
        </Card>
      </div>

      {(order.siigo_invoice_number || order.invoice_pdf_url) && (
        <Card className="p-4 space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">Factura Siigo</div>
          <div className="font-medium">{order.siigo_invoice_number ?? order.siigo_invoice_id}</div>
          {order.invoiced_at && <div className="text-xs text-muted-foreground">Facturado: {new Date(order.invoiced_at).toLocaleString("es-CO")}</div>}
          {order.dispatched_at && <div className="text-xs text-muted-foreground">Despachado: {new Date(order.dispatched_at).toLocaleString("es-CO")}</div>}
          {order.invoice_pdf_url && (
            <a href={order.invoice_pdf_url} target="_blank" rel="noreferrer" className="inline-block mt-2">
              <Button size="sm" variant="outline"><ExternalLink className="w-4 h-4 mr-1" />Ver PDF</Button>
            </a>
          )}
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <div className="font-medium">Líneas ({order.items.length})</div>
        <div className="space-y-2">
          {order.items.map((it) => (
            <div key={it.id} className="border-b last:border-0 pb-2 last:pb-0">
              <div className="flex justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {it.quantity} × {it.product?.name ?? "Producto"}
                    {it.is_gift && <Badge variant="outline" className="ml-1 text-[10px]">Obsequio</Badge>}
                    {it.manual_total != null && <Badge variant="outline" className="ml-1 text-[10px]">Ajustado</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.product?.code} · Unit {fmt(it.unit_price)} · Desc {it.discount}% · IVA {it.tax_rate}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{fmt(it.line_total)}</div>
                  <div className="text-xs text-muted-foreground">{fmt(it.line_subtotal)} + IVA {fmt(it.line_tax)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t pt-2 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{fmt(order.subtotal)}</span></div>
          <div className="flex justify-between"><span>IVA</span><span>{fmt(order.tax_total)}</span></div>
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{fmt(order.total)}</span></div>
        </div>
      </Card>

      {order.notes && (
        <Card className="p-4 space-y-1 text-sm">
          <div className="text-xs text-muted-foreground">Notas</div>
          <div className="whitespace-pre-wrap">{order.notes}</div>
        </Card>
      )}

      <OrderFlowSection
        orderId={order.id}
        status={order.status}
        pendingHolderUser={order.pending_holder_user ?? null}
        sellerId={order.seller_id}
        confirmedAt={order.confirmed_at ?? null}
        onChange={load}
      />

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Link to="/vendedor/nuevo" search={{ orderId: order.id }}>
            <Button variant="outline" size="sm"><Pencil className="w-4 h-4 mr-1" />Editar</Button>
          </Link>
        )}
        {canInvoice && (
          <Button size="sm" onClick={() => run(() => doInvoice({ data: { id } }), "Facturado")} disabled={busy || (order.has_manual_price && !order.manual_price_acknowledged)}>
            <FileText className="w-4 h-4 mr-1" />Facturar
          </Button>
        )}
        {canLinkInvoice && (
          <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)} disabled={busy}>
            <ExternalLink className="w-4 h-4 mr-1" />Vincular factura existente
          </Button>
        )}
        {canDispatch && (
          <Button size="sm" onClick={() => run(() => doDispatch({ data: { id } }), "Enviado a reparto")} disabled={busy}>
            <Truck className="w-4 h-4 mr-1" />Enviar a reparto
          </Button>
        )}
        {canSendBodega && (
          <Button size="sm" variant="outline" onClick={() => setSendOpen("bodega")} disabled={busy}><Send className="w-4 h-4 mr-1" />Enviar a bodega</Button>
        )}
        {canSendConductor && (
          <Button size="sm" variant="outline" onClick={() => setSendOpen("conductor")} disabled={busy}><Send className="w-4 h-4 mr-1" />Asignar a conductor</Button>
        )}
        {canSendCartera && (
          <Button size="sm" variant="outline" onClick={() => setSendOpen("cartera")} disabled={busy}><Send className="w-4 h-4 mr-1" />Pasar a cartera</Button>
        )}
        {canDeliverCustomer && (
          <Button size="sm" onClick={() => setDelivOpen(true)} disabled={busy}><MapPin className="w-4 h-4 mr-1" />Entregar a cliente</Button>
        )}
        {canRequest && (
          <Button size="sm" variant="outline" onClick={() => setReqOpen(true)} disabled={busy}><RotateCcw className="w-4 h-4 mr-1" />Solicitar anulación / devolución</Button>
        )}
        {canCancel && (
          <Button size="sm" variant="outline" onClick={() => run(() => doCancel({ data: { id } }), "Pedido cancelado")} disabled={busy}>
            <Ban className="w-4 h-4 mr-1" />Cancelar
          </Button>
        )}
      </div>

      {handoffs.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="font-medium">Trazabilidad</div>
          <ol className="space-y-2">
            {handoffs.map((h) => {
              const showMedia = canSeeHandoffEvidence(h.to_role, h.from_role, viewerRoles);
              return (
              <li key={h.id} className="text-sm border-l-2 pl-3">
                <div className="flex items-center gap-2">
                  <Badge variant={h.status === "completed" || h.status === "accepted" ? "secondary" : h.status === "rejected" ? "outline" : "default"}>{h.status}</Badge>
                  <span className="font-medium">{h.from_role ?? "—"} → {h.to_role}</span>
                  <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("es-CO")}</span>
                </div>
                {h.notes && <div className="text-xs italic">{h.notes}</div>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {showMedia && h.lat && h.lng && <a href={`https://maps.google.com/?q=${h.lat},${h.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline"><MapPin className="w-3 h-3" />ver mapa</a>}
                  {showMedia && h.photo_url && <a href={h.photo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline"><ImageIcon className="w-3 h-3" />evidencia</a>}
                  {!showMedia && (h.photo_url || (h.lat && h.lng)) && <span className="italic">Evidencia restringida</span>}
                </div>
              </li>
              );
            })}
          </ol>
        </Card>
      )}

      <Dialog open={!!sendOpen} onOpenChange={(o) => !o && setSendOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar a {sendOpen}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs font-medium">Usuario destino</div>
              <Select value={sendUser} onValueChange={setSendUser}>
                <SelectTrigger><SelectValue placeholder={sendUsers.length ? "Selecciona usuario" : "Sin usuarios con este rol"} /></SelectTrigger>
                <SelectContent>
                  {sendUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || u.id.slice(0,8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <EvidenceCapture
              folder={`handoffs/${id}`}
              persistKey={`evidence:handoff:${id}:${sendOpen ?? "x"}`}
              label="Evidencia (opcional)"
              onChange={setSendPhotoUrls}
            />
            <Textarea placeholder="Notas (opcional)" value={sendNotes} onChange={(e) => setSendNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(null)}>Cancelar</Button>
            <Button onClick={sendNow} disabled={busy || !sendUser}>Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={delivOpen} onOpenChange={setDelivOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Entregar al cliente</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Se capturará tu ubicación actual y la foto de evidencia.</p>
          <EvidenceCapture
            folder={`orders/${id}`}
            persistKey={`evidence:deliver:${id}`}
            label="Foto entrega"
            required
            onChange={setDelivPhotoUrls}
          />
          <Textarea placeholder="Notas (opcional)" value={delivNotes} onChange={(e) => setDelivNotes(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelivOpen(false)}>Cancelar</Button>
            <Button onClick={deliverNow} disabled={busy || delivPhotoUrls.length === 0}>Confirmar entrega</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reqOpen} onOpenChange={setReqOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitud sobre el pedido</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <Button size="sm" variant={reqType === "cancel" ? "default" : "outline"} onClick={() => setReqType("cancel")}>Anulación</Button>
            <Button size="sm" variant={reqType === "return" ? "default" : "outline"} onClick={() => setReqType("return")}>Devolución</Button>
          </div>
          <Textarea placeholder="Motivo (obligatorio)" value={reqReason} onChange={(e) => setReqReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqOpen(false)}>Cancelar</Button>
            <Button onClick={submitRequest} disabled={busy}>Enviar solicitud</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
