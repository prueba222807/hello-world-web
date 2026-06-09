import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Building2, ShieldCheck, Zap, Smartphone } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center w-9 h-9 rounded-lg text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold leading-tight">ConTaxes</div>
              <div className="text-xs text-muted-foreground">Sales App</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost">Iniciar sesión</Button></Link>
            <Link to="/signup"><Button>Crear cuenta</Button></Link>
          </div>
        </div>
      </header>

      <section
        className="text-primary-foreground"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="container mx-auto px-4 py-20 md:py-28 max-w-4xl text-center">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-white/10 backdrop-blur mb-6">
            ERP comercial · Integración directa con Siigo
          </span>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Vende, factura y controla tu operación desde un solo lugar
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Panel administrativo y app móvil para vendedores en campo. Pedidos, clientes y facturas
            electrónicas sincronizados automáticamente con Siigo.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup"><Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">Empezar ahora</Button></Link>
            <Link to="/login"><Button size="lg" variant="outline" className="bg-white/10 border-white/30 text-primary-foreground hover:bg-white/20">Ya tengo cuenta</Button></Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Zap, title: "Facturación automática", desc: "Convierte un pedido en una factura electrónica de Siigo con un clic." },
            { icon: Smartphone, title: "App para vendedores", desc: "Crea pedidos en campo desde el celular, incluso sin conexión." },
            { icon: ShieldCheck, title: "Seguro por diseño", desc: "Credenciales cifradas, control de roles y políticas de acceso por usuario." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border bg-card p-6" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center mb-4">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} ConTaxes Sales App
      </footer>
    </div>
  );
}
