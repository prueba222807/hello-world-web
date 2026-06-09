import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/vendedor/perfil")({ component: Perfil });
function Perfil() {
  const { user, role, signOut } = useAuth();
  const nav = useNavigate();
  return (
    <div className="p-4 space-y-4">
      <Card className="p-5">
        <h1 className="text-lg font-bold mb-1">Perfil</h1>
        <div className="text-sm text-muted-foreground">{user?.email}</div>
        <div className="text-xs text-muted-foreground mt-1">Rol: {role}</div>
      </Card>
      <Button variant="outline" className="w-full" onClick={async () => { await signOut(); nav({ to: "/login" }); }}>Cerrar sesión</Button>
    </div>
  );
}
