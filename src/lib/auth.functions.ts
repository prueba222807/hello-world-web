import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";

export type AppRole = "admin" | "vendedor" | "facturacion" | "cartera" | "bodega" | "conductor";

export const ensureCurrentUserRole = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const claims = context.claims as {
      email?: string;
      user_metadata?: { full_name?: string; name?: string };
    };
    const email = claims.email ?? null;
    const fullName = claims.user_metadata?.full_name ?? claims.user_metadata?.name ?? "";

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: context.userId, email, full_name: fullName }, { onConflict: "id" });

    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);

    if (roles && roles.length > 0) {
      return { roles: roles.map((r) => r.role as AppRole) };
    }

    const { data: admin } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    const role: AppRole = admin ? "vendedor" : "admin";
    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role });
    if (insertError) throw new Error(insertError.message);

    return { roles: [role] };
  });
