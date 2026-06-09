import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";

const Range = z.object({
  from: z.string().min(8),
  to: z.string().min(8),
});

type Role = "admin" | "facturacion" | "cartera";
async function assertReportRole(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const rs = ((data ?? []) as Array<{ role: Role | string }>).map((r) => r.role as string);
  if (!rs.some((r) => ["admin", "facturacion", "cartera"].includes(r))) throw new Response("Forbidden", { status: 403 });
}

async function loadInvoicedOrders(from: string, to: string) {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(`
      id, order_number, status, total, subtotal, tax_total,
      siigo_invoice_id, siigo_invoice_number, invoiced_at, finalized_at, created_at, confirmed_at,
      seller_id, customer_id,
      customer:customers(id, display_name, identification),
      items:order_items(id, quantity, unit_price, discount, tax_rate, line_subtotal, line_tax, line_total, product:products(id, name, code))
    `)
    .not("siigo_invoice_id", "is", null)
    .gte("invoiced_at", new Date(from).toISOString())
    .lte("invoiced_at", new Date(to + "T23:59:59").toISOString())
    .order("invoiced_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadSellers(ids: string[]) {
  if (ids.length === 0) return {};
  const { data } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
}

export const reportSalesBySeller = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => Range.parse(input))
  .handler(async ({ data, context }) => {
    await assertReportRole(context.userId);
    const orders = await loadInvoicedOrders(data.from, data.to);
    const sellers = await loadSellers([...new Set(orders.map((o) => o.seller_id))]);
    const agg = new Map<string, { seller_id: string; seller: string; orders: number; total: number }>();
    for (const o of orders) {
      const key = o.seller_id;
      const s = sellers[key];
      const row = agg.get(key) ?? { seller_id: key, seller: s?.full_name || s?.email || key, orders: 0, total: 0 };
      row.orders += 1; row.total += Number(o.total) || 0;
      agg.set(key, row);
    }
    const summary = Array.from(agg.values()).map((r) => ({ ...r, average: r.orders ? r.total / r.orders : 0 })).sort((a, b) => b.total - a.total);
    const detail = orders.map((o) => ({
      invoice: o.siigo_invoice_number,
      order: o.order_number,
      date: o.invoiced_at,
      seller: sellers[o.seller_id]?.full_name || sellers[o.seller_id]?.email || o.seller_id,
      customer: o.customer?.display_name ?? "",
      subtotal: o.subtotal, tax: o.tax_total, total: o.total,
    }));
    return { summary, detail };
  });

export const reportSalesByProduct = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => Range.parse(input))
  .handler(async ({ data, context }) => {
    await assertReportRole(context.userId);
    const orders = await loadInvoicedOrders(data.from, data.to);
    type Row = { product_id: string; code: string; name: string; qty: number; subtotal: number; tax: number; total: number };
    const agg = new Map<string, Row>();
    const detail: Array<{ invoice: string | null; date: string | null; product: string; code: string; qty: number; unit: number; discount: number; tax_rate: number; line_subtotal: number; line_tax: number; line_total: number }> = [];
    let grandTotal = 0;
    for (const o of orders) {
      for (const it of o.items ?? []) {
        const id = it.product?.id ?? "_";
        const r = agg.get(id) ?? { product_id: id, code: it.product?.code ?? "", name: it.product?.name ?? "—", qty: 0, subtotal: 0, tax: 0, total: 0 };
        r.qty += Number(it.quantity) || 0;
        r.subtotal += Number(it.line_subtotal) || 0;
        r.tax += Number(it.line_tax) || 0;
        r.total += Number(it.line_total) || 0;
        agg.set(id, r);
        grandTotal += Number(it.line_total) || 0;
        detail.push({
          invoice: o.siigo_invoice_number, date: o.invoiced_at,
          product: it.product?.name ?? "", code: it.product?.code ?? "",
          qty: it.quantity, unit: it.unit_price, discount: it.discount, tax_rate: it.tax_rate,
          line_subtotal: it.line_subtotal, line_tax: it.line_tax, line_total: it.line_total,
        });
      }
    }
    const summary = Array.from(agg.values()).map((r) => ({ ...r, share_pct: grandTotal ? (r.total / grandTotal) * 100 : 0 })).sort((a, b) => b.total - a.total);
    return { summary, detail };
  });

export const reportSalesByCustomer = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => Range.parse(input))
  .handler(async ({ data, context }) => {
    await assertReportRole(context.userId);
    const orders = await loadInvoicedOrders(data.from, data.to);
    type Row = { customer_id: string; customer: string; identification: string; orders: number; total: number; last: string | null };
    const agg = new Map<string, Row>();
    for (const o of orders) {
      const id = o.customer_id ?? "_";
      const r = agg.get(id) ?? { customer_id: id, customer: o.customer?.display_name ?? "—", identification: o.customer?.identification ?? "", orders: 0, total: 0, last: null };
      r.orders += 1; r.total += Number(o.total) || 0;
      if (!r.last || (o.invoiced_at && o.invoiced_at > r.last)) r.last = o.invoiced_at;
      agg.set(id, r);
    }
    const summary = Array.from(agg.values()).sort((a, b) => b.total - a.total);
    const detail = orders.map((o) => ({
      invoice: o.siigo_invoice_number, date: o.invoiced_at,
      customer: o.customer?.display_name ?? "", identification: o.customer?.identification ?? "",
      subtotal: o.subtotal, tax: o.tax_total, total: o.total,
    }));
    return { summary, detail };
  });

export const reportTraceability = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => Range.parse(input))
  .handler(async ({ data, context }) => {
    await assertReportRole(context.userId);
    const orders = await loadInvoicedOrders(data.from, data.to);
    const ids = orders.map((o) => o.id);
    if (ids.length === 0) return { summary: [], detail: [] };
    const { data: events } = await supabaseAdmin.from("order_events").select("order_id, event_type, from_status, to_status, event_at").in("order_id", ids).order("event_at", { ascending: true });
    const byOrder = new Map<string, Array<{ event_type: string; to_status: string; event_at: string }>>();
    for (const e of (events ?? [])) {
      const arr = byOrder.get(e.order_id) ?? [];
      arr.push({ event_type: e.event_type, to_status: e.to_status, event_at: e.event_at });
      byOrder.set(e.order_id, arr);
    }
    const now = new Date();
    const minsBetween = (a: string | null, b: string | null) => (!a || !b) ? null : Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
    const detail = orders.map((o) => {
      const evs = byOrder.get(o.id) ?? [];
      const find = (type: string) => evs.find((e) => e.event_type === type)?.event_at ?? null;
      const billToWh = find("bill_to_warehouse");
      const whRecv = find("warehouse_receives") ?? find("transfer_accepted");
      const whToDr = find("warehouse_to_driver");
      const drRecv = find("driver_receives");
      const delivered = find("driver_delivers_customer") ?? find("warehouse_delivers_customer");
      const returnedBill = find("billing_receives_return");
      const finalized = o.finalized_at ?? find("collections_receives");
      return {
        invoice: o.siigo_invoice_number, order: o.order_number, status: o.status,
        customer: o.customer?.display_name ?? "",
        invoiced_at: o.invoiced_at,
        min_billing_to_warehouse: minsBetween(o.invoiced_at, billToWh),
        min_warehouse_to_driver: minsBetween(whRecv ?? billToWh, whToDr),
        min_driver_to_customer: minsBetween(drRecv ?? whToDr, delivered),
        min_invoiced_to_delivered: minsBetween(o.invoiced_at, delivered),
        min_delivered_to_billing_return: minsBetween(delivered, returnedBill),
        min_total_to_finalized: minsBetween(o.invoiced_at, finalized),
        is_open: !finalized,
        elapsed_mins_open: finalized ? null : minsBetween(o.invoiced_at, now.toISOString()),
      };
    });
    const closed = detail.filter((d) => d.min_total_to_finalized != null);
    const avg = (arr: Array<number | null>) => {
      const vs = arr.filter((v): v is number => v != null);
      return vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
    };
    const summary = [{
      total_orders: detail.length,
      finalized: closed.length,
      open: detail.length - closed.length,
      avg_min_to_delivered: avg(detail.map((d) => d.min_invoiced_to_delivered)),
      avg_min_to_finalized: avg(detail.map((d) => d.min_total_to_finalized)),
    }];
    return { summary, detail };
  });