ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS default_invoice_note text,
  ADD COLUMN IF NOT EXISTS default_document_id integer;

CREATE TABLE IF NOT EXISTS public.siigo_document_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  siigo_id integer NOT NULL UNIQUE,
  code text,
  name text NOT NULL,
  description text,
  type text,
  active boolean NOT NULL DEFAULT true,
  raw jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.siigo_document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctypes_select_authenticated"
  ON public.siigo_document_types FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "doctypes_admin_write"
  ON public.siigo_document_types FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_doctypes_updated_at
  BEFORE UPDATE ON public.siigo_document_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();