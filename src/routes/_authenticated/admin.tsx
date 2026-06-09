import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AdminLayout } from "@/components/admin-layout";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminGuard,
});

function AdminGuard() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && role && role !== "admin") {
      navigate({ to: "/vendedor", replace: true });
    }
  }, [loading, role, navigate]);

  if (loading || !role) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (role !== "admin") return null;
  return <AdminLayout />;
}
