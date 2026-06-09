
-- siigo_tokens: bloquear todo acceso desde frontend (solo service role lee/escribe)
CREATE POLICY "siigo_tokens_no_access" ON public.siigo_tokens
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- Revocar EXECUTE público en funciones internas
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
