// Helper para obtener geolocalización del navegador (best effort, sin bloquear).
export type Geo = { lat: number | null; lng: number | null; accuracy: number | null };

export async function getGeo(timeoutMs = 6000): Promise<Geo> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { lat: null, lng: null, accuracy: null };
  }
  return new Promise<Geo>((resolve) => {
    let done = false;
    const finish = (g: Geo) => { if (!done) { done = true; resolve(g); } };
    const t = setTimeout(() => finish({ lat: null, lng: null, accuracy: null }), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(t);
        finish({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
      },
      () => { clearTimeout(t); finish({ lat: null, lng: null, accuracy: null }); },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: timeoutMs },
    );
  });
}

export async function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa es válido en navegador
  const base64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return { base64, mime: file.type || "image/jpeg" };
}