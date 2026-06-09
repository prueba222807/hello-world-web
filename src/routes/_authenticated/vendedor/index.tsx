import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Plus, ListChecks } from "lucide-react";
export const Route = createFileRoute("/_authenticated/vendedor/")({ component: () => (
  <div className="p-4 space-y-4">
    <h1 className="text-xl font-bold">Bienvenido</h1>
    <Link to="/vendedor/nuevo"><Card className="p-5 flex items-center gap-3 hover:bg-accent/30 transition-colors"><div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground grid place-items-center"><Plus className="w-5 h-5" /></div><div><div className="font-medium">Nuevo pedido</div><div className="text-xs text-muted-foreground">Crea un pedido para un cliente</div></div></Card></Link>
    <Link to="/vendedor/pedidos"><Card className="p-5 flex items-center gap-3 hover:bg-accent/30 transition-colors"><div className="w-10 h-10 rounded-lg bg-secondary text-secondary-foreground grid place-items-center"><ListChecks className="w-5 h-5" /></div><div><div className="font-medium">Mis pedidos</div><div className="text-xs text-muted-foreground">Historial y estado</div></div></Card></Link>
  </div>
)});
