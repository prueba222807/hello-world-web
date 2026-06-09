// Server functions para handoffs logísticos entre roles.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";

type OrderStatus =
  | "draft" | "pending" | "confirmed" | "invoiced" | "dispatched" | "cancelled"
  | "ready_for_warehouse" | "in_warehouse" | "ready_for_driver" | "in_transit"
  | "delivered" | "returning_to_billing" | "with_collections" | "closed" | "voided";

type AppRole = "admin" | "vendedor" | "facturacion" | "cartera" | "bodega" | "conductor";
const STAFF: AppRole[] = ["admin", "facturacion", "cartera", "bodega", "conductor"];

async function rolesOf(userId: string): Promise<AppRole[]> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as Array<{ role: AppRole }>).map((r) => r.role);
}
const has = (rs: AppRole[], r: AppRole | AppRole[]) => (Array.isArray(r) ? r.some((x) => rs.includes(x)) : rs.includes(r));

const Geo = z.object({
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  notes: z.string().max(2000).optional(),
  photo_url: z.string().url().nullable().optional(),
  signature_url: z.string().url().nullable().optional(),
});

// SEND: facturación → bodega/conductor, bodega → conductor, conductor → facturación, facturación → cartera
export const sendHandoff = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => Geo.extend({
    order_id: z.string().uuid(),
    to_role: z.enum(["bodega", "conductor", "facturacion", "cartera"]),
    to_user: z.string().uuid().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    if (!has(rs, STAFF)) throw new Response("Forbidden", { status: 403 });

    const { data: order } = await supabaseAdmin.from("orders").select("id, status").eq("id", data.order_id).maybeSingle();
    if (!order) throw new Error("Pedido no encontrado");

    // Reglas de transición permitidas por rol
    const fromRole: AppRole | null = has(rs, "facturacion") ? "facturacion"
      : has(rs, "bodega") ? "bodega"
      : has(rs, "conductor") ? "conductor"
      : has(rs, "cartera") ? "cartera"
      : has(rs, "admin") ? "admin"
      : null;

    let nextStatus: OrderStatus | null = null;
    if (data.to_role === "bodega") nextStatus = "ready_for_warehouse";
    else if (data.to_role === "conductor") nextStatus = "ready_for_driver";
    else if (data.to_role === "facturacion") nextStatus = "returning_to_billing";
    else if (data.to_role === "cartera") nextStatus = "with_collections";

    const { error: hErr } = await supabaseAdmin.from("order_handoffs").insert({
      order_id: data.order_id,
      from_user: context.userId,
      from_role: fromRole,
      to_user: data.to_user ?? null,
      to_role: data.to_role,
      action: "send",
      status: "pending",
      notes: data.notes ?? null,
      lat: data.lat ?? null, lng: data.lng ?? null, accuracy: data.accuracy ?? null,
      photo_url: data.photo_url ?? null, signature_url: data.signature_url ?? null,
    });
    if (hErr) throw new Error(hErr.message);

    if (nextStatus) {
      const { error } = await supabaseAdmin.from("orders").update({
        status: nextStatus, current_holder_user: data.to_user ?? null, current_holder_role: data.to_role,
      }).eq("id", data.order_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ACCEPT/REJECT pending handoff
export const respondHandoff = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => Geo.extend({
    handoff_id: z.string().uuid(),
    decision: z.enum(["accept", "reject"]),
    reject_reason: z.string().max(500).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    if (!has(rs, STAFF)) throw new Response("Forbidden", { status: 403 });

    const { data: ho } = await supabaseAdmin.from("order_handoffs").select("*").eq("id", data.handoff_id).maybeSingle();
    if (!ho) throw new Error("Handoff no encontrado");
    if (ho.status !== "pending") throw new Error("Este handoff ya fue procesado");

    // Verificar el rol destino
    if (!has(rs, ho.to_role as AppRole) && !has(rs, "admin")) {
      throw new Response("No autorizado para responder este handoff", { status: 403 });
    }

    const newStatus = data.decision === "accept" ? "accepted" : "rejected";
    const { error: uErr } = await supabaseAdmin.from("order_handoffs").update({
      status: newStatus,
      to_user: ho.to_user ?? context.userId,
      reject_reason: data.decision === "reject" ? (data.reject_reason ?? null) : null,
      notes: data.notes ?? ho.notes,
      lat: data.lat ?? ho.lat, lng: data.lng ?? ho.lng, accuracy: data.accuracy ?? ho.accuracy,
      photo_url: data.photo_url ?? ho.photo_url, signature_url: data.signature_url ?? ho.signature_url,
      responded_at: new Date().toISOString(),
    }).eq("id", ho.id);
    if (uErr) throw new Error(uErr.message);

    if (data.decision === "accept") {
      let nextOrderStatus: OrderStatus | null = null;
      if (ho.to_role === "bodega") nextOrderStatus = "in_warehouse";
      else if (ho.to_role === "conductor") nextOrderStatus = "in_transit";
      else if (ho.to_role === "facturacion") nextOrderStatus = "invoiced"; // FV regresada
      else if (ho.to_role === "cartera") nextOrderStatus = "closed";

      if (nextOrderStatus) {
        await supabaseAdmin.from("orders").update({
          status: nextOrderStatus,
          current_holder_user: context.userId,
          current_holder_role: ho.to_role,
        }).eq("id", ho.order_id);
      }
    } else {
      // Rechazo: pedido vuelve al rol que envió. Si rechaza bodega, vuelve a facturación
      const revertHolder = ho.from_user;
      const revertRole = ho.from_role;
      let revertStatus: OrderStatus | null = null;
      if (ho.from_role === "facturacion") revertStatus = "invoiced";
      else if (ho.from_role === "bodega") revertStatus = "in_warehouse";
      else if (ho.from_role === "conductor") revertStatus = "in_transit";
      if (revertStatus) {
        await supabaseAdmin.from("orders").update({
          status: revertStatus, current_holder_user: revertHolder, current_holder_role: revertRole,
        }).eq("id", ho.order_id);
      }
    }

    return { ok: true };
  });

// DELIVER directly to client (puede ser desde facturación, bodega o conductor)
export const deliverToCustomer = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => Geo.extend({
    order_id: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    if (!has(rs, ["admin", "facturacion", "bodega", "conductor"])) throw new Response("Forbidden", { status: 403 });
    if (!data.lat || !data.lng) throw new Error("Geolocalización requerida para entrega a cliente");
    if (!data.photo_url) throw new Error("Evidencia (foto) requerida para entrega a cliente");

    const fromRole: AppRole = has(rs, "conductor") ? "conductor"
      : has(rs, "bodega") ? "bodega"
      : has(rs, "facturacion") ? "facturacion"
      : "admin";

    await supabaseAdmin.from("order_handoffs").insert({
      order_id: data.order_id,
      from_user: context.userId, from_role: fromRole,
      to_user: null, to_role: "vendedor", // marker: cliente final
      action: "deliver_customer", status: "completed",
      notes: data.notes ?? null,
      lat: data.lat, lng: data.lng, accuracy: data.accuracy ?? null,
      photo_url: data.photo_url, signature_url: data.signature_url ?? null,
      responded_at: new Date().toISOString(),
    });
    const { error } = await supabaseAdmin.from("orders").update({
      status: "delivered", current_holder_user: null, current_holder_role: null,
    }).eq("id", data.order_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listHandoffs = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin.from("order_handoffs")
      .select("*").eq("order_id", data.order_id).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { handoffs: rows ?? [] };
  });

// Cola de pendientes para mi rol
export const myQueue = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    role: z.enum(["bodega", "conductor", "facturacion", "cartera"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    if (!has(rs, [data.role, "admin"])) throw new Response("Forbidden", { status: 403 });

    // Pendientes: handoffs entrantes
    const { data: pending } = await supabaseAdmin.from("order_handoffs")
      .select("id, order_id, from_user, from_role, notes, created_at, photo_url, lat, lng, order:orders(id, order_number, status, total, customer:customers(display_name, address, phone))")
      .eq("to_role", data.role).eq("status", "pending")
      .order("created_at", { ascending: true });

    // En curso: pedidos cuyo holder actual es este rol y status correspondiente
    const statusMap: Record<string, OrderStatus[]> = {
      bodega: ["in_warehouse"],
      conductor: ["in_transit"],
      facturacion: ["confirmed", "invoiced", "returning_to_billing"],
      cartera: ["with_collections", "closed"],
    };
    const { data: active } = await supabaseAdmin.from("orders")
      .select("id, order_number, status, total, created_at, siigo_invoice_number, customer:customers(display_name, address, phone)")
      .in("status", statusMap[data.role])
      .order("created_at", { ascending: false }).limit(100);

    return { pending: pending ?? [], active: active ?? [] };
  });

// Lista usuarios disponibles para asignar handoffs según rol destino.
export const listUsersByRole = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    role: z.enum(["bodega", "conductor", "facturacion", "cartera", "vendedor", "admin"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    if (!has(rs, STAFF)) throw new Response("Forbidden", { status: 403 });
    const { data: roleRows, error } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", data.role);
    if (error) throw new Error(error.message);
    const ids = (roleRows ?? []).map((r) => r.user_id as string);
    if (ids.length === 0) return { users: [] as Array<{ id: string; full_name: string | null; email: string | null }> };
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, full_name, email").in("id", ids).order("full_name");
    return { users: (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }> };
  });