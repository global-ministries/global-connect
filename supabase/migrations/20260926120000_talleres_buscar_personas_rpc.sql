-- talleres_buscar_personas — a capability-gated person search that does NOT
-- depend on `usuarios` row-level security.
--
-- WHY
--   Three people-search paths were broken for anyone who is not
--   admin/pastor/Grupos-de-Vida leader, because `usuarios`' own RLS only
--   lets those roles see other people's rows. Every caller who queried
--   `usuarios` directly through their OWN server client (subject to their
--   own session's RLS) — a Dream Team area director assigning a servidor,
--   a talleres director/coordinator assigning a servicio, or a talleres
--   facilitator assigning a líder/voluntario to a grupo — silently got
--   zero rows back ("Sin resultados"), no matter who they searched for.
--   Verified in staging with a real area director before this migration.
--
--   RLS on `usuarios` cannot simply be widened: it exists to keep arbitrary
--   authenticated users from browsing the whole congregation's records.
--   The fix instead is the same shape as every other cross-branch talleres/
--   Dream Team RPC in this codebase (see talleres_coord_inscripciones_
--   personas, talleres_asignar_inscripciones_a_grupo): a SECURITY DEFINER
--   function that runs its OWN capability check up front — independent of
--   `usuarios` RLS — and only then reads across the table.
--
--   Because this function deliberately reaches past `usuarios` RLS for
--   whoever passes its gate, its projection is the minimum useful for a
--   "pick a person" search: id, nombre, apellido, email. No phone, no
--   address, no birthdate, no family — nothing a search-and-assign screen
--   doesn't need, and nothing this function's job is to guard.
--
-- WHAT
--   `talleres_buscar_personas(p_q text, p_limit int DEFAULT 20) RETURNS
--   TABLE (id uuid, nombre text, apellido text, email text)`, STABLE
--   SECURITY DEFINER.
--
--   Gate (fail closed): resolve the caller's usuarios.id from
--   usuarios.auth_id = auth.uid(), then require at least one ACTIVE grant
--   (revoked_at IS NULL) in dream_team_capability_grants whose
--   capability_key is one of the seven listed below, in ANY scope — this
--   function never narrows by org-tree node, because "can I search for a
--   person to assign" is not itself a scoped action; the scoped action
--   that follows (assign servicio / assign grupo role) has its own gate.
--   No usuario row, or no matching grant → 42501 sin_autoridad_para_buscar.
--
--   Search: p_q is trimmed; shorter than 2 characters returns zero rows
--   without touching the table (same minimum the two HTTP routes already
--   enforced). Matches are case-insensitive substring (ILIKE %q%) against
--   nombre, apellido OR email, ordered by apellido then nombre. p_limit is
--   clamped to [1, 50] via LEAST(GREATEST(p_limit, 1), 50) regardless of
--   what the caller asks for.
--
-- SAFETY
--   Purely additive: one new function, nothing else touched. EXECUTE
--   revoked from PUBLIC and anon, granted only to authenticated, postgres,
--   service_role — same grant shape as every other paso-3 SECURITY DEFINER
--   RPC in this codebase.
--
-- ROLLBACK
--   DROP FUNCTION public.talleres_buscar_personas(text, int);

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
