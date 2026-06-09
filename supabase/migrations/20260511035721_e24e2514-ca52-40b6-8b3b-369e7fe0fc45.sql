
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = ANY(_roles)
  )
$$;

ALTER TABLE public.sellers ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE;

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS is_credit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_days_options jsonb NOT NULL DEFAULT '[15,30,45,60,90]'::jsonb;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS credit_days int,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS has_manual_price boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_price_acknowledged boolean NOT NULL DEFAULT false;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS manual_total numeric;

DROP POLICY IF EXISTS "orders select own or admin" ON public.orders;
CREATE POLICY "orders select own or staff" ON public.orders
  FOR SELECT TO authenticated
  USING (
    seller_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin','facturacion','cartera','bodega','conductor']::app_role[])
  );

DROP POLICY IF EXISTS "order_items select via parent" ON public.order_items;
CREATE POLICY "order_items select via parent" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.seller_id = auth.uid()
        OR public.has_any_role(auth.uid(), ARRAY['admin','facturacion','cartera','bodega','conductor']::app_role[])
      )
  ));
