import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users, Shield, Save, Link2 } from "lucide-react";
import { toast } from "sonner";
import { listUsers, setUserRoles, linkUserToSeller } from "@/lib/admin/admin.functions";
import { listSellers } from "@/lib/catalog/catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: UsuariosPage,
});

const ROLES = ["admin", "facturacion", "cartera", "vendedor", "bodega", "conductor"] as const;
type Role = typeof ROLES[number];

type LinkedSeller = { id: string; siigo_user_id: string; name: string };
type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  roles: Role[];
  linked_seller: LinkedSeller | null;
  created_at: string;
};

type Seller = { id: string; siigo_user_id: string; first_name: string | null; last_name: string | null; email: string | null };

function UsuariosPage() {
  const { user } = useAuth();
  const fetchUsers = useServerFn(listUsers);
  const fetchSellers = useServerFn(listSellers);
  const saveRoles = useServerFn(setUserRoles);
  const linkSeller = useServerFn(linkUserToSeller);

  const [rows, setRows] = useState<UserRow[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, Set<Role>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([fetchUsers({}), fetchSellers({})]);
      setRows(u.users as UserRow[]);
      setSellers(s.sellers as Seller[]);
      const map: Record<string, Set<Role>> = {};
      (u.users as UserRow[]).forEach((row) => { map[row.id] = new Set(row.roles); });
      setEdits(map);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = (uid: string, role: Role) => {
    setEdits((prev) => {
      const set = new Set(prev[uid] ?? []);
      if (set.has(role)) set.delete(role); else set.add(role);
      return { ...prev, [uid]: set };
    });
  };

  const save = async (uid: string) => {
    setSavingId(uid);
    try {
      const roles = Array.from(edits[uid] ?? []);
      await saveRoles({ data: { user_id: uid, roles } });
      toast.success("Roles actualizados");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    setSavingId(null);
  };

  const handleLink = async (uid: string, sellerId: string) => {
    try {
      await linkSeller({ data: { user_id: uid, seller_id: sellerId === "__none__" ? null : sellerId } });
      toast.success("Vendedor Siigo vinculado");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  };

  if (loading) {
    return <div className="grid place-items-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  // Sellers ya vinculados (excluyendo el actual del usuario en cuestión)
  const availableSellers = (currentSellerId?: string) =>
    sellers.filter((s) => !rows.some((r) => r.linked_seller?.id === s.id && s.id !== currentSellerId));

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5" />
        <h1 className="text-2xl font-bold">Usuarios, roles y vendedores</h1>
      </div>
      <div className="space-y-3">
        {rows.map((u) => {
          const set = edits[u.id] ?? new Set();
          const dirty = JSON.stringify([...set].sort()) !== JSON.stringify([...u.roles].sort());
          const isSelf = u.id === user?.id;
          return (
            <Card key={u.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.full_name || u.email}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {set.has("admin") && <Badge className="bg-primary/15 text-primary border-primary/30"><Shield className="w-3 h-3 mr-1" />Admin</Badge>}
                  {u.linked_seller && <Badge variant="outline"><Link2 className="w-3 h-3 mr-1" />{u.linked_seller.name}</Badge>}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium mb-2 text-muted-foreground">Roles</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={set.has(r)}
                        disabled={isSelf && r === "admin"}
                        onCheckedChange={() => toggle(u.id, r)}
                      />
                      <span className="capitalize">{r}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
                <div>
                  <div className="text-xs font-medium mb-1 text-muted-foreground">Vendedor de Siigo vinculado</div>
                  <Select
                    value={u.linked_seller?.id ?? "__none__"}
                    onValueChange={(v) => handleLink(u.id, v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sin vincular —</SelectItem>
                      {availableSellers(u.linked_seller?.id).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {[s.first_name, s.last_name].filter(Boolean).join(" ") || s.email || s.siigo_user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => save(u.id)} disabled={!dirty || savingId === u.id}>
                  {savingId === u.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar roles
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
