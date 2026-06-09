
-- ============ FASE A: Modelo del flujo de trazabilidad ============

-- 1) Extender enum de estados (idempotente)
DO $$ BEGIN
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_billing';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_warehouse';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_driver';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_billing_return';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'returned_to_billing';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_collections';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'finalized';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'rejected';
  ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending_acceptance';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2) Enum de eventos del flujo
DO $$ BEGIN
  CREATE TYPE public.order_event_type AS ENUM (
    'confirmation',
    'bill_to_warehouse',
    'warehouse_receives',
    'warehouse_to_driver',
    'driver_receives',
    'driver_delivers_customer',
    'warehouse_delivers_customer',
    'driver_returns_billing',
    'billing_receives_return',
    'billing_to_collections',
    'collections_receives',
    'transfer_pending',
    'transfer_accepted',
    'transfer_rejected',
    'admin_edit'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Campos extra en orders para flujo de aceptación
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pending_status order_status,
  ADD COLUMN IF NOT EXISTS pending_holder_user uuid,
  ADD COLUMN IF NOT EXISTS pending_holder_role app_role,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

-- 4) Tabla order_events (timeline)
CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type order_event_type NOT NULL,
  from_status order_status,
  to_status order_status NOT NULL,
  actor_id uuid NOT NULL,
  actor_role app_role NOT NULL,
  receiver_id uuid,
  receiver_role app_role,
  signature_url text,
  observations text,
  visible_date timestamptz,
  lat numeric,
  lng numeric,
  accuracy numeric,
  event_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON public.order_events(order_id, event_at);
CREATE INDEX IF NOT EXISTS idx_order_events_receiver ON public.order_events(receiver_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY oe_select ON public.order_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o WHERE o.id = order_events.order_id
        AND (o.seller_id = auth.uid()
             OR has_any_role(auth.uid(), ARRAY['admin','facturacion','cartera','bodega','conductor']::app_role[]))
    )
  );
CREATE POLICY oe_insert ON public.order_events FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
CREATE POLICY oe_admin_modify ON public.order_events FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY oe_admin_delete ON public.order_events FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

-- 5) Tabla order_evidences
CREATE TABLE IF NOT EXISTS public.order_evidences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.order_events(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  uploaded_by uuid NOT NULL,
  lat numeric, lng numeric, accuracy numeric,
  location_captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_evidences_event ON public.order_evidences(event_id);
CREATE INDEX IF NOT EXISTS idx_order_evidences_order ON public.order_evidences(order_id);

GRANT SELECT, INSERT, DELETE ON public.order_evidences TO authenticated;
GRANT ALL ON public.order_evidences TO service_role;
ALTER TABLE public.order_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY oev_select ON public.order_evidences FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_evidences.order_id
      AND (o.seller_id = auth.uid()
           OR has_any_role(auth.uid(), ARRAY['admin','facturacion','cartera','bodega','conductor']::app_role[])))
  );
CREATE POLICY oev_insert ON public.order_evidences FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY oev_delete_admin ON public.order_evidences FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

-- 6) Notificaciones in-app
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read_at, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_select_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- 7) Settings del flujo (singleton)
CREATE TABLE IF NOT EXISTS public.flow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  confirmation_mode text NOT NULL DEFAULT 'acceptance', -- 'signature' | 'acceptance'
  client_delivery_requires_photo boolean NOT NULL DEFAULT true,
  client_delivery_requires_geo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.flow_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.flow_settings TO authenticated;
GRANT ALL ON public.flow_settings TO service_role;
ALTER TABLE public.flow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY fs_select ON public.flow_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY fs_admin_write ON public.flow_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
