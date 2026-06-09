
-- Estado de pedido
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('draft','confirmed','sent_to_siigo','invoiced','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  status public.order_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  siigo_invoice_id TEXT,
  siigo_invoice_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_seller_idx ON public.orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders(customer_id);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  discount NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= 100),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items(order_id);

-- Triggers updated_at
DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Orders policies
DROP POLICY IF EXISTS "orders select own or admin" ON public.orders;
CREATE POLICY "orders select own or admin" ON public.orders FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "orders insert own" ON public.orders;
CREATE POLICY "orders insert own" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "orders update own draft or admin" ON public.orders;
CREATE POLICY "orders update own draft or admin" ON public.orders FOR UPDATE TO authenticated
  USING (
    (seller_id = auth.uid() AND status = 'draft') OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "orders delete own draft or admin" ON public.orders;
CREATE POLICY "orders delete own draft or admin" ON public.orders FOR DELETE TO authenticated
  USING (
    (seller_id = auth.uid() AND status = 'draft') OR public.has_role(auth.uid(), 'admin')
  );

-- Order items policies (basadas en el pedido padre)
DROP POLICY IF EXISTS "order_items select via parent" ON public.order_items;
CREATE POLICY "order_items select via parent" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (o.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

DROP POLICY IF EXISTS "order_items insert via parent draft" ON public.order_items;
CREATE POLICY "order_items insert via parent draft" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND ((o.seller_id = auth.uid() AND o.status = 'draft') OR public.has_role(auth.uid(), 'admin'))
  ));

DROP POLICY IF EXISTS "order_items update via parent draft" ON public.order_items;
CREATE POLICY "order_items update via parent draft" ON public.order_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND ((o.seller_id = auth.uid() AND o.status = 'draft') OR public.has_role(auth.uid(), 'admin'))
  ));

DROP POLICY IF EXISTS "order_items delete via parent draft" ON public.order_items;
CREATE POLICY "order_items delete via parent draft" ON public.order_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND ((o.seller_id = auth.uid() AND o.status = 'draft') OR public.has_role(auth.uid(), 'admin'))
  ));
