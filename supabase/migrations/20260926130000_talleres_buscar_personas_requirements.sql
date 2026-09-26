-- talleres_buscar_personas — add dream_team.requirements.manage to the
-- allowed capability list.
--
-- WHY
--   hasDreamTeamWriteCapability (lib/platform/dream-team/capabilities.ts),
--   the app-level gate on GET /api/dream-team/usuarios/buscar, accepts
--   dream_team.requirements.manage as a write capability — but the RPC's
--   own gate did not, so a caller holding ONLY that capability could pass
--   the route's 403 check and then still be denied 42501 by the RPC.
--
--   The route used to paper over that gap by mapping the RPC's 42501 back
--   to an empty result — but that reintroduces the exact failure mode this
--   whole change exists to kill: an authorization problem rendered to the
--   user as "Sin resultados", indistinguishable from "nobody matched".
--   The correct fix is to align the two gates, not hide the mismatch: this
--   capability genuinely is a Dream Team write capability, so it belongs
--   on the RPC's list too. The route now surfaces any real 42501 as a
--   visible 403 instead (see the route files).
--
-- WHAT
--   CREATE OR REPLACE FUNCTION public.talleres_buscar_personas — same
--   signature, same body, same STABLE SECURITY DEFINER SET search_path =
--   public, only the capability_key IN (...) list gains
--   'dream_team.requirements.manage' as an eighth accepted key.
--
-- SAFETY
--   Redefinition only, same signature (text, int) — the function keeps its
--   OID and its existing EXECUTE grants (authenticated, postgres,
--   service_role; none to anon/PUBLIC), re-stated below for clarity. This
--   only WIDENS who can search — the search itself still returns nothing
--   but id/nombre/apellido/email, and still requires p_q to be at least 2
--   characters.
--
-- ROLLBACK
--   Re-apply 20260926120000_talleres_buscar_personas_rpc.sql's original
--   CREATE OR REPLACE FUNCTION body (the seven-key list, without
--   dream_team.requirements.manage).

CREATE OR REPLACE FUNCTION public.talleres_buscar_personas(
  p_q text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  nombre text,
  apellido text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor_id uuid;
  v_q        text;
  v_limit    int;
BEGIN
  SELECT u.id INTO v_actor_id FROM public.usuarios u WHERE u.auth_id = auth.uid();

  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.dream_team_capability_grants g
    WHERE g.persona_id = v_actor_id
      AND g.revoked_at IS NULL
      AND g.capability_key IN (
        'dream_team.org.manage',
        'dream_team.director.coordinate',
        'dream_team.direct',
        'dream_team.coordinate',
        'dream_team.requirements.manage',
        'talleres_crecimiento.admin.manage',
        'talleres_crecimiento.director.write',
        'talleres_crecimiento.coordinator.write'
      )
  ) THEN
    RAISE EXCEPTION 'sin_autoridad_para_buscar' USING ERRCODE = '42501';
  END IF;

  v_q := trim(coalesce(p_q, ''));
  IF length(v_q) < 2 THEN
    RETURN;
  END IF;

  v_limit := LEAST(GREATEST(p_limit, 1), 50);

  RETURN QUERY
  SELECT u.id, u.nombre, u.apellido, u.email
  FROM public.usuarios u
  WHERE u.nombre ILIKE '%' || v_q || '%'
     OR u.apellido ILIKE '%' || v_q || '%'
     OR u.email ILIKE '%' || v_q || '%'
  ORDER BY u.apellido, u.nombre
  LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_buscar_personas(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_buscar_personas(text, int) TO authenticated, postgres, service_role;
