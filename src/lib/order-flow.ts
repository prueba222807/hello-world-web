// Constantes y reglas del flujo de trazabilidad de pedidos.
// Cliente-safe (sin imports server-only).

export type AppRole = "admin" | "vendedor" | "facturacion" | "cartera" | "bodega" | "conductor";

export type OrderFlowStatus =
  | "draft" | "pending" | "confirmed" | "invoiced" | "dispatched" | "cancelled" | "voided"
  | "ready_for_warehouse" | "in_warehouse" | "ready_for_driver" | "in_transit"
  | "delivered" | "returning_to_billing" | "with_collections" | "closed"
  | "awaiting_billing" | "awaiting_warehouse" | "awaiting_driver"
  | "awaiting_billing_return" | "returned_to_billing" | "awaiting_collections"
  | "finalized" | "rejected" | "pending_acceptance";

export type OrderEventType =
  | "confirmation"
  | "bill_to_warehouse"
  | "warehouse_receives"
  | "warehouse_to_driver"
  | "driver_receives"
  | "driver_delivers_customer"
  | "warehouse_delivers_customer"
  | "driver_returns_billing"
  | "billing_receives_return"
  | "billing_to_collections"
  | "collections_receives"
  | "transfer_pending"
  | "transfer_accepted"
  | "transfer_rejected"
  | "admin_edit";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  facturacion: "Facturación",
  bodega: "Bodega",
  conductor: "Conductor",
  cartera: "Cartera",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  pending: "Pendiente",
  confirmed: "Confirmado",
  invoiced: "Facturado",
  dispatched: "En reparto",
  cancelled: "Cancelado",
  voided: "Anulado",
  awaiting_billing: "En espera de facturación",
  ready_for_warehouse: "Hacia bodega",
  awaiting_warehouse: "Pendiente bodega",
  in_warehouse: "En bodega",
  ready_for_driver: "Hacia conductor",
  awaiting_driver: "Pendiente conductor",
  in_transit: "En ruta",
  delivered: "Entregado al cliente",
  returning_to_billing: "Regreso a facturación",
  awaiting_billing_return: "Devolución pendiente",
  returned_to_billing: "Devuelto a facturación",
  with_collections: "En cartera",
  awaiting_collections: "Pendiente cartera",
  closed: "Cerrado",
  finalized: "Finalizado",
  rejected: "Rechazado",
  pending_acceptance: "Pendiente de aceptación",
};

export const EVENT_LABELS: Record<OrderEventType, string> = {
  confirmation: "Pedido confirmado",
  bill_to_warehouse: "Facturación → Bodega",
  warehouse_receives: "Bodega recibió",
  warehouse_to_driver: "Bodega → Conductor",
  driver_receives: "Conductor recibió",
  driver_delivers_customer: "Conductor entregó al cliente",
  warehouse_delivers_customer: "Bodega entregó al cliente",
  driver_returns_billing: "Conductor devolvió a facturación",
  billing_receives_return: "Facturación recibió devolución",
  billing_to_collections: "Facturación → Cartera",
  collections_receives: "Cartera recibió",
  transfer_pending: "Transferencia enviada (pendiente)",
  transfer_accepted: "Receptor aceptó",
  transfer_rejected: "Receptor rechazó",
  admin_edit: "Edición administrativa",
};

export interface NextAction {
  key: string;
  label: string;
  shortLabel: string;
  requiredRole: AppRole;
  eventType: OrderEventType;
  fromStatus: OrderFlowStatus;
  toStatus: OrderFlowStatus;
  needsReceiver: boolean;
  receiverRole?: AppRole;
  description: string;
  requiresPhoto?: boolean;
  requiresGeo?: boolean;
}

// Flujo: confirmado(vendedor) -> facturación factura -> bodega -> conductor -> cliente
//       -> facturación recibe devolución -> cartera -> finalizado
// El paso "facturar" se hace con el botón existente (Siigo) y produce status "invoiced".
export const NEXT_ACTIONS: NextAction[] = [
  {
    key: "bill_to_warehouse",
    label: "Entregar a Bodega",
    shortLabel: "→ Bodega",
    requiredRole: "facturacion",
    eventType: "bill_to_warehouse",
    fromStatus: "invoiced",
    toStatus: "in_warehouse",
    needsReceiver: true,
    receiverRole: "bodega",
    description: "Facturación entrega la factura a bodega para preparar la mercancía.",
  },
  {
    key: "warehouse_to_driver",
    label: "Entregar a Conductor",
    shortLabel: "→ Conductor",
    requiredRole: "bodega",
    eventType: "warehouse_to_driver",
    fromStatus: "in_warehouse",
    toStatus: "in_transit",
    needsReceiver: true,
    receiverRole: "conductor",
    description: "Bodega entrega la mercancía al conductor para iniciar la ruta.",
  },
  {
    key: "warehouse_delivers_customer",
    label: "Entrega directa (cliente recoge en bodega)",
    shortLabel: "Entrega Cliente",
    requiredRole: "bodega",
    eventType: "warehouse_delivers_customer",
    fromStatus: "in_warehouse",
    toStatus: "delivered",
    needsReceiver: false,
    requiresPhoto: true,
    requiresGeo: true,
    description: "El cliente recoge directamente en bodega. Foto y geo obligatorias.",
  },
  {
    key: "driver_delivers_customer",
    label: "Entregar al Cliente",
    shortLabel: "Entregar",
    requiredRole: "conductor",
    eventType: "driver_delivers_customer",
    fromStatus: "in_transit",
    toStatus: "delivered",
    needsReceiver: false,
    requiresPhoto: true,
    requiresGeo: true,
    description: "Conductor confirma la entrega al cliente. Foto y geo obligatorias.",
  },
  {
    key: "driver_returns_billing",
    label: "Devolver factura a Facturación",
    shortLabel: "→ Facturación",
    requiredRole: "conductor",
    eventType: "driver_returns_billing",
    fromStatus: "delivered",
    toStatus: "returned_to_billing",
    needsReceiver: true,
    receiverRole: "facturacion",
    description: "Conductor devuelve la factura firmada al área de facturación.",
  },
  {
    key: "warehouse_returns_billing",
    label: "Devolver factura a Facturación",
    shortLabel: "→ Facturación",
    requiredRole: "bodega",
    eventType: "driver_returns_billing",
    fromStatus: "delivered",
    toStatus: "returned_to_billing",
    needsReceiver: true,
    receiverRole: "facturacion",
    description: "Bodega devuelve el soporte de la entrega directa a facturación.",
  },
  {
    key: "billing_to_collections",
    label: "Entregar a Cartera",
    shortLabel: "→ Cartera",
    requiredRole: "facturacion",
    eventType: "billing_to_collections",
    fromStatus: "returned_to_billing",
    toStatus: "with_collections",
    needsReceiver: true,
    receiverRole: "cartera",
    description: "Facturación entrega la factura a cartera para gestión de cobro.",
  },
  {
    key: "collections_receives",
    label: "Marcar como finalizada en cartera",
    shortLabel: "Finalizar",
    requiredRole: "cartera",
    eventType: "collections_receives",
    fromStatus: "with_collections",
    toStatus: "finalized",
    needsReceiver: false,
    description: "Cartera cierra la trazabilidad de la factura.",
  },
];

export function getAvailableActions(status: string, roles: AppRole[]): NextAction[] {
  const isAdmin = roles.includes("admin");
  return NEXT_ACTIONS.filter(
    (a) => a.fromStatus === status && (roles.includes(a.requiredRole) || isAdmin),
  );
}

export function formatDateTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n));
}

export function durationBetween(from: string | Date, to: string | Date): string {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function durationMinutes(from: string | Date, to: string | Date): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}