// Server functions de ajustes globales (admin).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";
import { SiigoClient } from "@/lib/siigo/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const getAppSettings = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("max_discount_pct, default_invoice_note, default_document_id")
      .limit(1)
      .maybeSingle();
    return {
      max_discount_pct: Number(data?.max_discount_pct ?? 0),
      default_invoice_note: (data?.default_invoice_note ?? "") as string,
      default_document_id: (data?.default_document_id ?? null) as number | null,
    };
  });

export const updateAppSettings = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    max_discount_pct: z.number().min(0).max(100),
    default_invoice_note: z.string().trim().max(2000).nullable().optional(),
    default_document_id: z.number().int().positive().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = {
      singleton: true,
      max_discount_pct: data.max_discount_pct,
      default_invoice_note: data.default_invoice_note ?? null,
      default_document_id: data.default_document_id ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: existing } = await supabaseAdmin
      .from("app_settings").select("id").limit(1).maybeSingle();
    if (existing?.id) {
      const { error } = await supabaseAdmin.from("app_settings").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("app_settings").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Siigo Document Types catalog ----------

export const listDocumentTypes = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("siigo_document_types")
      .select("siigo_id, code, name, description, type, active, raw")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const document_types = (data ?? []).map((d) => {
      const raw = (d.raw ?? {}) as Record<string, unknown>;
      return {
        siigo_id: d.siigo_id,
        code: d.code,
        name: d.name,
        description: d.description,
        type: d.type,
        active: d.active,
        automatic_number: Boolean(raw.automatic_number),
        electronic_type: (raw.electronic_type ?? null) as string | null,
      };
    });
    return { document_types };
  });

interface SiigoDocType {
  id: number;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  type?: string | null;
  active?: boolean;
}

export const syncDocumentTypes = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const docs = await SiigoClient.request<SiigoDocType[]>({
      method: "GET", path: "/v1/document-types", query: { type: "FV" },
    });
    if (!Array.isArray(docs)) throw new Error("Respuesta inválida de Siigo");
    let inserted = 0;
    for (const d of docs) {
      if (!d?.id) continue;
      const { error } = await supabaseAdmin.from("siigo_document_types").upsert({
        siigo_id: d.id,
        code: d.code ?? null,
        name: d.name ?? `Documento ${d.id}`,
        description: d.description ?? null,
        type: d.type ?? "FV",
        active: d.active ?? true,
        raw: d as unknown as never,
      }, { onConflict: "siigo_id" });
      if (!error) inserted += 1;
    }
    return { ok: true, total: docs.length, inserted };
  });
