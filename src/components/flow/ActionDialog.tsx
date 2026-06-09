import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "./SignaturePad";
import { executeAction, uploadSignature } from "@/lib/orders/flow.functions";
import { listUsersByRole } from "@/lib/handoffs/handoffs.functions";
import { getGeo } from "@/lib/geo";
import { EvidenceCapture, clearEvidence } from "./EvidenceCapture";
import type { NextAction } from "@/lib/order-flow";

interface Props {
  orderId: string;
  action: NextAction | null;
  confirmationMode: "signature" | "acceptance";
  onClose: () => void;
  onDone: () => void;
}

export function ActionDialog({ orderId, action, confirmationMode, onClose, onDone }: Props) {
  const doExec = useServerFn(executeAction);
  const doSig = useServerFn(uploadSignature);
  const fetchUsers = useServerFn(listUsersByRole);
  const [busy, setBusy] = useState(false);
  const [receiverId, setReceiverId] = useState("");
  const [users, setUsers] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [observations, setObservations] = useState("");
  const [visibleDate, setVisibleDate] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [geo, setGeoState] = useState<{ lat: number | null; lng: number | null; accuracy: number | null }>({ lat: null, lng: null, accuracy: null });

  const open = !!action;
  const persistKey = action ? `evidence:flow:${orderId}:${action.key}` : "";

  useEffect(() => {
    if (!open) {
      setReceiverId(""); setUsers([]); setObservations(""); setVisibleDate("");
      setSignature(null); setPhotoUrls([]); setGeoState({ lat: null, lng: null, accuracy: null });
      return;
    }
    if (action?.receiverRole) {
      fetchUsers({ data: { role: action.receiverRole } }).then((r) => setUsers(r.users)).catch(() => setUsers([]));
    }
    if (action?.requiresGeo) {
      getGeo().then(setGeoState).catch(() => {});
    }
  }, [open, action, fetchUsers]);

  if (!action) return null;

  const needsSignature = confirmationMode === "signature" && action.needsReceiver;

  const submit = async () => {
    setBusy(true);
    try {
      if (action.needsReceiver && !receiverId) throw new Error("Selecciona el receptor");
      if (action.requiresGeo && (!geo.lat || !geo.lng)) {
        const g = await getGeo();
        if (!g.lat || !g.lng) throw new Error("Activa la geolocalización");
        setGeoState(g);
      }
      if (action.requiresPhoto && photoUrls.length === 0) throw new Error("Foto de evidencia requerida");

      let signature_url: string | undefined;
      if (needsSignature && signature) {
        const r = await doSig({ data: { data_url: signature, folder: "signatures" } });
        signature_url = r.url;
      }
      await doExec({ data: {
        order_id: orderId,
        action_key: action.key,
        receiver_id: receiverId || null,
        signature_url: signature_url ?? null,
        photo_urls: photoUrls,
        observations: observations || undefined,
        visible_date: visibleDate || undefined,
        lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy,
      } });
      if (persistKey) clearEvidence(persistKey);
      toast.success(confirmationMode === "acceptance" && action.needsReceiver ? "Transferencia enviada (pendiente aceptación)" : "Acción registrada");
      onDone(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{action.label}</DialogTitle>
          <DialogDescription>{action.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {action.needsReceiver && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Receptor ({action.receiverRole})</label>
              <Select value={receiverId} onValueChange={setReceiverId}>
                <SelectTrigger><SelectValue placeholder={users.length === 0 ? "Sin usuarios" : "Selecciona"} /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium">Observaciones</label>
            <Textarea rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Fecha visible (opcional)</label>
            <Input type="datetime-local" value={visibleDate} onChange={(e) => setVisibleDate(e.target.value)} />
          </div>
          {action.requiresPhoto && (
            <EvidenceCapture
              folder={`orders/${orderId}`}
              persistKey={persistKey}
              multiple
              required
              label="Foto evidencia"
              onChange={setPhotoUrls}
            />
          )}
          {action.requiresGeo && (
            <div className="text-xs flex items-center gap-1 text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {geo.lat ? `Geo: ${geo.lat.toFixed(5)}, ${geo.lng?.toFixed(5)}` : "Capturando ubicación…"}
            </div>
          )}
          {needsSignature && <SignaturePad onChange={setSignature} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}