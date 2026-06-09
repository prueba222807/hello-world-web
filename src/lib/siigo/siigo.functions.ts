// Server functions para configuración de Siigo y verificación de conexión.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptSecret } from "@/lib/crypto.server";
import { SiigoClient } from "@/lib/siigo/client.server";
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

const SaveSchema = z.object({
  username: z.string().trim().min(3).max(255),
  access_key: z.string().trim().min(10).max(2000),
  partner_id: z.string().trim().min(1).max(100).default("ConTaxesSalesApp"),
});

export const saveSiigoConfig = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Probar antes de guardar
    const test = await SiigoClient.testConnection(data.username, data.access_key, data.partner_id);
    if (!test.ok) {
      return { ok: false as const, message: test.message };
    }

    // Desactivar configs previas y guardar la nueva
    await supabaseAdmin.from("siigo_config").update({ is_active: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabaseAdmin.from("siigo_config").insert({
      username: data.username,
      access_key_encrypted: encryptSecret(data.access_key),
      partner_id: data.partner_id,
      is_active: true,
      last_test_at: new Date().toISOString(),
      last_test_ok: true,
      last_test_message: "Conexión verificada",
    });
    if (error) throw new Error(error.message);

    return { ok: true as const, message: "Configuración guardada y verificada" };
  });

export const getSiigoStatus = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("siigo_config")
      .select("username, partner_id, is_active, last_test_at, last_test_ok, last_test_message, updated_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { config: data ?? null };
  });

export const testSiigoConnection = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    try {
      // Intenta una llamada real con la config activa
      await SiigoClient.request({ method: "GET", path: "/v1/users", query: { page: 1, page_size: 1 } });
      await supabaseAdmin
        .from("siigo_config")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: true,
          last_test_message: "OK",
        })
        .eq("is_active", true);
      return { ok: true as const };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("siigo_config")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: false,
          last_test_message: message.slice(0, 500),
        })
        .eq("is_active", true);
      return { ok: false as const, message };
    }
  });
