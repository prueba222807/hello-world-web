import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { attachAuthHeader } from "@/lib/auth-client-middleware";

async function assertAdmin(uid: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const setSellerSequence = createServerFn({ method: "POST" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    user_id: z.string().uuid(),
    prefix: z.string().max(20).default(""),
    next_consecutive: z.number().int().min(1).default(1),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("seller_sequences").upsert({
      user_id: data.user_id, prefix: data.prefix, next_consecutive: data.next_consecutive,
    }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSellerSequences = createServerFn({ method: "GET" })
  .middleware([attachAuthHeader, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin.from("seller_sequences")
      .select("user_id, prefix, next_consecutive, updated_at");
    if (error) throw new Error(error.message);
    return { sequences: data ?? [] };
  });