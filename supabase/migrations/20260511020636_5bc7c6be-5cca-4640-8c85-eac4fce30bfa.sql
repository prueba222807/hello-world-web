
-- CUSTOMERS
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  siigo_id text UNIQUE,
  identification text NOT NULL,
  id_type text,
  branch_office integer DEFAULT 0,
  person_type text,
  commercial_name text,
  first_name text,
  last_name text,
  display_name text NOT NULL,
  email text,
  phone text,
  address text,
  city_code text,
  city_name text,
  state_name text,
  country_code text DEFAULT 'Co',
  active boolean NOT NULL DEFAULT true,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_identification ON public.customers(identification);
CREATE INDEX idx_customers_display_name ON public.customers(lower(display_name));

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_authenticated" ON public.customers
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PRODUCTS
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  siigo_id text UNIQUE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  price numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,2) NOT NULL DEFAULT 19,
  tax_id integer,
  unit text,
  stock numeric(14,2),
  account_group integer,
  active boolean NOT NULL DEFAULT true,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_code ON public.products(code);
CREATE INDEX idx_products_name ON public.products(lower(name));

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_authenticated" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SYNC LOG
CREATE TABLE public.sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity text NOT NULL,
  status text NOT NULL,
  total integer DEFAULT 0,
  inserted integer DEFAULT 0,
  updated integer DEFAULT 0,
  errors integer DEFAULT 0,
  message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_log_admin_select" ON public.sync_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
