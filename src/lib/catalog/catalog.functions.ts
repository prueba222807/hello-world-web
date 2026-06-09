// Server functions del catálogo: lectura local y sincronización desde Siigo.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SiigoClient, SiigoApiError } from "@/lib/siigo/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Response("Forbidden: solo admin", { status: 403 });
}

// ---------- LISTADOS ----------
const ListSchema = z.object({
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(500).default(50),
});

const CustomerListSchema = ListSchema.extend({
  seller_id: z.string().trim().max(64).optional(),
  active: z.boolean().optional(),
});

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => CustomerListSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    // Reglas:
    //  - admin → ve todos los clientes.
    //  - cualquier otro usuario CON vendedor de Siigo asignado → solo sus clientes (por seller_siigo_id).
    //  - usuarios sin vendedor asignado y sin rol admin → no ven clientes.
    //  - staff sin rol admin tampoco listado: requiere vendedor asignado para ver clientes.
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => r.role as string);
    const isAdmin = roles.includes("admin");
    let restrictSellerId: string | null = null;
    if (!isAdmin) {
      const { data: seller } = await supabaseAdmin
        .from("sellers").select("siigo_user_id").eq("user_id", context.userId).maybeSingle();
      restrictSellerId = seller?.siigo_user_id ?? "__none__";
    }
    let q = supabaseAdmin
      .from("customers")
      .select("id, siigo_id, identification, display_name, commercial_name, email, phone, address, city_name, state_name, active, seller_siigo_id, created_by_user, approval_status")
      .order("display_name", { ascending: true })
      .limit(data.limit);
    if (data.search) {
      q = q.or(
        `identification.ilike.%${data.search}%,display_name.ilike.%${data.search}%,commercial_name.ilike.%${data.search}%,email.ilike.%${data.search}%,phone.ilike.%${data.search}%,city_name.ilike.%${data.search}%`,
      );
    }
    if (restrictSellerId !== null) {
      // El vendedor sólo ve sus propios clientes (asignados a su vendedor de Siigo).
      q = q.eq("seller_siigo_id", restrictSellerId);
    } else if (data.seller_id) {
      q = q.eq("seller_siigo_id", data.seller_id);
    }
    if (typeof data.active === "boolean") q = q.eq("active", data.active);
    // Por defecto ocultar rechazados del listado normal.
    q = q.neq("approval_status", "rejected");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { customers: rows ?? [] };
  });

const ProductListSchema = ListSchema.extend({
  active: z.boolean().optional(),
  inStockOnly: z.boolean().optional(),
});

export const listProducts = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => ProductListSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("products")
      .select("id, siigo_id, code, name, price, tax_rate, unit, stock, stock_override, active")
      .order("name", { ascending: true })
      .limit(data.limit);
    if (data.search) {
      q = q.or(`code.ilike.%${data.search}%,name.ilike.%${data.search}%`);
    }
    if (typeof data.active === "boolean") q = q.eq("active", data.active);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    type Row = (typeof rows extends Array<infer T> ? T : never);
    // Cargar reservas (pedidos confirmados sin facturar)
    const ids = ((rows ?? []) as Row[]).map((r) => (r as { id: string }).id);
    let reservedMap = new Map<string, number>();
    if (ids.length > 0) {
      const { data: resv } = await supabaseAdmin
        .from("product_reservations")
        .select("product_id, reserved_qty")
        .in("product_id", ids);
      for (const r of (resv ?? []) as Array<{ product_id: string; reserved_qty: number | string }>) {
        reservedMap.set(r.product_id, Number(r.reserved_qty) || 0);
      }
    }
    const mapped = ((rows ?? []) as Row[]).map((r) => {
      const row = r as { id: string; stock_override: number | null; stock: number | null };
      const override = row.stock_override;
      const baseStock = override != null ? Number(override) : row.stock;
      const reserved = reservedMap.get(row.id) ?? 0;
      const available = baseStock != null ? Math.max(0, Number(baseStock) - reserved) : null;
      return { ...r, stock: available, stock_reserved: reserved, stock_base: baseStock };
    });
    const filtered = data.inStockOnly ? mapped.filter((p) => (p.stock ?? 0) > 0) : mapped;
    return { products: filtered };
  });

export const listSellers = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("sellers")
      .select("id, siigo_user_id, first_name, last_name, email, active")
      .order("first_name", { ascending: true });
    if (error) throw new Error(error.message);
    return { sellers: data ?? [] };
  });

export const listPaymentMethods = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ scope: z.enum(["all", "vendor"]).default("vendor") }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { data: adminRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    const isAdminUser = !!adminRow;
    let q = supabaseAdmin
      .from("payment_methods")
      .select("id, siigo_id, name, display_name, type, active, is_credit, credit_days_options, visible_to_sellers")
      .order("name", { ascending: true });
    if (data.scope === "all") {
      if (!isAdminUser) throw new Response("Forbidden", { status: 403 });
    } else {
      q = q.eq("active", true).eq("visible_to_sellers", true);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { methods: rows ?? [] };
  });

export const updatePaymentMethod = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    is_credit: z.boolean().optional(),
    credit_days_options: z.array(z.number().int().min(1).max(365)).min(1).max(20).optional(),
    visible_to_sellers: z.boolean().optional(),
    display_name: z.string().trim().max(120).nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch: {
      is_credit?: boolean;
      credit_days_options?: number[];
      visible_to_sellers?: boolean;
      display_name?: string | null;
    } = {};
    if (data.is_credit !== undefined) patch.is_credit = data.is_credit;
    if (data.credit_days_options !== undefined) patch.credit_days_options = data.credit_days_options;
    if (data.visible_to_sellers !== undefined) patch.visible_to_sellers = data.visible_to_sellers;
    if (data.display_name !== undefined) patch.display_name = data.display_name?.trim() || null;
    const { error } = await supabaseAdmin.from("payment_methods").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- SINCRONIZACIÓN ----------
type SiigoListResp<T> = { results?: T[]; pagination?: { total_results?: number } };

interface SiigoCustomer {
  id: string;
  type?: string;
  person_type?: string;
  id_type?: { code?: string };
  identification: string;
  branch_office?: number;
  name?: string[];
  commercial_name?: string;
  active?: boolean;
  vendor_id?: string;
  seller?: string | number | { id?: string | number };
  related_users?: { seller_id?: string | number; collector_id?: string | number };
  contacts?: Array<{ email?: string; phone?: { number?: string } }>;
  address?: {
    address?: string;
    city?: { city_code?: string; city_name?: string; state_name?: string; country_code?: string };
  };
}

function customerDisplayName(c: SiigoCustomer): string {
  if (c.commercial_name && c.commercial_name.trim()) return c.commercial_name.trim();
  const name = (c.name ?? []).filter(Boolean).join(" ").trim();
  return name || c.identification;
}

function customerSellerId(c: SiigoCustomer): string | null {
  if (c.related_users?.seller_id != null) return String(c.related_users.seller_id);
  if (c.vendor_id) return String(c.vendor_id);
  if (typeof c.seller === "string" || typeof c.seller === "number") return String(c.seller);
  if (c.seller && typeof c.seller === "object" && c.seller.id != null) return String(c.seller.id);
  return null;
}

interface SiigoProduct {
  id: string;
  code: string;
  name: string;
  description?: string;
  active?: boolean;
  unit?: { code?: string };
  account_group?: { id?: number };
  prices?: Array<{ price_list?: Array<{ value?: number }> }>;
  taxes?: Array<{ id?: number; percentage?: number }>;
  available_quantity?: number;
}

function productPrice(p: SiigoProduct): number {
  const v = p.prices?.[0]?.price_list?.[0]?.value;
  return typeof v === "number" ? v : 0;
}
function productTax(p: SiigoProduct): { rate: number; id: number | null } {
  const t = p.taxes?.[0];
  return { rate: typeof t?.percentage === "number" ? t.percentage : 0, id: t?.id ?? null };
}

async function logSync(
  entity: string,
  status: "ok" | "error",
  totals: { total: number; inserted: number; updated: number; errors: number },
  message: string,
  startedAt: string,
) {
  await supabaseAdmin.from("sync_log").insert({
    entity,
    status,
    total: totals.total,
    inserted: totals.inserted,
    updated: totals.updated,
    errors: totals.errors,
    message,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });
}

export const syncCustomers = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const startedAt = new Date().toISOString();
    let total = 0, inserted = 0, updated = 0, errors = 0;
    try {
      let page = 1;
      const pageSize = 100;
      const maxPages = 50; // tope de seguridad
      while (page <= maxPages) {
        const resp = await SiigoClient.request<SiigoListResp<SiigoCustomer>>({
          method: "GET",
          path: "/v1/customers",
          query: { page, page_size: pageSize },
        });
        const items = resp.results ?? [];
        if (items.length === 0) break;
        for (const c of items) {
          total++;
          try {
            const row = {
              siigo_id: c.id,
              identification: c.identification,
              id_type: c.id_type?.code ?? null,
              branch_office: c.branch_office ?? 0,
              person_type: c.person_type ?? c.type ?? null,
              commercial_name: c.commercial_name ?? null,
              first_name: c.name?.[0] ?? null,
              last_name: c.name?.slice(1).join(" ") || null,
              display_name: customerDisplayName(c),
              email: c.contacts?.[0]?.email ?? null,
              phone: c.contacts?.[0]?.phone?.number ?? null,
              address: c.address?.address ?? null,
              city_code: c.address?.city?.city_code ?? null,
              city_name: c.address?.city?.city_name ?? null,
              state_name: c.address?.city?.state_name ?? null,
              country_code: c.address?.city?.country_code ?? "Co",
              seller_siigo_id: customerSellerId(c),
              active: c.active ?? true,
              raw: c as unknown as never,
            };
            const existing = await supabaseAdmin
              .from("customers")
              .select("id")
              .eq("siigo_id", c.id)
              .maybeSingle();
            if (existing.data) {
              const { error } = await supabaseAdmin
                .from("customers")
                .update(row)
                .eq("id", existing.data.id);
              if (error) throw error;
              updated++;
            } else {
              const { error } = await supabaseAdmin.from("customers").insert(row);
              if (error) throw error;
              inserted++;
            }
          } catch (e) {
            errors++;
            console.error("syncCustomers item error", e);
          }
        }
        if (items.length < pageSize) break;
        page++;
      }
      await logSync("customers", "ok", { total, inserted, updated, errors }, "Sincronización completada", startedAt);
      return { ok: true as const, total, inserted, updated, errors };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logSync("customers", "error", { total, inserted, updated, errors }, msg, startedAt);
      return { ok: false as const, total, inserted, updated, errors, message: msg };
    }
  });

export const syncProducts = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const startedAt = new Date().toISOString();
    let total = 0, inserted = 0, updated = 0, errors = 0;
    try {
      let page = 1;
      const pageSize = 100;
      const maxPages = 50;
      while (page <= maxPages) {
        const resp = await SiigoClient.request<SiigoListResp<SiigoProduct>>({
          method: "GET",
          path: "/v1/products",
          query: { page, page_size: pageSize },
        });
        const items = resp.results ?? [];
        if (items.length === 0) break;
        for (const p of items) {
          total++;
          try {
            const tax = productTax(p);
            const row = {
              siigo_id: p.id,
              code: p.code,
              name: p.name,
              description: p.description ?? null,
              price: productPrice(p),
              tax_rate: tax.rate,
              tax_id: tax.id,
              unit: p.unit?.code ?? null,
              stock: typeof p.available_quantity === "number" ? p.available_quantity : null,
              account_group: p.account_group?.id ?? null,
              active: p.active ?? true,
              raw: p as unknown as never,
            };
            const existing = await supabaseAdmin
              .from("products")
              .select("id")
              .eq("siigo_id", p.id)
              .maybeSingle();
            if (existing.data) {
              const { error } = await supabaseAdmin
                .from("products")
                .update(row)
                .eq("id", existing.data.id);
              if (error) throw error;
              updated++;
            } else {
              const { error } = await supabaseAdmin.from("products").insert(row);
              if (error) throw error;
              inserted++;
            }
          } catch (e) {
            errors++;
            console.error("syncProducts item error", e);
          }
        }
        if (items.length < pageSize) break;
        page++;
      }
      await logSync("products", "ok", { total, inserted, updated, errors }, "Sincronización completada", startedAt);
      return { ok: true as const, total, inserted, updated, errors };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logSync("products", "error", { total, inserted, updated, errors }, msg, startedAt);
      return { ok: false as const, total, inserted, updated, errors, message: msg };
    }
  });

export const getLastSync = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entity: z.enum(["customers", "products", "sellers", "payment_methods"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("sync_log")
      .select("status, total, inserted, updated, errors, message, started_at, finished_at")
      .eq("entity", data.entity)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { last: row ?? null };
  });

// ---------- SYNC SELLERS (Siigo /v1/users) ----------
interface SiigoUser {
  id: string | number;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  identification?: string;
  active?: boolean;
}

export const syncSellers = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const startedAt = new Date().toISOString();
    let total = 0, inserted = 0, updated = 0, errors = 0;
    try {
      let page = 1;
      const pageSize = 100;
      while (page <= 20) {
        const resp = await SiigoClient.request<SiigoListResp<SiigoUser>>({
          method: "GET", path: "/v1/users", query: { page, page_size: pageSize },
        });
        const items = resp.results ?? [];
        if (items.length === 0) break;
        for (const u of items) {
          total++;
          try {
            const row = {
              siigo_user_id: String(u.id),
              first_name: u.first_name ?? null,
              last_name: u.last_name ?? null,
              email: u.email ?? u.username ?? null,
              identification: u.identification ?? null,
              active: u.active ?? true,
              raw: u as unknown as never,
            };
            const { data: existing } = await supabaseAdmin
              .from("sellers").select("id").eq("siigo_user_id", String(u.id)).maybeSingle();
            if (existing) {
              const { error } = await supabaseAdmin.from("sellers").update(row).eq("id", existing.id);
              if (error) throw error;
              updated++;
            } else {
              const { error } = await supabaseAdmin.from("sellers").insert(row);
              if (error) throw error;
              inserted++;
            }
          } catch (e) { errors++; console.error("syncSellers item", e); }
        }
        if (items.length < pageSize) break;
        page++;
      }
      await logSync("sellers", "ok", { total, inserted, updated, errors }, "OK", startedAt);
      return { ok: true as const, total, inserted, updated, errors };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logSync("sellers", "error", { total, inserted, updated, errors }, msg, startedAt);
      return { ok: false as const, total, inserted, updated, errors, message: msg };
    }
  });

// ---------- SYNC PAYMENT METHODS (Siigo /v1/payment-types) ----------
interface SiigoPaymentType {
  id: number;
  name: string;
  type?: string;
  active?: boolean;
}

export const syncPaymentMethods = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const startedAt = new Date().toISOString();
    let total = 0, inserted = 0, updated = 0, errors = 0;
    try {
      const resp = await SiigoClient.request<SiigoPaymentType[] | SiigoListResp<SiigoPaymentType>>({
        method: "GET", path: "/v1/payment-types", query: { document_type: "FV" },
      });
      const items: SiigoPaymentType[] = Array.isArray(resp) ? resp : (resp.results ?? []);
      for (const p of items) {
        total++;
        try {
          const row = {
            siigo_id: p.id,
            name: p.name,
            type: p.type ?? null,
            active: p.active ?? true,
            raw: p as unknown as never,
          };
          const { data: existing } = await supabaseAdmin
            .from("payment_methods").select("id").eq("siigo_id", p.id).maybeSingle();
          if (existing) {
            const { error } = await supabaseAdmin.from("payment_methods").update(row).eq("id", existing.id);
            if (error) throw error;
            updated++;
          } else {
            const { error } = await supabaseAdmin.from("payment_methods").insert(row);
            if (error) throw error;
            inserted++;
          }
        } catch (e) { errors++; console.error("syncPaymentMethods item", e); }
      }
      await logSync("payment_methods", "ok", { total, inserted, updated, errors }, "OK", startedAt);
      return { ok: true as const, total, inserted, updated, errors };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logSync("payment_methods", "error", { total, inserted, updated, errors }, msg, startedAt);
      return { ok: false as const, total, inserted, updated, errors, message: msg };
    }
  });

// ---------- CLIENTES LOCALES (vendedor) ----------
export const createLocalCustomer = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    identification: z.string().trim().min(3).max(40),
    id_type: z.string().trim().max(10).default("13"),
    person_type: z.enum(["Person", "Company"]).default("Person"),
    display_name: z.string().trim().min(2).max(200),
    commercial_name: z.string().trim().max(200).optional(),
    first_name: z.string().trim().max(120).optional(),
    last_name: z.string().trim().max(120).optional(),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    phone: z.string().trim().max(40).optional(),
    address: z.string().trim().max(300).optional(),
    city_name: z.string().trim().max(120).optional(),
    city_code: z.string().trim().max(20).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    // El vendedor debe tener asignado un vendedor de Siigo para poder crear clientes.
    const { data: seller } = await supabaseAdmin
      .from("sellers").select("siigo_user_id").eq("user_id", context.userId).maybeSingle();
    if (!seller?.siigo_user_id) {
      throw new Error("No tienes un vendedor de Siigo asignado. Pide al administrador que te asocie uno.");
    }
    // Verificar duplicado por identificación
    const { data: existing } = await supabaseAdmin
      .from("customers").select("id, display_name").eq("identification", data.identification).maybeSingle();
    if (existing) {
      throw new Error(`Ya existe un cliente con esa identificación: ${existing.display_name}`);
    }

    // Construir nombre para Siigo
    let nameArr: string[];
    if (data.person_type === "Company") {
      nameArr = [data.commercial_name || data.display_name];
    } else {
      const first = data.first_name?.trim() || data.display_name.trim().split(/\s+/)[0] || data.display_name;
      const last = data.last_name?.trim() || data.display_name.trim().split(/\s+/).slice(1).join(" ") || first;
      nameArr = [first, last];
    }

    const siigoPayload: Record<string, unknown> = {
      type: "Customer",
      person_type: data.person_type,
      id_type: data.id_type,
      identification: data.identification,
      branch_office: 0,
      name: nameArr,
      commercial_name: data.commercial_name ?? null,
      vat_responsible: false,
      fiscal_responsibilities: [{ code: "R-99-PN" }],
      active: true,
      related_users: { seller_id: Number(seller.siigo_user_id) || seller.siigo_user_id },
    };
    const contacts: Array<Record<string, unknown>> = [];
    if (data.email || data.phone) {
      contacts.push({
        first_name: data.person_type === "Person" ? nameArr[0] : (data.commercial_name || data.display_name),
        last_name: data.person_type === "Person" ? (nameArr[1] || nameArr[0]) : ".",
        email: data.email || undefined,
        phone: data.phone ? { number: data.phone } : undefined,
      });
    }
    if (contacts.length > 0) siigoPayload.contacts = contacts;
    if (data.address && data.city_code && data.city_name) {
      siigoPayload.address = {
        address: data.address,
        city: { country_code: "Co", state_code: data.city_code.slice(0, 2), city_code: data.city_code, city_name: data.city_name },
      };
    }

    let siigoCreated: { id?: string } | null = null;
    try {
      siigoCreated = await SiigoClient.request<{ id?: string }>({
        method: "POST", path: "/v1/customers", body: siigoPayload,
      });
    } catch (e) {
      let detail = e instanceof Error ? e.message : String(e);
      if (e instanceof SiigoApiError && e.body) {
        try {
          const parsed = JSON.parse(e.body) as { Errors?: Array<{ Message?: string; Code?: string }>; message?: string };
          if (parsed.Errors?.length) {
            detail = parsed.Errors.map((x) => `${x.Code ?? ""} ${x.Message ?? ""}`.trim()).join(" | ");
          } else if (parsed.message) {
            detail = parsed.message;
          } else {
            detail = e.body;
          }
        } catch {
          detail = e.body;
        }
      }
      console.error("Siigo create customer failed:", detail, "payload:", JSON.stringify(siigoPayload));
      throw new Error(`Siigo rechazó el cliente: ${detail.slice(0, 600)}`);
    }

    const row = {
      siigo_id: siigoCreated?.id ?? null,
      identification: data.identification,
      id_type: data.id_type,
      person_type: data.person_type,
      display_name: data.display_name,
      commercial_name: data.commercial_name ?? null,
      email: data.email && data.email.length > 0 ? data.email : null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      city_name: data.city_name ?? null,
      city_code: data.city_code ?? null,
      seller_siigo_id: seller.siigo_user_id,
      created_by_user: context.userId,
      active: true,
    };
    const { data: inserted, error } = await supabaseAdmin
      .from("customers").insert(row).select("id, display_name, identification, email, phone, address, city_name").single();
    if (error) throw new Error(error.message);
    return { customer: inserted };
  });

// ---------- AJUSTE DE STOCK (admin) ----------
export const setProductStockOverride = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    product_id: z.string().uuid(),
    stock_override: z.number().min(0).max(1000000).nullable(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("products")
      .update({ stock_override: data.stock_override })
      .eq("id", data.product_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
