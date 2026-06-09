// Eventos de cliente con geolocalización + foto.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";

export const listEventTypes = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin.from("event_types")
      .select("id, code, label, icon, active").eq("active", true).order("label");
    if (error) throw new Error(error.message);
    return { types: data ?? [] };
  });

export const upsertEventType = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid().optional(),
    code: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    icon: z.string().max(64).optional(),
    active: z.boolean().default(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ad } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!ad) throw new Response("Forbidden", { status: 403 });
    const payload = { code: data.code, label: data.label, icon: data.icon ?? null, active: data.active };
    const q = data.id
      ? supabaseAdmin.from("event_types").update(payload).eq("id", data.id)
      : supabaseAdmin.from("event_types").insert(payload);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createCustomerEvent = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    customer_id: z.string().uuid(),
    event_type: z.string().min(1).max(64),
    notes: z.string().max(2000).optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    accuracy: z.number().nullable().optional(),
    photo_url: z.string().url().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("customer_events").insert({
      customer_id: data.customer_id, created_by: context.userId,
      event_type: data.event_type, notes: data.notes ?? null,
      lat: data.lat ?? null, lng: data.lng ?? null, accuracy: data.accuracy ?? null,
      photo_url: data.photo_url ?? null,
    });
    if (error) throw new Error(error.message);
    // Cachear primer geo del cliente
    if (data.lat && data.lng) {
      const { data: c } = await supabaseAdmin.from("customers").select("geo_lat").eq("id", data.customer_id).maybeSingle();
      if (!c?.geo_lat) {
        await supabaseAdmin.from("customers").update({
          geo_lat: data.lat, geo_lng: data.lng, geo_captured_at: new Date().toISOString(),
        }).eq("id", data.customer_id);
      }
    }
    return { ok: true };
  });

export const listCustomerEvents = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ customer_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin.from("customer_events")
      .select("id, event_type, notes, lat, lng, accuracy, photo_url, created_at, created_by")
      .eq("customer_id", data.customer_id).order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return { events: rows ?? [] };
  });

// Subir evidencia (foto) — devuelve url pública del bucket "evidence"
export const uploadEvidence = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    file_base64: z.string().min(10),
    mime: z.string().default("image/jpeg"),
    folder: z.string().max(64).default("misc"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const buf = Buffer.from(data.file_base64, "base64");
    const ext = data.mime.includes("png") ? "png" : "jpg";
    const path = `${data.folder}/${context.userId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error } = await supabaseAdmin.storage.from("evidence").upload(path, buf, {
      contentType: data.mime, upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data: pub } = supabaseAdmin.storage.from("evidence").getPublicUrl(path);
    return { url: pub.publicUrl, path };
  });