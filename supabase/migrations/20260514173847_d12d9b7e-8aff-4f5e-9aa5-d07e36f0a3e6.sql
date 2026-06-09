
CREATE OR REPLACE FUNCTION public.assign_order_number(_seller_id uuid)
 RETURNS TABLE(prefix text, consecutive integer, order_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_next int;
BEGIN
  INSERT INTO public.seller_sequences (user_id, prefix, next_consecutive)
  VALUES (_seller_id, '', 1)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.seller_sequences AS s
    SET next_consecutive = s.next_consecutive + 1, updated_at = now()
    WHERE s.user_id = _seller_id
    RETURNING s.prefix, s.next_consecutive - 1
    INTO v_prefix, v_next;

  RETURN QUERY SELECT
    v_prefix AS prefix,
    v_next AS consecutive,
    CASE WHEN coalesce(v_prefix,'') = '' THEN v_next::text ELSE v_prefix || '-' || v_next::text END AS order_number;
END;
$function$;
