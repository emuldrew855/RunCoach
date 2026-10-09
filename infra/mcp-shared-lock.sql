CREATE OR REPLACE FUNCTION public.runcoach_mcp_lock_credentials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- A column-scoped UPDATE grant cannot acquire an EXCLUSIVE table lock.
  -- Expose only this fixed lock, not table-wide write privileges.
  LOCK TABLE public.users IN EXCLUSIVE MODE;
END;
$function$;

REVOKE ALL ON FUNCTION public.runcoach_mcp_lock_credentials() FROM PUBLIC;
