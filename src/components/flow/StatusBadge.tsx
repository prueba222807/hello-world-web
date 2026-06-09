import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/order-flow";
import { cn } from "@/lib/utils";

const V: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  confirmed: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  invoiced: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  in_warehouse: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  in_transit: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  delivered: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  returned_to_billing: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  with_collections: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
  finalized: "bg-emerald-600/20 text-emerald-800 border-emerald-600/40",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  voided: "bg-destructive/15 text-destructive border-destructive/30",
  pending_acceptance: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn("border", V[status] ?? "bg-muted text-muted-foreground")}>{STATUS_LABELS[status] ?? status}</Badge>;
}