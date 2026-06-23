-- Accept PostgREST service-role JWT context exposed either as a scalar claim
-- setting or inside the JSON claims setting. Mutating RPC grants stay service-role-only.

CREATE OR REPLACE FUNCTION public.casas_map_auth_matches_actor(p_auth_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_request_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  v_claims_raw text := nullif(current_setting('request.jwt.claims', true), '');
  v_claims_role text;
BEGIN
  IF v_claims_raw IS NOT NULL THEN
    BEGIN
      v_claims_role := nullif(v_claims_raw::jsonb ->> 'role', '');
    EXCEPTION WHEN others THEN
      v_claims_role := NULL;
    END;
  END IF;

  RETURN p_auth_id IS NOT NULL
    AND (
      coalesce(v_request_role, '') = 'service_role'
      OR coalesce(v_claims_role, '') = 'service_role'
      OR (auth.uid() IS NOT NULL AND p_auth_id IS NOT DISTINCT FROM auth.uid())
    );
END;
$$;

REVOKE ALL ON FUNCTION public.casas_map_auth_matches_actor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.casas_map_auth_matches_actor(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.casas_map_auth_matches_actor(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.casas_map_auth_matches_actor(uuid) TO service_role;
