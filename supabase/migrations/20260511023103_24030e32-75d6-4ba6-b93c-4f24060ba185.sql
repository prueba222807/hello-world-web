
-- Crear el trigger faltante en auth.users que invoca handle_new_user()
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: crear profile + rol para usuarios existentes que no lo tengan
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- El primer usuario (más antiguo) sin rol → admin; el resto → vendedor
WITH ordered AS (
  SELECT u.id, ROW_NUMBER() OVER (ORDER BY u.created_at ASC) AS rn
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE ur.user_id IS NULL
), first_admin_exists AS (
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') AS has_admin
)
INSERT INTO public.user_roles (user_id, role)
SELECT o.id,
  CASE
    WHEN NOT (SELECT has_admin FROM first_admin_exists) AND o.rn = 1 THEN 'admin'::app_role
    ELSE 'vendedor'::app_role
  END
FROM ordered o;
