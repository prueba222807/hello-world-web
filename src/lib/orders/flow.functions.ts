// Server functions del flujo de trazabilidad de pedidos (estilo Invoice Flow Tracker).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";
import { NEXT_ACTIONS, type AppRole, type NextAction, type OrderEventType, type OrderFlowStatus } from "@/lib/order-flow";

type Role = AppRole;
const STAFF: Role[] = ["admin", "facturacion", "cartera", "bodega", "conductor"];

async function rolesOf(userId: string): Promise<Role[]> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as Array<{ role: Role }>).map((r) => r.role);
}
const hasAny = (rs: Role[], req: Role | Role[]) => (Array.isArray(req) ? req.some((r) => rs.includes(r)) : rs.includes(req));

function pickActorRole(rs: Role[], requiredRole: Role): Role {
  if (rs.includes(requiredRole)) return requiredRole;
  if (rs.includes("admin")) return "admin";
  return rs[0];
}

async function notify(user_id: string, type: string, title: string, body: string | null, order_id: string | null) {
  await supabaseAdmin.from("notifications").insert({ user_id, type, title, body, order_id });
}

async function loadFlowSettings() {
  const { data } = await supabaseAdmin.from("flow_settings").select("*").limit(1).maybeSingle();
  return {
    confirmation_mode: (data?.confirmation_mode ?? "acceptance") as "signature" | "acceptance",
    client_delivery_requires_photo: data?.client_delivery_requires_photo ?? true,
    client_delivery_requires_geo: data?.client_delivery_requires_geo ?? true,
  };
}

// ============ Settings ============

export const getFlowSettings = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async () => loadFlowSettings());

export const updateFlowSettings = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    confirmation_mode: z.enum(["signature", "acceptance"]),
    client_delivery_requires_photo: z.boolean(),
    client_delivery_requires_geo: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    if (!rs.includes("admin")) throw new Response("Forbidden", { status: 403 });
    const { error } = await supabaseAdmin.from("flow_settings").update({
      confirmation_mode: data.confirmation_mode,
      client_delivery_requires_photo: data.client_delivery_requires_photo,
      client_delivery_requires_geo: data.client_delivery_requires_geo,
      updated_at: new Date().toISOString(),
    }).eq("singleton", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Timeline + inbox ============

export const listTimeline = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const [{ data: events }, { data: evidences }] = await Promise.all([
      supabaseAdmin.from("order_events").select("*").eq("order_id", data.order_id).order("event_at", { ascending: true }),
      supabaseAdmin.from("order_evidences").select("*").eq("order_id", data.order_id),
    ]);
    const userIds = new Set<string>();
    (events ?? []).forEach((e) => { userIds.add(e.actor_id); if (e.receiver_id) userIds.add(e.receiver_id); });
    let profiles: Record<string, { id: string; full_name: string | null; email: string | null }> = {};
    if (userIds.size > 0) {
      const { data: ps } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", Array.from(userIds));
      profiles = Object.fromEntries((ps ?? []).map((p) => [p.id, p]));
    }
    return { events: events ?? [], evidences: evidences ?? [], profiles };
  });

export const myFlowInbox = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rs = await rolesOf(context.userId);
    // Pedidos donde soy el receptor pendiente
    const { data: pendingMine } = await supabaseAdmin.from("orders")
      .select("id, order_number, status, total, pending_status, pending_holder_role, customer:customers(display_name, address, phone), siigo_invoice_number")
      .eq("status", "pending_acceptance")
      .eq("pending_holder_user", context.userId)
      .order("updated_at", { ascending: false });
    // Pedidos asignados a mí por rol activo
    const statusByRole: Record<string, string[]> = {
      facturacion: ["confirmed", "invoiced", "returned_to_billing"],
      bodega: ["in_warehouse"],
      conductor: ["in_transit"],
      cartera: ["with_collections"],
    };
    const activeStatuses: string[] = [];
    for (const r of rs) if (statusByRole[r]) activeStatuses.push(...statusByRole[r]);
    type ActiveOrder = {
      id: string; order_number: string | null; status: string; total: number;
      siigo_invoice_number: string | null;
      customer: { display_name: string; address: string | null; phone: string | null } | null;
      updated_at: string;
    };
    let active: ActiveOrder[] = [];
    if (activeStatuses.length > 0) {
      const { data } = await supabaseAdmin.from("orders")
        .select("id, order_number, status, total, siigo_invoice_number, customer:customers(display_name, address, phone), updated_at")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .in("status", activeStatuses as any).order("updated_at", { ascending: false }).limit(200);
      active = (data ?? []) as unknown as ActiveOrder[];
    }
    return { pending: pendingMine ?? [], active };
  });

// ============ Confirmar pedido (entra al flujo) ============

export const confirmOrderFlow = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    order_id: z.string().uuid(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    accuracy: z.number().nullable().optional(),
    observations: z.string().max(2000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    const { data: order } = await supabaseAdmin.from("orders").select("id, seller_id, status, confirmed_at").eq("id", data.order_id).maybeSingle();
    if (!order) throw new Error("Pedido no encontrado");
    if (order.seller_id !== context.userId && !rs.includes("admin")) throw new Response("Forbidden", { status: 403 });
    if (order.confirmed_at) return { ok: true, alreadyConfirmed: true };

    const fromStatus = order.status as string;
    const toStatus = "confirmed" as const;

    // Crear evento de confirmación
    const actorRole: Role = order.seller_id === context.userId ? "vendedor" : (rs.includes("admin") ? "admin" : (rs[0] ?? "vendedor"));
    await supabaseAdmin.from("order_events").insert({
      order_id: data.order_id, event_type: "confirmation",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from_status: fromStatus as any, to_status: toStatus,
      actor_id: context.userId, actor_role: actorRole,
      observations: data.observations ?? null,
      lat: data.lat ?? null, lng: data.lng ?? null, accuracy: data.accuracy ?? null,
    });
    await supabaseAdmin.from("orders").update({
      status: toStatus, confirmed_at: new Date().toISOString(),
    }).eq("id", data.order_id);

    // Notificar a facturación
    const { data: billing } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "facturacion");
    for (const b of (billing ?? [])) {
      await notify(b.user_id, "order_confirmed", "Nuevo pedido confirmado", "Listo para facturar", data.order_id);
    }
    return { ok: true };
  });

// ============ Ejecutar acción del flujo ============

const ExecuteSchema = z.object({
  order_id: z.string().uuid(),
  action_key: z.string().min(1),
  receiver_id: z.string().uuid().nullable().optional(),
  signature_url: z.string().url().nullable().optional(),
  photo_urls: z.array(z.string().url()).optional(),
  observations: z.string().max(2000).optional(),
  visible_date: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
});

export const executeAction = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => ExecuteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    if (!hasAny(rs, STAFF)) throw new Response("Forbidden", { status: 403 });

    const action = NEXT_ACTIONS.find((a) => a.key === data.action_key) as NextAction | undefined;
    if (!action) throw new Error("Acción inválida");
    if (!rs.includes(action.requiredRole) && !rs.includes("admin")) throw new Response("Forbidden: rol incorrecto", { status: 403 });

    const { data: order } = await supabaseAdmin.from("orders").select("id, status").eq("id", data.order_id).maybeSingle();
    if (!order) throw new Error("Pedido no encontrado");
    if (order.status !== action.fromStatus) throw new Error(`El pedido no está en estado ${action.fromStatus}`);

    if (action.needsReceiver && !data.receiver_id) throw new Error("Selecciona el usuario receptor");
    if (action.requiresPhoto && !(data.photo_urls && data.photo_urls.length > 0)) throw new Error("Foto obligatoria para esta acción");
    if (action.requiresGeo && (!data.lat || !data.lng)) throw new Error("Geolocalización requerida");

    const settings = await loadFlowSettings();
    const actorRole = pickActorRole(rs, action.requiredRole);
    const acceptanceMode = settings.confirmation_mode === "acceptance" && action.needsReceiver;

    // Evento principal: en modo aceptación, es transfer_pending; sino, el evento real
    const eventType: OrderEventType = acceptanceMode ? "transfer_pending" : action.eventType;
    const toStatus = acceptanceMode ? "pending_acceptance" : action.toStatus;

    const { data: ev, error: evErr } = await supabaseAdmin.from("order_events").insert({
      order_id: data.order_id, event_type: eventType,
      from_status: action.fromStatus, to_status: toStatus,
      actor_id: context.userId, actor_role: actorRole,
      receiver_id: data.receiver_id ?? null,
      receiver_role: action.receiverRole ?? null,
      signature_url: data.signature_url ?? null,
      observations: data.observations ?? null,
      visible_date: data.visible_date ?? null,
      lat: data.lat ?? null, lng: data.lng ?? null, accuracy: data.accuracy ?? null,
    }).select("id").single();
    if (evErr || !ev) throw new Error(evErr?.message ?? "No se pudo registrar el evento");

    // Evidencias
    if (data.photo_urls && data.photo_urls.length > 0) {
      const rows = data.photo_urls.map((url, i) => ({
        event_id: ev.id, order_id: data.order_id,
        file_url: url, file_name: `evidence-${i + 1}.jpg`, file_type: "image/jpeg",
        uploaded_by: context.userId,
        lat: data.lat ?? null, lng: data.lng ?? null, accuracy: data.accuracy ?? null,
        location_captured_at: data.lat ? new Date().toISOString() : null,
      }));
      await supabaseAdmin.from("order_evidences").insert(rows);
    }

    // Actualizar pedido
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      status: toStatus,
      current_holder_user: acceptanceMode ? null : (data.receiver_id ?? null),
      current_holder_role: acceptanceMode ? null : (action.receiverRole ?? null),
    };
    if (acceptanceMode) {
      updates.pending_status = action.toStatus;
      updates.pending_holder_user = data.receiver_id;
      updates.pending_holder_role = action.receiverRole ?? null;
    } else {
      updates.pending_status = null;
      updates.pending_holder_user = null;
      updates.pending_holder_role = null;
      if (action.toStatus === "finalized") updates.finalized_at = new Date().toISOString();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabaseAdmin.from("orders").update(updates as any).eq("id", data.order_id);

    // Notificar al receptor
    if (data.receiver_id) {
      await notify(
        data.receiver_id,
        acceptanceMode ? "transfer_pending" : "order_assigned",
        acceptanceMode ? "Nueva transferencia pendiente" : "Pedido asignado",
        action.label, data.order_id,
      );
    }
    return { ok: true, event_id: ev.id, pending: acceptanceMode };
  });

// ============ Responder a una transferencia pendiente ============

export const respondTransfer = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    order_id: z.string().uuid(),
    decision: z.enum(["accept", "reject"]),
    reason: z.string().max(500).optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    accuracy: z.number().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    const { data: order } = await supabaseAdmin.from("orders")
      .select("id, status, pending_status, pending_holder_user, pending_holder_role").eq("id", data.order_id).maybeSingle();
    if (!order) throw new Error("Pedido no encontrado");
    if (order.status !== "pending_acceptance") throw new Error("Este pedido no está pendiente de aceptación");
    if (order.pending_holder_user !== context.userId && !rs.includes("admin")) throw new Response("Forbidden", { status: 403 });

    // Buscar último transfer_pending
    const { data: lastEv } = await supabaseAdmin.from("order_events")
      .select("*").eq("order_id", data.order_id).eq("event_type", "transfer_pending")
      .order("event_at", { ascending: false }).limit(1).maybeSingle();

    if (data.decision === "accept") {
      const newStatus = (order.pending_status as OrderFlowStatus) ?? "in_warehouse";
      const evType = lastEv ? (
        // mapear de transfer a evento concreto según receiver_role
        lastEv.receiver_role === "bodega" ? "warehouse_receives"
        : lastEv.receiver_role === "conductor" ? "driver_receives"
        : lastEv.receiver_role === "facturacion" ? "billing_receives_return"
        : lastEv.receiver_role === "cartera" ? "collections_receives"
        : "transfer_accepted"
      ) : "transfer_accepted";

      await supabaseAdmin.from("order_events").insert({
        order_id: data.order_id, event_type: evType as OrderEventType,
        from_status: "pending_acceptance", to_status: newStatus,
        actor_id: context.userId, actor_role: (order.pending_holder_role ?? "admin") as Role,
        observations: data.reason ?? null,
        lat: data.lat ?? null, lng: data.lng ?? null, accuracy: data.accuracy ?? null,
      });
      await supabaseAdmin.from("orders").update({
        status: newStatus,
        current_holder_user: context.userId,
        current_holder_role: order.pending_holder_role,
        pending_status: null, pending_holder_user: null, pending_holder_role: null,
        ...(newStatus === "finalized" ? { finalized_at: new Date().toISOString() } : {}),
      }).eq("id", data.order_id);

      if (lastEv?.actor_id) {
        await notify(lastEv.actor_id, "transfer_accepted", "Transferencia aceptada", "El receptor aceptó.", data.order_id);
      }
    } else {
      const revertTo = (lastEv?.from_status as OrderFlowStatus) ?? "invoiced";
      await supabaseAdmin.from("order_events").insert({
        order_id: data.order_id, event_type: "transfer_rejected" as OrderEventType,
        from_status: "pending_acceptance", to_status: revertTo,
        actor_id: context.userId, actor_role: (order.pending_holder_role ?? "admin") as Role,
        observations: data.reason ?? null,
        lat: data.lat ?? null, lng: data.lng ?? null, accuracy: data.accuracy ?? null,
      });
      await supabaseAdmin.from("orders").update({
        status: revertTo,
        current_holder_user: lastEv?.actor_id ?? null,
        current_holder_role: lastEv?.actor_role ?? null,
        pending_status: null, pending_holder_user: null, pending_holder_role: null,
      }).eq("id", data.order_id);
      if (lastEv?.actor_id) {
        await notify(lastEv.actor_id, "transfer_rejected", "Transferencia rechazada", data.reason ?? "El receptor rechazó la transferencia.", data.order_id);
      }
    }
    return { ok: true };
  });

// ============ Subir firma como dataURL ============

export const uploadSignature = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    data_url: z.string().min(20),
    folder: z.string().max(64).default("signatures"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const m = data.data_url.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!m) throw new Error("Firma inválida");
    const mime = m[1];
    const buf = Buffer.from(m[2], "base64");
    const ext = mime.includes("png") ? "png" : "jpg";
    const path = `${data.folder}/${context.userId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error } = await supabaseAdmin.storage.from("evidence").upload(path, buf, { contentType: mime, upsert: false });
    if (error) throw new Error(error.message);
    const { data: pub } = supabaseAdmin.storage.from("evidence").getPublicUrl(path);
    return { url: pub.publicUrl };
  });

// ============ Admin: borrar evento ============
export const deleteOrderEvent = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ event_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    if (!rs.includes("admin")) throw new Response("Forbidden", { status: 403 });
    const { error } = await supabaseAdmin.from("order_events").delete().eq("id", data.event_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Notificaciones ============
export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin.from("notifications")
      .select("id, type, title, body, order_id, read_at, created_at")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(40);
    return { notifications: data ?? [] };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ids: z.array(z.string().uuid()).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    let q = supabaseAdmin.from("notifications").update({ read_at: now }).eq("user_id", context.userId).is("read_at", null);
    if (data.ids && data.ids.length > 0) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });