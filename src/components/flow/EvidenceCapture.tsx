import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { uploadEvidence } from "@/lib/customers/events.functions";
import { fileToBase64 } from "@/lib/geo";

interface Props {
  folder: string;
  /** clave única para persistir URLs en sessionStorage (sobrevive al "reload" del WebView al volver de la cámara) */
  persistKey: string;
  multiple?: boolean;
  required?: boolean;
  label?: string;
  onChange: (urls: string[]) => void;
}

/**
 * Captura de evidencia robusta para móvil:
 *  - Sube la foto inmediatamente al elegirla (no guarda File en estado).
 *  - Persiste las URLs en sessionStorage por `persistKey`, así si el OS
 *    recicla el WebView al volver de la cámara, la evidencia se rehidrata.
 *  - El consumidor llama a `clearEvidence(persistKey)` tras el envío exitoso.
 */
export function EvidenceCapture({ folder, persistKey, multiple, required, label, onChange }: Props) {
  const doUpload = useServerFn(uploadEvidence);
  const inputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(sessionStorage.getItem(persistKey) ?? "[]"); } catch { return []; }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => { onChange(urls); }, [urls]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (urls.length) sessionStorage.setItem(persistKey, JSON.stringify(urls));
    else sessionStorage.removeItem(persistKey);
  }, [urls, persistKey]);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      const out: string[] = [];
      for (const f of files) {
        const { base64, mime } = await fileToBase64(f);
        const r = await doUpload({ data: { file_base64: base64, mime, folder } });
        out.push(r.url);
      }
      setUrls((prev) => (multiple ? [...prev, ...out] : out));
      toast.success(out.length > 1 ? `${out.length} fotos subidas` : "Foto lista");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      {label !== undefined && (
        <div className="text-xs font-medium flex items-center gap-1">
          <Camera className="w-3 h-3" /> {label}{required ? " *" : ""}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        onChange={handle}
        className="hidden"
      />
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border bg-card hover:bg-accent disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          {urls.length === 0 ? "Tomar foto" : multiple ? "Agregar otra" : "Reemplazar"}
        </button>
        {urls.map((u) => (
          <div key={u} className="relative">
            <a href={u} target="_blank" rel="noreferrer">
              <img src={u} alt="evidencia" className="w-14 h-14 object-cover rounded border" />
            </a>
            <button
              type="button"
              onClick={() => setUrls((p) => p.filter((x) => x !== u))}
              aria-label="Quitar"
              className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      {required && urls.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Evidencia obligatoria.</p>
      )}
    </div>
  );
}

export function clearEvidence(persistKey: string) {
  if (typeof window !== "undefined") sessionStorage.removeItem(persistKey);
}