
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_id_fkey
  FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS visible_to_sellers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_name text;

CREATE POLICY pm_admin_update ON public.payment_methods
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS siigo_invoice_prefix text,
  ADD COLUMN IF NOT EXISTS siigo_invoice_consecutive integer;
