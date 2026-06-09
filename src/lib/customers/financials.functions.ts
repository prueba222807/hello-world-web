// Server functions: trae facturas (Siigo) + pedidos locales + cartera para un cliente.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SiigoClient } from "@/lib/siigo/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";

type SiigoInvoice = {
  id: string;
  name?: string;
  number?: number;
  prefix?: string;
  date?: string;
  due_date?: string;
  total?: number;
  balance?: number;
  public_url?: string;
  metadata?: { created?: string };
  customer?: { identification?: string };
  payments?: Array<{ value?: number; due_date?: string }>;
  stamp?: { status?: string };
};

export type CustomerInvoice = {
  id: string;
  number: string;
  date: string | null;
  due_date: string | null;
  total: number;
  balance: number;
  status: "paid" | "pending" | "overdue";
  pdf_url: string | null;
};

export const getCustomerFinancials = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ customer_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    // Cliente local
    const { data: customer, error: cErr } = await supabaseAdmin
      .from("customers")
      .select("id, identification, display_name")
      .eq("id", data.customer_id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!customer) throw new Error("Cliente no encontrado");

    // Pedidos locales
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, status, total, created_at, siigo_invoice_number, current_holder_role")
      .eq("customer_id", data.customer_id)
      .order("created_at", { ascending: false })
      .limit(100);

    // Facturas Siigo
    let invoices: CustomerInvoice[] = [];
    let siigoError: string | null = null;
    try {
      const resp = await SiigoClient.request<{ results?: SiigoInvoice[] }>({
        method: "GET",
        path: "/v1/invoices",
        query: {
          "customer_identification": customer.identification,
          page_size: 100,
          page: 1,
        },
      });
      const today = new Date(); today.setHours(0, 0, 0, 0);
      invoices = (resp.results ?? []).map((inv) => {
        const total = Number(inv.total ?? 0);
        const balance = Number(inv.balance ?? 0);
        const due = inv.due_date ? new Date(inv.due_date) : null;
        let status: "paid" | "pending" | "overdue" = "pending";
        if (balance <= 0.01) status = "paid";
        else if (due && due < today) status = "overdue";
        return {
          id: inv.id,
          number: inv.name ?? (inv.prefix || inv.number ? `${inv.prefix ?? ""}${inv.number ?? ""}` : inv.id),
          date: inv.date ?? null,
          due_date: inv.due_date ?? null,
          total,
          balance,
          status,
          pdf_url: inv.public_url ?? null,
        };
      });
    } catch (e) {
      siigoError = e instanceof Error ? e.message : String(e);
    }

    const summary = invoices.reduce(
      (acc, i) => {
        if (i.status === "paid") acc.paid += i.total;
        else if (i.status === "overdue") { acc.overdue += i.balance; acc.pending_total += i.balance; }
        else { acc.pending_not_due += i.balance; acc.pending_total += i.balance; }
        return acc;
      },
      { paid: 0, pending_total: 0, pending_not_due: 0, overdue: 0 },
    );

    return {
      customer: { id: customer.id, identification: customer.identification, display_name: customer.display_name },
      orders: orders ?? [],
      invoices,
      summary,
      siigoError,
    };
  });