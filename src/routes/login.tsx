import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      const target = role === "admin" ? "/admin" : "/vendedor";
      navigate({ to: target });
    }
  }, [loading, session, role, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(code)) {
      toast.error("El código debe tener entre 4 y 8 dígitos");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: code });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bienvenido");
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error(result.error.message ?? "Error con Google");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div
        className="hidden lg:flex flex-col justify-between p-10 text-primary-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="flex items-center gap-2">
          <div className="grid place-items-center w-9 h-9 rounded-lg bg-white/10">
            <Building2 className="w-5 h-5" />
          </div>
          <span className="font-semibold">ConTaxes Sales App</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold mb-3">Tu operación comercial, ordenada.</h2>
          <p className="text-primary-foreground/80">
            Pedidos, clientes y facturación electrónica con Siigo, en una sola plataforma.
          </p>
        </div>
        <div className="text-xs text-primary-foreground/60">© ConTaxes</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Iniciar sesión</h1>
            <p className="text-sm text-muted-foreground">Accede a tu panel.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Código de acceso</Label>
              <Input
                id="code"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                required
                minLength={4}
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
              />
              <p className="text-xs text-muted-foreground">Solo números. Código por defecto: <span className="font-medium">123456</span></p>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">o</span></div>
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            Continuar con Google
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            ¿No tienes cuenta? <Link to="/signup" className="text-primary font-medium hover:underline">Crear cuenta</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
