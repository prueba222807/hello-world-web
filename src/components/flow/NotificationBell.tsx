import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime } from "@/lib/order-flow";

type Notif = { id: string; type: string; title: string; body: string | null; order_id: string | null; read_at: string | null; created_at: string };

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.from("notifications").select("*")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
      if (mounted) setItems((data ?? []) as Notif[]);
    };
    load();
    const ch = supabase.channel(`notif-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (p) => setItems((prev) => [p.new as Notif, ...prev].slice(0, 20)))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [user]);

  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id).is("read_at", null);
    setItems((prev) => prev.map((n) => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] grid place-items-center">{unread}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 max-h-96 overflow-y-auto">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-medium text-sm">Notificaciones</div>
          {unread > 0 && <button onClick={markAllRead} className="text-xs text-primary hover:underline">Marcar leídas</button>}
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Sin notificaciones</div>
        ) : (
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id} className={n.read_at ? "" : "bg-primary/5"}>
                {n.order_id ? (
                  <Link to="/pedidos/$id" params={{ id: n.order_id }} className="block p-3 hover:bg-accent">
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.created_at)}</div>
                  </Link>
                ) : (
                  <div className="p-3">
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}