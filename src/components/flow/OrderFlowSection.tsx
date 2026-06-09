import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, GitBranch, Play } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { confirmOrderFlow, getFlowSettings, listTimeline } from "@/lib/orders/flow.functions";
import { getAvailableActions, type AppRole, type NextAction } from "@/lib/order-flow";
import { ActionDialog } from "./ActionDialog";
import { AcceptRejectPanel } from "./AcceptRejectPanel";
import { FlowTimeline } from "./FlowTimeline";
import { StatusBadge } from "./StatusBadge";
import { getGeo } from "@/lib/geo";

interface Props {
  orderId: string;
  status: string;
  pendingHolderUser: string | null;
  sellerId: string;
  confirmedAt: string | null;
  onChange: () => void;
}

export function OrderFlowSection({ orderId, status, pendingHolderUser, sellerId, confirmedAt, onChange }: Props) {
  const { user, roles } = useAuth();
  const fetchTimeline = useServerFn(listTimeline);
  const fetchSettings = useServerFn(getFlowSettings);
  const doConfirm = useServerFn(confirmOrderFlow);

  const [tl, setTl] = useState<{ events: Parameters<typeof FlowTimeline>[0]["events"]; evidences: Parameters<typeof FlowTimeline>[0]["evidences"]; profiles: Parameters<typeof FlowTimeline>[0]["profiles"] }>({ events: [], evidences: [], profiles: {} });
  const [mode, setMode] = useState<"signature" | "acceptance">("acceptance");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openAction, setOpenAction] = useState<NextAction | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchTimeline({ data: { order_id: orderId } }),
      fetchSettings({}),
    ]).then(([t, s]) => {
      setTl({
        events: t.events as typeof tl.events,
        evidences: t.evidences as typeof tl.evidences,
        profiles: t.profiles as typeof tl.profiles,
      });
      setMode(s.confirmation_mode);
    }).catch(() => {}).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const myRoles = (roles ?? []) as AppRole[];
  const isSeller = user?.id === sellerId;
  const isAdmin = myRoles.includes("admin");
  const isPendingForMe = status === "pending_acceptance" && pendingHolderUser === user?.id;
  const actions = getAvailableActions(status, myRoles);
  const canConfirm = !confirmedAt && (isSeller || isAdmin) && ["draft", "pending"].includes(status);

  const confirm = async () => {
    setBusy(true);
    try {
      const g = await getGeo().catch(() => ({ lat: null, lng: null, accuracy: null }));
      await doConfirm({ data: { order_id: orderId, lat: g.lat, lng: g.lng, accuracy: g.accuracy } });
      toast.success("Pedido confirmado, entra al flujo");
      onChange(); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setBusy(false);
  };

  const reload = () => { load(); onChange(); };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4" />
        <div className="font-medium">Trazabilidad</div>
        <div className="ml-auto"><StatusBadge status={status} /></div>
      </div>

      {canConfirm && (
        <Button onClick={confirm} disabled={busy} size="sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
          Confirmar pedido y enviar al flujo
        </Button>
      )}

      {isPendingForMe && <AcceptRejectPanel orderId={orderId} onDone={reload} />}

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.key} size="sm" variant="outline" onClick={() => setOpenAction(a)}>{a.shortLabel}</Button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <FlowTimeline
          events={tl.events}
          evidences={tl.evidences}
          profiles={tl.profiles}
          viewerRoles={myRoles}
          viewerId={user?.id ?? null}
        />
      )}

      <ActionDialog
        orderId={orderId}
        action={openAction}
        confirmationMode={mode}
        onClose={() => setOpenAction(null)}
        onDone={reload}
      />
    </Card>
  );
}