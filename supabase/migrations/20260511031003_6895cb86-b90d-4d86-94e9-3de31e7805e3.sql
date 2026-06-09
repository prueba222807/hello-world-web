
-- sellers
CREATE TABLE public.sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siigo_user_id TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  identification TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY sellers_select_authenticated ON public.sellers FOR SELECT TO authenticated USING (true);
CREATE TRIGGER sellers_updated_at BEFORE UPDATE ON public.sellers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- payment_methods
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siigo_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_select_authenticated ON public.payment_methods FOR SELECT TO authenticated USING (true);
CREATE TRIGGER pm_updated_at BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- app_settings singleton
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT true UNIQUE,
  max_discount_pct NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_select_auth ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_admin_write ON public.app_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.app_settings (max_discount_pct) VALUES (0);

-- customers.seller_siigo_id
ALTER TABLE public.customers ADD COLUMN seller_siigo_id TEXT;

-- orders nuevas columnas
ALTER TABLE public.orders
  ADD COLUMN payment_method_id UUID,
  ADD COLUMN delivery_date DATE,
  ADD COLUMN invoice_pdf_url TEXT,
  ADD COLUMN invoiced_at TIMESTAMPTZ,
  ADD COLUMN dispatched_at TIMESTAMPTZ;

-- order_items.is_gift
ALTER TABLE public.order_items ADD COLUMN is_gift BOOLEAN NOT NULL DEFAULT false;

-- Policies ampliadas: pending también es editable
DROP POLICY IF EXISTS "orders update own draft or admin" ON public.orders;
CREATE POLICY "orders update own editable or admin" ON public.orders
FOR UPDATE TO authenticated
USING (((seller_id = auth.uid()) AND status IN ('draft'::order_status,'pending'::order_status)) OR has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "orders delete own draft or admin" ON public.orders;
CREATE POLICY "orders delete own editable or admin" ON public.orders
FOR DELETE TO authenticated
USING (((seller_id = auth.uid()) AND status IN ('draft'::order_status,'pending'::order_status)) OR has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "order_items insert via parent draft" ON public.order_items;
CREATE POLICY "order_items insert via parent editable" ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id
  AND (((o.seller_id = auth.uid()) AND o.status IN ('draft'::order_status,'pending'::order_status)) OR has_role(auth.uid(),'admin'))));

DROP POLICY IF EXISTS "order_items update via parent draft" ON public.order_items;
CREATE POLICY "order_items update via parent editable" ON public.order_items
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id
  AND (((o.seller_id = auth.uid()) AND o.status IN ('draft'::order_status,'pending'::order_status)) OR has_role(auth.uid(),'admin'))));

DROP POLICY IF EXISTS "order_items delete via parent draft" ON public.order_items;
CREATE POLICY "order_items delete via parent editable" ON public.order_items
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id
  AND (((o.seller_id = auth.uid()) AND o.status IN ('draft'::order_status,'pending'::order_status)) OR has_role(auth.uid(),'admin'))));
