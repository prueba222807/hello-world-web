
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_override numeric NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_by_user uuid NULL;
CREATE INDEX IF NOT EXISTS customers_created_by_user_idx ON public.customers(created_by_user);

-- Permitir insert/update de clientes desde server functions (usan supabaseAdmin que bypassa RLS,
-- pero añadimos policies para que vendedores autenticados puedan crear/editar localmente sus clientes
-- en caso de uso futuro vía cliente).
CREATE POLICY "customers_insert_authenticated" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (created_by_user = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin'::app_role,'facturacion'::app_role]));

CREATE POLICY "customers_update_creator_or_staff" ON public.customers
  FOR UPDATE TO authenticated
  USING (created_by_user = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin'::app_role,'facturacion'::app_role]))
  WITH CHECK (created_by_user = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin'::app_role,'facturacion'::app_role]));

-- Admin puede actualizar productos (para ajustar stock_override).
CREATE POLICY "products_update_admin" ON public.products
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
