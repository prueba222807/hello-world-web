// SiigoClient: cliente único server-only para la API de Siigo.
// Maneja autenticación, cache de token (en BD) y refresh automático.
//
// IMPORTANTE: solo se importa desde código server (*.functions.ts / *.server.ts).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret } from "@/lib/crypto.server";

const SIIGO_BASE_URL = "https://api.siigo.com";
const SIIGO_AUTH_URL = `${SIIGO_BASE_URL}/auth`;

interface SiigoConfigRow {
  id: string;
  username: string;
  access_key_encrypted: string;
  partner_id: string;
  is_active: boolean;
}

interface SiigoTokenRow {
  access_token: string;
  expires_at: string;
}

export interface SiigoRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

async function loadActiveConfig(): Promise<SiigoConfigRow> {
  const { data, error } = await supabaseAdmin
    .from("siigo_config")
    .select("id, username, access_key_encrypted, partner_id, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Siigo: error leyendo configuración: ${error.message}`);
  if (!data) throw new Error("Siigo no está configurado todavía. Ve a Configuración → Siigo.");
  return data as SiigoConfigRow;
}

async function getCachedToken(configId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("siigo_tokens")
    .select("access_token, expires_at")
    .eq("config_id", configId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as SiigoTokenRow;
  // Refresh proactivamente 5 minutos antes
  const expiresMs = new Date(row.expires_at).getTime() - Date.now();
  if (expiresMs <= 5 * 60 * 1000) return null;
  return row.access_token;
}

async function fetchNewToken(cfg: SiigoConfigRow): Promise<string> {
  const accessKey = decryptSecret(cfg.access_key_encrypted);
  const res = await fetch(SIIGO_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Partner-Id": cfg.partner_id,
    },
    body: JSON.stringify({ username: cfg.username, access_key: accessKey }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Siigo auth falló [${res.status}]: ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  if (!json.access_token) throw new Error("Siigo no devolvió access_token");

  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  await supabaseAdmin.from("siigo_tokens").insert({
    config_id: cfg.id,
    access_token: json.access_token,
    expires_at: expiresAt,
  });
  // Limpieza simple: borrar tokens viejos
  await supabaseAdmin
    .from("siigo_tokens")
    .delete()
    .eq("config_id", cfg.id)
    .lt("expires_at", new Date().toISOString());

  return json.access_token;
}

async function getToken(): Promise<{ token: string; cfg: SiigoConfigRow }> {
  const cfg = await loadActiveConfig();
  const cached = await getCachedToken(cfg.id);
  if (cached) return { token: cached, cfg };
  const fresh = await fetchNewToken(cfg);
  return { token: fresh, cfg };
}

export class SiigoApiError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message);
  }
}

export const SiigoClient = {
  /** Verifica que las credenciales actuales pueden autenticar contra Siigo. */
  async testConnection(username: string, accessKey: string, partnerId: string): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const res = await fetch(SIIGO_AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Partner-Id": partnerId },
        body: JSON.stringify({ username, access_key: accessKey }),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, message: `[${res.status}] ${text.slice(0, 250)}` };
      const json = JSON.parse(text);
      if (!json.access_token) return { ok: false, message: "Respuesta sin access_token" };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },

  /** Llamada genérica autenticada al API de Siigo. */
  async request<T = unknown>(opts: SiigoRequestOptions): Promise<T> {
    const { token, cfg } = await getToken();
    const url = new URL(SIIGO_BASE_URL + opts.path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Partner-Id": cfg.partner_id,
        "Content-Type": "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new SiigoApiError(res.status, `Siigo ${opts.method ?? "GET"} ${opts.path} falló`, text);
    }
    return text ? (JSON.parse(text) as T) : (undefined as T);
  },
};
