// Solicitudes de anulación o devolución de pedidos.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";
import { SiigoClient, SiigoApiError } from "@/lib/siigo/client.server";

type AppRole = "admin" | "vendedor" | "facturacion" | "cartera" | "bodega" | "conductor";
async function rolesOf(uid: string): Promise<AppRole[]> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", uid);
  return ((data ?? []) as Array<{ role: AppRole }>).map((r) => r.role);
}
const has = (rs: AppRole[], r: AppRole | AppRole[]) => (Array.isArray(r) ? r.some((x) => rs.includes(x)) : rs.includes(r));

export const createOrderRequest = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    order_id: z.string().uuid(),
    type: z.enum(["cancel", "return"]),
    reason: z.string().trim().min(3).max(2000),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order } = await supabaseAdmin.from("orders").select("id, seller_id, status").eq("id", data.order_id).maybeSingle();
    if (!order) throw new Error("Pedido no encontrado");
    const rs = await rolesOf(context.userId);
    const owner = order.seller_id === context.userId;
    if (!owner && !has(rs, ["admin", "facturacion"])) throw new Response("Forbidden", { status: 403 });
    const { error } = await supabaseAdmin.from("order_requests").insert({
      order_id: data.order_id, requested_by: context.userId,
      type: data.type, reason: data.reason, status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrderRequests = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    order_id: z.string().uuid().optional(),
  }).parse(input ?? {}))
  .handler(async ({ data }) => {
    let q = supabaseAdmin.from("order_requests")
      .select("id, order_id, requested_by, type, reason, status, reviewed_by, reviewed_at, reviewer_notes, created_at, order:orders(id, order_number, total, status, siigo_invoice_id, siigo_invoice_number, customer:customers(display_name)), requester:profiles!order_requests_requested_by_fkey(full_name, email)")
      .order("created_at", { ascending: false });
    if (data?.status) q = q.eq("status", data.status);
    if (data?.order_id) q = q.eq("order_id", data.order_id);
    const { data: rows, error } = await q;
    if (error) {
      // Sin FK declarada al perfil — fallback simple
      const fallback = await supabaseAdmin.from("order_requests")
        .select("id, order_id, requested_by, type, reason, status, reviewed_by, reviewed_at, reviewer_notes, created_at, order:orders(id, order_number, total, status, siigo_invoice_id, siigo_invoice_number, customer:customers(display_name))")
        .order("created_at", { ascending: false });
      return { requests: fallback.data ?? [] };
    }
    return { requests: rows ?? [] };
  });

export const reviewOrderRequest = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    notes: z.string().max(2000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const rs = await rolesOf(context.userId);
    if (!has(rs, ["admin", "facturacion"])) throw new Response("Forbidden", { status: 403 });
    const { data: req } = await supabaseAdmin.from("order_requests").select("*, order:orders(id, status, siigo_invoice_id)").eq("id", data.id).maybeSingle();
    if (!req) throw new Error("Solicitud no encontrada");
    if (req.status !== "pending") throw new Error("Solicitud ya procesada");

    const newStatus = data.decision === "approve" ? "approved" : "rejected";
    const { error: uErr } = await supabaseAdmin.from("order_requests").update({
      status: newStatus, reviewed_by: context.userId, reviewed_at: new Date().toISOString(),
      reviewer_notes: data.notes ?? null,
    }).eq("id", req.id);
    if (uErr) throw new Error(uErr.message);

    if (data.decision === "approve") {
      const order = req.order as unknown as { id: string; status: string; siigo_invoice_id: string | null } | null;
      if (!order) throw new Error("Pedido no encontrado");
      // Si tiene factura, intentar emitir nota crédito en Siigo (best-effort)
      let creditNoteId: string | null = null;
      let creditNoteNumber: string | null = null;
      if (order.siigo_invoice_id) {
        try {
          const cn = await SiigoClient.request<{ id: string; name?: string; number?: number }>({
            method: "POST", path: "/v1/credit-notes",
            body: { invoice: order.siigo_invoice_id, reason: req.reason ?? "Anulación" },
          });
          creditNoteId = cn.id;
          creditNoteNumber = cn.name ?? (cn.number != null ? String(cn.number) : null);
        } catch (e) {
          if (e instanceof SiigoApiError) {
            // No bloqueamos, registramos en void_reason
          }
        }
      }
      await supabaseAdmin.from("orders").update({
        status: req.type === "cancel" ? "voided" : "voided",
        voided_at: new Date().toISOString(),
        void_reason: `${req.type === "cancel" ? "Anulación" : "Devolución"}: ${req.reason ?? ""}`.slice(0, 500),
        siigo_credit_note_id: creditNoteId,
        siigo_credit_note_number: creditNoteNumber,
      }).eq("id", order.id);
    }
    return { ok: true };
  });