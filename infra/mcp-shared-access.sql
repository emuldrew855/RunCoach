\set ON_ERROR_STOP on
\connect postgres

SELECT pgaadauth_create_principal_with_oid(:'runtime_role', :'runtime_object_id', 'service', false, false)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role');

SELECT EXISTS (
  SELECT 1 FROM pgaadauth_list_principals(false)
  WHERE rolname = :'runtime_role' AND objectid = :'runtime_object_id' AND principaltype = 'service'
) AS principal_matches \gset
\if :principal_matches
\else
  \echo 'Runtime role is not mapped to the expected managed identity'
  \quit 1
\endif

\connect :database_name
BEGIN;
CREATE SCHEMA IF NOT EXISTS runcoach_mcp AUTHORIZATION :"runtime_role";
SELECT EXISTS (
  SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
  WHERE n.nspname = 'runcoach_mcp' AND r.rolname = :'runtime_role'
) AS schema_matches \gset
\if :schema_matches
\else
  \echo 'Existing MCP schema has a different owner; refusing to change it'
  \quit 1
\endif

\ir mcp-shared-lock.sql
GRANT CONNECT ON DATABASE :"database_name" TO :"runtime_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT (id, strava_id, access_token, refresh_token, token_expires_at)
  ON public.users TO :"runtime_role";
GRANT INSERT (strava_id, access_token, refresh_token, token_expires_at)
  ON public.users TO :"runtime_role";
GRANT UPDATE (access_token, refresh_token, token_expires_at, updated_at)
  ON public.users TO :"runtime_role";
GRANT USAGE ON SEQUENCE public.users_id_seq TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.runcoach_mcp_lock_credentials() TO :"runtime_role";
COMMIT;
