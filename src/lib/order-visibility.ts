// Reglas de visibilidad de evidencia/geo en la trazabilidad del pedido.
// Quien NO participó en una entrega del conductor no debe ver foto ni ubicación.
import type { AppRole, OrderEventType } from "@/lib/order-flow";

const PRIVILEGED: AppRole[] = ["admin", "facturacion", "cartera"];

/** Eventos relacionados a la entrega del conductor cuya evidencia es sensible. */
const DRIVER_EVENTS: OrderEventType[] = [
  "driver_delivers_customer",
  "driver_receives",
  "warehouse_to_driver",
  "driver_returns_billing",
];

export function canSeeEvidence(
  eventType: string,
  actorId: string | null,
  receiverId: string | null,
  viewerRoles: AppRole[],
  viewerId: string | null,
): boolean {
  if (viewerRoles.some((r) => PRIVILEGED.includes(r))) return true;
  if (viewerRoles.includes("conductor")) return true;
  if (!DRIVER_EVENTS.includes(eventType as OrderEventType)) return true;
  // vendedor / bodega: sólo si participó
  return viewerId != null && (viewerId === actorId || viewerId === receiverId);
}

/** Igual pero para los registros de handoff (que tienen from_role / to_role). */
export function canSeeHandoffEvidence(
  toRole: string | null,
  fromRole: string | null,
  viewerRoles: AppRole[],
): boolean {
  if (viewerRoles.some((r) => PRIVILEGED.includes(r))) return true;
  if (viewerRoles.includes("conductor")) return true;
  // Si involucra al conductor, vendedor/bodega no participantes no ven media
  const involvesDriver = toRole === "conductor" || fromRole === "conductor";
  if (!involvesDriver) return true;
  // bodega ve cuando el handoff es "bodega → conductor" (ella participa)
  if (viewerRoles.includes("bodega") && (toRole === "bodega" || fromRole === "bodega")) return true;
  return false;
}