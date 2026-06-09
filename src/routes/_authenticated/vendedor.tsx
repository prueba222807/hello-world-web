import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { VendedorLayout } from "@/components/vendedor-layout";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vendedor")({
  component: VendedorGuard,
});

function VendedorGuard() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && role === "admin") {
      // admin también puede usar vendedor; no redirigimos
    }
  }, [loading, role, navigate]);

  if (loading || !role) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  return <VendedorLayout />;
}
