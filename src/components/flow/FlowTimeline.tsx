import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EVENT_LABELS, ROLE_LABELS, formatDateTime, type AppRole, type OrderEventType } from "@/lib/order-flow";
import { canSeeEvidence } from "@/lib/order-visibility";
import { MapPin, ImageIcon, PenLine, EyeOff } from "lucide-react";

interface Evt {
  id: string; event_type: string; from_status: string | null; to_status: string;
  actor_id: string; actor_role: string; receiver_id: string | null; receiver_role: string | null;
  signature_url: string | null; observations: string | null;
  event_at: string; visible_date: string | null;
  lat: number | null; lng: number | null;
}
interface Evi { id: string; event_id: string; file_url: string; }
type Profile = { id: string; full_name: string | null; email: string | null };

export function FlowTimeline({
  events, evidences, profiles, viewerRoles = [], viewerId = null,
}: {
  events: Evt[]; evidences: Evi[]; profiles: Record<string, Profile>;
  viewerRoles?: AppRole[]; viewerId?: string | null;
}) {
  if (events.length === 0) return <div className="text-sm text-muted-foreground">Sin eventos aún.</div>;
  const evByEvent = evidences.reduce<Record<string, Evi[]>>((acc, e) => {
    (acc[e.event_id] ??= []).push(e); return acc;
  }, {});
  return (
    <ol className="relative border-l-2 ml-2 space-y-4">
      {events.map((e) => {
        const actor = profiles[e.actor_id];
        const receiver = e.receiver_id ? profiles[e.receiver_id] : null;
        const evs = evByEvent[e.id] ?? [];
        const showMedia = canSeeEvidence(e.event_type, e.actor_id, e.receiver_id, viewerRoles, viewerId);
        return (
          <li key={e.id} className="pl-4 relative">
            <span className="absolute -left-[7px] top-2 w-3 h-3 rounded-full bg-primary" />
            <Card className="p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm">{EVENT_LABELS[e.event_type as OrderEventType] ?? e.event_type}</div>
                <Badge variant="outline" className="text-[10px]">{e.to_status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDateTime(e.event_at)}
                {e.visible_date && ` · visible ${formatDateTime(e.visible_date)}`}
              </div>
              <div className="text-xs">
                <span className="font-medium">{actor?.full_name || actor?.email || "—"}</span> ({ROLE_LABELS[e.actor_role as keyof typeof ROLE_LABELS] ?? e.actor_role})
                {receiver && <> → <span className="font-medium">{receiver.full_name || receiver.email}</span></>}
              </div>
              {e.observations && <div className="text-xs italic">"{e.observations}"</div>}
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {showMedia && e.signature_url && (
                  <a href={e.signature_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <PenLine className="w-3 h-3" /> Firma
                  </a>
                )}
                {showMedia && e.lat && e.lng && (
                  <a href={`https://maps.google.com/?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <MapPin className="w-3 h-3" /> Mapa
                  </a>
                )}
                {showMedia && evs.map((ev) => (
                  <a key={ev.id} href={ev.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ImageIcon className="w-3 h-3" /> Foto
                  </a>
                ))}
                {!showMedia && (e.signature_url || (e.lat && e.lng) || evs.length > 0) && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <EyeOff className="w-3 h-3" /> Evidencia restringida
                  </span>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}