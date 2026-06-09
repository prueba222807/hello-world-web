import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { respondTransfer } from "@/lib/orders/flow.functions";
import { getGeo } from "@/lib/geo";

export function AcceptRejectPanel({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const doRespond = useServerFn(respondTransfer);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (decision: "accept" | "reject") => {
    if (decision === "reject" && reason.trim().length < 3) return toast.error("Indica el motivo del rechazo");
    setBusy(true);
    try {
      const g = await getGeo().catch(() => ({ lat: null, lng: null, accuracy: null }));
      await doRespond({ data: { order_id: orderId, decision, reason: reason || undefined, lat: g.lat, lng: g.lng, accuracy: g.accuracy } });
      toast.success(decision === "accept" ? "Aceptado" : "Rechazado");
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setBusy(false);
  };

  return (
    <Card className="p-4 space-y-3 border-amber-500/50 bg-amber-500/5">
      <div className="font-medium">Transferencia pendiente de tu aceptación</div>
      <Textarea rows={2} placeholder="Motivo si rechazas…" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <Button onClick={() => run("accept")} disabled={busy} className="flex-1">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />} Aceptar
        </Button>
        <Button variant="outline" onClick={() => run("reject")} disabled={busy} className="flex-1">
          <X className="w-4 h-4 mr-1" /> Rechazar
        </Button>
      </div>
    </Card>
  );
}