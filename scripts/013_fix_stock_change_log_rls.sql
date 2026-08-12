-- Fix stock adjustments failing with:
-- "new row violates row-level security policy for table stock_change_log"
--
-- Product stock updates fire a trigger that inserts into stock_change_log.
-- That table had RLS enabled without an INSERT policy for authenticated users.

ALTER TABLE IF EXISTS public.stock_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view stock change log" ON public.stock_change_log;
DROP POLICY IF EXISTS "Authenticated users can create stock change log" ON public.stock_change_log;

CREATE POLICY "Authenticated users can view stock change log"
  ON public.stock_change_log
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create stock change log"
  ON public.stock_change_log
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Ensure the logging trigger can write even if session privileges vary
DO $$
DECLARE
  fn_name text;
BEGIN
  SELECT p.proname INTO fn_name
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'products'
    AND NOT t.tgisinternal
    AND pg_get_triggerdef(t.oid) ILIKE '%stock_change_log%'
  LIMIT 1;

  IF fn_name IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION public.%I() SECURITY DEFINER', fn_name);
    EXECUTE format('ALTER FUNCTION public.%I() SET search_path = public', fn_name);
  END IF;
END $$;
