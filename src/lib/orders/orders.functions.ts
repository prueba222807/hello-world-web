// Server functions de pedidos: CRUD, finalización, facturación a Siigo y reparto.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";
import { SiigoClient, SiigoApiError } from "@/lib/siigo/client.server";

const STAFF_ROLES = ["admin", "facturacion", "cartera", "bodega", "conductor"] as const;
type StaffRole = typeof STAFF_ROLES[number];

const ItemInput = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_price: z.number().min(0),
  discount: z.number().min(0).max(100).default(0),
  tax_rate: z.number().min(0).max(100).default(0),
  is_gift: z.boolean().default(false),
  /** Total final con IVA editado a mano (override de la línea) */
  manual_total: z.number().min(0).nullable().optional(),
});

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  customer_id: z.string().uuid(),
  payment_method_id: z.string().uuid().nullable().optional(),
  delivery_date: z.string().optional().nullable(),
  credit_days: z.number().int().min(0).max(365).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  finalize: z.boolean().default(false),
  created_lat: z.number().nullable().optional(),
  created_lng: z.number().nullable().optional(),
  created_geo_accuracy: z.number().nullable().optional(),
  items: z.array(ItemInput).min(1, "Debe incluir al menos una línea"),
});

function round2(n: number) { return Math.round(n * 100) / 100; }

async function isAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}

async function hasAnyRole(userId: string, roles: readonly string[]) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).in("role", roles as readonly ("admin" | "bodega" | "cartera" | "conductor" | "facturacion" | "vendedor")[]);
  return (data?.length ?? 0) > 0;
}

async function getMaxDiscount(): Promise<number> {
  const { data } = await supabaseAdmin.from("app_settings").select("max_discount_pct").limit(1).maybeSingle();
  return Number(data?.max_discount_pct ?? 0);
}

interface ProductRow { id: string; siigo_id: string | null; code: string; name: string; price: number; tax_rate: number; tax_id: number | null; stock: number | null; active: boolean; }

async function loadProductsByIds(ids: string[]): Promise<Map<string, ProductRow>> {
  if (ids.length === 0) return new Map();
  const unique = Array.from(new Set(ids));
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, siigo_id, code, name, price, tax_rate, tax_id, stock, active")
    .in("id", unique);
  if (error) throw new Error(error.message);
  const map = new Map<string, ProductRow>();
  for (const r of (data ?? []) as ProductRow[]) map.set(r.id, r);
  return map;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toSiigoNumericId(value: string | number | null | undefined): number | null {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// ---------- SAVE (create or update) ----------
export const saveOrder = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const maxDiscount = await getMaxDiscount();
    const productMap = await loadProductsByIds(data.items.map((i) => i.product_id));

    // Validar stock agregando líneas con mismo producto
    const stockByProduct = new Map<string, number>();
    for (const it of data.items) {
      stockByProduct.set(it.product_id, (stockByProduct.get(it.product_id) ?? 0) + Number(it.quantity));
    }
    for (const [pid, qty] of stockByProduct) {
      const p = productMap.get(pid);
      if (!p) throw new Error("Producto no encontrado");
      if (!p.active) throw new Error(`Producto inactivo: ${p.name}`);
      if (p.stock != null && qty > Number(p.stock)) {
        throw new Error(`Stock insuficiente para ${p.name} (disponible: ${p.stock}, solicitado: ${qty})`);
      }
    }

    // Validar método de pago y crédito
    let isCredit = false;
    if (data.payment_method_id) {
      const { data: pm } = await supabaseAdmin
        .from("payment_methods")
        .select("is_credit")
        .eq("id", data.payment_method_id)
        .maybeSingle();
      isCredit = !!pm?.is_credit;
    }

    // Validaciones al finalizar
    if (data.finalize) {
      if (!data.payment_method_id) throw new Error("Selecciona un método de pago");
      if (!data.delivery_date) throw new Error("Selecciona fecha de entrega");
      if (isCredit && (data.credit_days == null || data.credit_days <= 0)) {
        throw new Error("Selecciona los días de crédito");
      }
    }

    // Calcular líneas
    let subtotal = 0, taxTotal = 0;
    let hasManual = false;
    const lines: Array<{
      product_id: string; quantity: number; unit_price: number; discount: number; tax_rate: number; is_gift: boolean;
      manual_total: number | null; line_subtotal: number; line_tax: number; line_total: number;
    }> = [];

    for (const it of data.items) {
      const p = productMap.get(it.product_id);
      if (!p) throw new Error("Producto no encontrado");

      if (!it.is_gift && it.discount > maxDiscount) {
        throw new Error(`Descuento de ${it.discount}% supera el máximo permitido (${maxDiscount}%)`);
      }

      const isGift = it.is_gift;
      const unitPrice = isGift ? 0 : it.unit_price;
      const discount = isGift ? 100 : it.discount;
      const taxRate = isGift ? 0 : it.tax_rate;

      // Cálculo nominal
      const gross = it.quantity * unitPrice;
      let lineSub = round2(gross * (1 - discount / 100));
      let lineTax = round2(lineSub * (taxRate / 100));
      let lineTotal = round2(lineSub + lineTax);

      const manual = it.manual_total != null && !isGift ? Number(it.manual_total) : null;
      if (manual != null && Math.abs(manual - lineTotal) > 0.01) {
        // Override: respetar el total con IVA dado, recalcular sub/tax preservando tax_rate
        hasManual = true;
        lineTotal = round2(manual);
        lineSub = round2(lineTotal / (1 + taxRate / 100));
        lineTax = round2(lineTotal - lineSub);
      }

      subtotal += lineSub;
      taxTotal += lineTax;
      lines.push({
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: unitPrice,
        discount,
        tax_rate: taxRate,
        is_gift: isGift,
        manual_total: manual,
        line_subtotal: lineSub,
        line_tax: lineTax,
        line_total: lineTotal,
      });
    }
    const total = round2(subtotal + taxTotal);

    const status = data.finalize ? "confirmed" : "pending";
    const dueDate = data.finalize && isCredit && data.delivery_date && data.credit_days
      ? addDays(data.delivery_date, data.credit_days)
      : null;

    let orderId = data.id;
    if (orderId) {
      const { data: existing, error: e1 } = await supabaseAdmin
        .from("orders").select("id, seller_id, status").eq("id", orderId).maybeSingle();
      if (e1 || !existing) throw new Error("Pedido no encontrado");
      const admin = await isAdmin(context.userId);
      if (existing.seller_id !== context.userId && !admin) throw new Response("Forbidden", { status: 403 });
      if (!["draft", "pending"].includes(existing.status)) {
        throw new Error("Este pedido ya no se puede editar");
      }
      const { error } = await supabaseAdmin.from("orders").update({
        customer_id: data.customer_id,
        payment_method_id: data.payment_method_id ?? null,
        delivery_date: data.delivery_date ?? null,
        credit_days: isCredit ? data.credit_days ?? null : null,
        due_date: dueDate,
        notes: data.notes ?? null,
        status,
        subtotal: round2(subtotal),
        tax_total: round2(taxTotal),
        total,
        has_manual_price: hasManual,
        manual_price_acknowledged: false,
      }).eq("id", orderId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("order_items").delete().eq("order_id", orderId);
    } else {
      // Asignar número interno por vendedor (transaccional)
      const { data: seq, error: seqErr } = await supabaseAdmin.rpc("assign_order_number", { _seller_id: context.userId });
      if (seqErr) throw new Error(seqErr.message);
      const seqRow = (Array.isArray(seq) ? seq[0] : seq) as { prefix: string; consecutive: number; order_number: string } | null;
      const { data: created, error } = await supabaseAdmin.from("orders").insert({
        seller_id: context.userId,
        customer_id: data.customer_id,
        payment_method_id: data.payment_method_id ?? null,
        delivery_date: data.delivery_date ?? null,
        credit_days: isCredit ? data.credit_days ?? null : null,
        due_date: dueDate,
        status,
        notes: data.notes ?? null,
        subtotal: round2(subtotal),
        tax_total: round2(taxTotal),
        total,
        has_manual_price: hasManual,
        created_lat: data.created_lat ?? null,
        created_lng: data.created_lng ?? null,
        created_geo_accuracy: data.created_geo_accuracy ?? null,
        order_prefix: seqRow?.prefix ?? null,
        order_consecutive: seqRow?.consecutive ?? null,
        order_number: seqRow?.order_number ?? null,
      }).select("id").single();
      if (error || !created) throw new Error(error?.message ?? "No se pudo crear el pedido");
      orderId = created.id;
    }

    const itemsRows = lines.map((l) => ({
      order_id: orderId!,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount: l.discount,
      tax_rate: l.tax_rate,
      is_gift: l.is_gift,
      manual_total: l.manual_total,
      line_subtotal: l.line_subtotal,
      line_tax: l.line_tax,
      line_total: l.line_total,
    }));
    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(itemsRows);
    if (itemsErr) throw new Error(itemsErr.message);

    return { id: orderId!, total, status, has_manual_price: hasManual };
  });

// ---------- LIST ----------
const ListSchema = z.object({
  scope: z.enum(["mine", "all"]).default("mine"),
  status: z.enum(["draft", "pending", "confirmed", "invoiced", "dispatched", "cancelled"]).optional(),
  limit: z.number().int().min(1).max(500).default(100),
}).optional();

export const listOrders = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input ?? {}) ?? { scope: "mine" as const, limit: 100 })
  .handler(async ({ data, context }) => {
    const scope = data?.scope ?? "mine";
    let q = supabaseAdmin
      .from("orders")
      .select("id, order_number, status, total, subtotal, tax_total, delivery_date, due_date, credit_days, has_manual_price, manual_price_acknowledged, siigo_invoice_number, invoice_pdf_url, created_at, customer:customers(id, display_name, identification), seller_id")
      .order("created_at", { ascending: false })
      .limit(data?.limit ?? 100);
    if (scope === "all") {
      if (!(await hasAnyRole(context.userId, STAFF_ROLES))) throw new Response("Forbidden", { status: 403 });
    } else {
      q = q.eq("seller_id", context.userId);
    }
    if (data?.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { orders: rows ?? [] };
  });

export const getOrder = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const staff = await hasAnyRole(context.userId, STAFF_ROLES);
    let q = supabaseAdmin
      .from("orders")
      .select(`
        id, order_number, order_prefix, order_consecutive, status, total, subtotal, tax_total, notes, delivery_date, due_date, credit_days,
        created_lat, created_lng, created_geo_accuracy,
        voided_at, void_reason, siigo_credit_note_id, siigo_credit_note_number,
        current_holder_user, current_holder_role,
        confirmed_at, pending_status, pending_holder_user, pending_holder_role, finalized_at,
        payment_method_id, has_manual_price, manual_price_acknowledged,
        siigo_invoice_id, siigo_invoice_number, invoice_pdf_url, invoiced_at, dispatched_at, created_at, seller_id,
        customer:customers(id, display_name, identification, email, phone, address, city_name, seller_siigo_id),
        payment_method:payment_methods(id, name, is_credit, credit_days_options),
        items:order_items(id, product_id, quantity, unit_price, discount, tax_rate, is_gift, manual_total, line_subtotal, line_tax, line_total, product:products(id, siigo_id, name, code, price, tax_rate, tax_id, stock, active))
      `)
      .eq("id", data.id);
    if (!staff) q = q.eq("seller_id", context.userId);
    const { data: row, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Response("Not found", { status: 404 });
    const { data: seller } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", row.seller_id)
      .maybeSingle();
    return { order: { ...row, seller } };
  });

export const deleteOrder = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.userId);
    const { data: row } = await supabaseAdmin.from("orders").select("id, seller_id, status").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Pedido no encontrado");
    if (row.seller_id !== context.userId && !admin) throw new Response("Forbidden", { status: 403 });
    if (!admin && !["draft", "pending"].includes(row.status)) throw new Error("No se puede eliminar este pedido");
    await supabaseAdmin.from("order_items").delete().eq("order_id", data.id);
    const { error } = await supabaseAdmin.from("orders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const acknowledgeManualPrice = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await hasAnyRole(context.userId, ["admin", "facturacion"]))) throw new Response("Forbidden", { status: 403 });
    const { error } = await supabaseAdmin.from("orders").update({ manual_price_acknowledged: true }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- FACTURAR (Fase 4) ----------
interface SiigoInvoiceResp {
  id: string;
  number?: number | string;
  name?: string;
  prefix?: string;
  consecutive?: number;
  public_url?: string;
  metadata?: { public_url?: string };
}

export const invoiceOrder = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), document_id: z.number().int().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await hasAnyRole(context.userId, ["admin", "facturacion"]))) throw new Response("Forbidden: solo admin/facturación", { status: 403 });

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, seller_id, status, payment_method_id, delivery_date, due_date, credit_days, total, notes, has_manual_price, manual_price_acknowledged, customer:customers(siigo_id, identification, seller_siigo_id), items:order_items(quantity, unit_price, discount, tax_rate, is_gift, manual_total, line_subtotal, line_tax, product:products(siigo_id, code, name, tax_id))")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !order) throw new Error("Pedido no encontrado");
    if (order.status !== "confirmed") throw new Error("Solo se pueden facturar pedidos confirmados");
    if (order.has_manual_price && !order.manual_price_acknowledged) {
      throw new Error("Este pedido tiene un ajuste manual de precio. Confírmalo antes de facturar.");
    }

    const customer = order.customer as unknown as { siigo_id: string | null; identification: string; seller_siigo_id: string | null } | null;
    if (!customer?.siigo_id) throw new Error("El cliente no tiene siigo_id");

    if (!order.payment_method_id) throw new Error("Pedido sin método de pago");
    const { data: pm } = await supabaseAdmin.from("payment_methods").select("siigo_id, is_credit").eq("id", order.payment_method_id).maybeSingle();
    if (!pm) throw new Error("Método de pago no encontrado");

    let sellerId = toSiigoNumericId(customer.seller_siigo_id);
    if (!sellerId) {
      const { data: linkedSeller } = await supabaseAdmin
        .from("sellers")
        .select("siigo_user_id")
        .eq("user_id", order.seller_id)
        .maybeSingle();
      sellerId = toSiigoNumericId(linkedSeller?.siigo_user_id);
    }
    if (!sellerId) throw new Error("El pedido no tiene un vendedor Siigo asociado. Vincula el usuario vendedor con un vendedor de Siigo o asigna vendedor al cliente.");

    const items = (order.items ?? []) as Array<{
      quantity: number; unit_price: number; discount: number; tax_rate: number; is_gift: boolean;
      manual_total: number | null; line_subtotal: number; line_tax: number;
      product: { siigo_id: string | null; code: string; name: string | null; tax_id: number | null } | null;
    }>;
    const siigoItems = items.map((it) => {
      if (!it.product?.code) throw new Error("Producto sin código");
      // Obsequios: se facturan como producto a precio simbólico de $1 (sin descuento, sin IVA)
      if (it.is_gift) {
        return {
          code: it.product.code,
          quantity: Number(it.quantity),
          price: 1,
          discount: 0,
        } as Record<string, unknown>;
      }
      // Precio antes de IVA con descuento ya aplicado. Si la línea tiene un precio
      // manual (manual_total con IVA), derivamos el precio unitario antes de IVA
      // desde line_subtotal para que Siigo respete el precio editado por el usuario.
      const qty = Number(it.quantity) || 1;
      let adjustedPrice: number;
      if (it.manual_total != null && Number(it.line_subtotal) > 0 && qty > 0) {
        adjustedPrice = round2(Number(it.line_subtotal) / qty);
      } else {
        const discountPct = Math.max(0, Math.min(Number(it.discount) || 0, 100));
        adjustedPrice = round2(Number(it.unit_price) * (1 - discountPct / 100));
      }
      const item: Record<string, unknown> = {
        code: it.product.code,
        quantity: Number(it.quantity),
        price: adjustedPrice,
        discount: 0,
      };
      if (it.product.tax_id && it.tax_rate > 0) {
        item.taxes = [{ id: it.product.tax_id }];
      }
      return item;
    });
    if (siigoItems.length === 0) throw new Error("El pedido no tiene líneas para facturar.");

    let documentId = data.document_id;
    let defaultNote: string | null = null;
    {
      const { data: settings } = await supabaseAdmin
        .from("app_settings")
        .select("default_document_id, default_invoice_note")
        .limit(1)
        .maybeSingle();
      if (!documentId && settings?.default_document_id) {
        documentId = Number(settings.default_document_id);
      }
      defaultNote = (settings?.default_invoice_note ?? null) as string | null;
    }
    if (!documentId) {
      try {
        const docs = await SiigoClient.request<Array<{ id: number; type?: string }>>({
          method: "GET", path: "/v1/document-types", query: { type: "FV" },
        });
        documentId = docs?.[0]?.id;
      } catch { /* fallback null */ }
    }
    if (!documentId) throw new Error("No se pudo determinar el tipo de documento (FV).");

    // Recalcular total de la factura a partir de los items enviados (incluye $1 por obsequio
    // y precios ajustados por descuento) para que el payment cuadre con Siigo.
    const invoiceTotal = round2(
      siigoItems.reduce((acc, it) => {
        const qty = Number(it.quantity as number) || 0;
        const price = Number(it.price as number) || 0;
        const base = qty * price;
        const taxes = (it.taxes as Array<{ id: number }> | undefined) ?? [];
        // Si hay impuestos, asumimos tax_rate del item original; reconstruimos vía mapping
        return acc + base;
      }, 0)
    );
    // Sumar IVA por línea (usa line_tax si hay precio manual)
    const taxSum = items.reduce((acc, it) => {
      if (it.is_gift) return acc;
      if (it.manual_total != null) return acc + Number(it.line_tax || 0);
      const rawDiscount = Math.max(0, Math.min(Number(it.discount) || 0, 100));
      const adjusted = round2(Number(it.unit_price) * (1 - rawDiscount / 100));
      const base = Number(it.quantity) * adjusted;
      return acc + base * (Number(it.tax_rate) / 100);
    }, 0);
    const totalWithTax = round2(invoiceTotal + taxSum);
    const today = new Date().toISOString().slice(0, 10);
    const paymentEntry: Record<string, unknown> = { id: pm.siigo_id, value: totalWithTax };
    if (pm.is_credit && order.due_date) paymentEntry.due_date = order.due_date;
    const orderNote = (order.notes ?? "").trim();
    const defNote = (defaultNote ?? "").trim();
    const observations = [defNote, orderNote].filter(Boolean).join("\n\n") || undefined;
    const payload: Record<string, unknown> = {
      document: { id: documentId },
      date: today,
      customer: { identification: customer.identification },
      seller: sellerId,
      items: siigoItems,
      payments: [paymentEntry],
      observations,
    };

    let invoice: SiigoInvoiceResp;
    try {
      invoice = await SiigoClient.request<SiigoInvoiceResp>({ method: "POST", path: "/v1/invoices", body: payload });
    } catch (e) {
      if (e instanceof SiigoApiError) {
        const body = e.body ?? "";
        if (body.includes("document_settings") || body.includes("document.id")) {
          throw new Error(
            `Siigo rechazó el tipo de documento (id=${documentId}). ` +
            `Ve a Admin → Ajustes, importa el catálogo y elige otro tipo de documento de factura ` +
            `que esté habilitado para tu usuario API (numeración automática). Detalle: ${body.slice(0, 300)}`
          );
        }
        throw new Error(`Siigo rechazó la factura [${e.status}]: ${body.slice(0, 400)}`);
      }
      throw e;
    }

    const publicUrl = invoice.public_url ?? invoice.metadata?.public_url ?? null;
    const number = invoice.name ?? (invoice.number != null ? String(invoice.number) : null);
    const prefix = invoice.prefix ?? null;
    const consecutive = invoice.consecutive ?? null;

    const { error: updErr } = await supabaseAdmin.from("orders").update({
      status: "invoiced",
      siigo_invoice_id: invoice.id,
      siigo_invoice_number: number,
      siigo_invoice_prefix: prefix,
      siigo_invoice_consecutive: consecutive,
      invoice_pdf_url: publicUrl,
      invoiced_at: new Date().toISOString(),
    }).eq("id", order.id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, invoice_id: invoice.id, number, prefix, consecutive, public_url: publicUrl };
  });

export const dispatchOrder = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await hasAnyRole(context.userId, ["admin", "facturacion", "bodega"]))) throw new Response("Forbidden", { status: 403 });
    const { data: row } = await supabaseAdmin.from("orders").select("status").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Pedido no encontrado");
    if (row.status !== "invoiced") throw new Error("Solo se puede despachar un pedido facturado");
    const { error } = await supabaseAdmin.from("orders").update({
      status: "dispatched", dispatched_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Response("Forbidden", { status: 403 });
    const { data: row } = await supabaseAdmin.from("orders").select("status").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Pedido no encontrado");
    if (["invoiced", "dispatched"].includes(row.status)) throw new Error("No se puede cancelar un pedido facturado");
    const { error } = await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Compat: alias para compatibilidad con código anterior
export const createOrder = saveOrder;
