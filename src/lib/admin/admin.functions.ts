// Server functions admin: gestión de usuarios, roles múltiples y vinculación con sellers de Siigo.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";

const APP_ROLES = ["admin", "vendedor", "facturacion", "cartera", "bodega", "conductor"] as const;
type AppRole = typeof APP_ROLES[number];

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const rolesByUser = new Map<string, AppRole[]>();
    for (const r of (roles ?? []) as Array<{ user_id: string; role: AppRole }>) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }

    const { data: sellers } = await supabaseAdmin
      .from("sellers")
      .select("id, user_id, siigo_user_id, first_name, last_name, email")
      .not("user_id", "is", null);
    const sellerByUser = new Map<string, { id: string; siigo_user_id: string; name: string }>();
    for (const s of (sellers ?? []) as Array<{ id: string; user_id: string; siigo_user_id: string; first_name: string | null; last_name: string | null; email: string | null }>) {
      sellerByUser.set(s.user_id, {
        id: s.id,
        siigo_user_id: s.siigo_user_id,
        name: [s.first_name, s.last_name].filter(Boolean).join(" ") || s.email || s.siigo_user_id,
      });
    }

    return {
      users: (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        created_at: p.created_at,
        roles: rolesByUser.get(p.id) ?? [],
        linked_seller: sellerByUser.get(p.id) ?? null,
      })),
    };
  });

export const setUserRoles = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    user_id: z.string().uuid(),
    roles: z.array(z.enum(APP_ROLES)).min(0).max(APP_ROLES.length),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId && !data.roles.includes("admin")) {
      throw new Error("No puedes quitarte tu propio rol de admin");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    if (data.roles.length > 0) {
      const unique = Array.from(new Set(data.roles));
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert(unique.map((role) => ({ user_id: data.user_id, role })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// Compat: alias antiguo (un solo rol)
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    user_id: z.string().uuid(),
    role: z.enum(APP_ROLES),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId && data.role !== "admin") {
      throw new Error("No puedes quitarte tu propio rol de admin");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const linkUserToSeller = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    user_id: z.string().uuid(),
    seller_id: z.string().uuid().nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // Desvincular previo
    await supabaseAdmin.from("sellers").update({ user_id: null }).eq("user_id", data.user_id);
    if (data.seller_id) {
      const { error } = await supabaseAdmin
        .from("sellers")
        .update({ user_id: data.user_id })
        .eq("id", data.seller_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- DASHBOARD ----------
export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const startOfWeek = new Date(today.getTime() - 7 * 86400_000).toISOString();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

    const [todayRes, weekRes, monthRes, pendingRes, confirmedRes, invoicedNoDispatchRes, monthInvoicedSum, manualRes, recentRes] = await Promise.all([
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startOfDay),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startOfWeek),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("status", "invoiced"),
      supabaseAdmin.from("orders").select("total").gte("invoiced_at", startOfMonth).in("status", ["invoiced", "dispatched"]),
      supabaseAdmin.from("orders").select("id, total, customer:customers(display_name)", { count: "exact" }).eq("has_manual_price", true).eq("manual_price_acknowledged", false).limit(20),
      supabaseAdmin.from("orders").select("id, status, total, created_at, customer:customers(display_name)").order("created_at", { ascending: false }).limit(10),
    ]);

    const sumMonth = (monthInvoicedSum.data ?? []).reduce((s, r) => s + Number((r as { total: number }).total ?? 0), 0);

    return {
      kpis: {
        orders_today: todayRes.count ?? 0,
        orders_week: weekRes.count ?? 0,
        orders_month: monthRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        confirmed: confirmedRes.count ?? 0,
        invoiced_pending_dispatch: invoicedNoDispatchRes.count ?? 0,
        invoiced_total_month: sumMonth,
        manual_price_pending: manualRes.count ?? 0,
      },
      recent: (recentRes.data ?? []) as Array<{ id: string; status: string; total: number; created_at: string; customer: { display_name: string } | null }>,
      manual_orders: (manualRes.data ?? []) as Array<{ id: string; total: number; customer: { display_name: string } | null }>,
    };
  });
