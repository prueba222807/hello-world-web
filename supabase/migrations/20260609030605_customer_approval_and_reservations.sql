-- Aprobación de terceros antes de crear en Siigo + vista de inventario reservado.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz;

UPDATE public.customers SET approval_status = 'approved' WHERE approval_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_approval_status ON public.customers(approval_status);

-- Vista de stock reservado: pedidos confirmados aún no facturados.
CREATE OR REPLACE VIEW public.product_reservations AS
SELECT
  oi.product_id,
  COALESCE(SUM(oi.quantity), 0)::numeric AS reserved_qty
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE o.status = 'confirmed'
GROUP BY oi.product_id;

GRANT SELECT ON public.product_reservations TO authenticated;
GRANT SELECT ON public.product_reservations TO service_role;
