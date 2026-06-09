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

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: role === "admin" ? "/admin" : "/vendedor" });
    }
  }, [loading, session, role, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6,8}$/.test(code)) {
      toast.error("El código debe tener entre 6 y 8 dígitos");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: code,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cuenta creada. Revisa tu correo si necesitas confirmar.");
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
          <h2 className="text-3xl font-bold mb-3">Crea tu cuenta</h2>
          <p className="text-primary-foreground/80">
            El primer usuario en registrarse será el administrador del sistema.
          </p>
        </div>
        <div className="text-xs text-primary-foreground/60">© ConTaxes</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Crear cuenta</h1>
            <p className="text-sm text-muted-foreground">Empieza a usar ConTaxes Sales App.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre completo</Label>
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Código de acceso (6-8 dígitos)</Label>
              <Input
                id="code"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creando…" : "Crear cuenta"}
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
            ¿Ya tienes cuenta? <Link to="/login" className="text-primary font-medium hover:underline">Iniciar sesión</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
