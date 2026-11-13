-- odd/tasks/rendimiento-sistema.md, T1 (S2, S3).
--
-- Why: the SELECT policies of dream_team_servicios / _equipos / _roles /
-- _requisitos evaluated 12-13 capability checks PER ROW, each one a recursive
-- walk up the equipo tree joined to the grants, and the *_coordinador_voluntario
-- policies called dream_team_puede_registrar_persona() PER ROW, which in turn
-- recomputed dream_team_equipos_registrables() and dream_team_equipos_director()
-- (one more recursive walk per equipo). Reading the 601 servicios took
-- 3.4 s on average and up to 7.96 s in production, against an 8 s
-- statement_timeout for `authenticated`: under load the read is cancelled and
-- the screen shows "No pudimos cargar esta pantalla".
--
-- What: the caller's reach is computed ONCE per statement and every row is
-- compared against it. Same rule as before, same rows for every user:
--
--   capability K holds on equipo X  <=>  an active grant of K exists for the
--   caller with scope_id NULL, or with scope_id = an ancestor of X (X included,
--   at most 16 levels).
--
-- is the same as
--
--   auth_dream_team_alcance_global([K])  OR  X = ANY(auth_dream_team_alcance_equipos([K]))
--
-- where alcance_equipos walks DOWN from each scoped grant (same 16-level
-- bound). Wrapped in (SELECT ...) the planner evaluates each helper once
-- (InitPlan) instead of once per row. auth_has_talleres_capability_scoped and
-- auth_has_dream_team_capability_in_tree have the same body (both read
-- dream_team_capability_grants), so one helper covers both families.
--
-- ALTER POLICY keeps each policy's name, command and roles; only USING changes.
-- Equivalence check: supabase/tests/rls-dream-team-alcance-una-vez.test.sql.

-- ─── Helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_dream_team_alcance_global(p_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.dream_team_capability_grants g
      JOIN public.usuarios u ON u.id = g.persona_id
     WHERE u.auth_id = auth.uid()
       AND g.capability_key = ANY (p_keys)
       AND g.revoked_at IS NULL
       AND g.scope_id IS NULL
  );
$function$;

COMMENT ON FUNCTION public.auth_dream_team_alcance_global(text[]) IS
  'True when the caller holds any of p_keys with no scope (whole organization). '
  'Call it as (SELECT ...) in policies so it runs once per statement.';

REVOKE ALL ON FUNCTION public.auth_dream_team_alcance_global(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_dream_team_alcance_global(text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auth_dream_team_alcance_equipos(p_keys text[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH RECURSIVE
  raices AS (
    SELECT DISTINCT e.id
      FROM public.dream_team_capability_grants g
      JOIN public.usuarios u ON u.id = g.persona_id
      JOIN public.dream_team_equipos e ON e.id::text = g.scope_id
     WHERE u.auth_id = auth.uid()
       AND g.capability_key = ANY (p_keys)
       AND g.revoked_at IS NULL
  ),
  arbol AS (
    SELECT r.id, 1 AS profundidad FROM raices r
    UNION ALL
    SELECT h.id, a.profundidad + 1
      FROM public.dream_team_equipos h
      JOIN arbol a ON h.parent_equipo_id = a.id
     WHERE a.profundidad < 16
  )
  SELECT coalesce(array_agg(DISTINCT a.id), '{}'::uuid[]) FROM arbol a;
$function$;

COMMENT ON FUNCTION public.auth_dream_team_alcance_equipos(text[]) IS
  'The equipos under (and including) the scopes of the caller''s active grants '
  'of p_keys, 16 levels deep, mirroring the upward walk of '
  'auth_has_dream_team_capability_in_tree. Call it as (SELECT ...) in policies.';

REVOKE ALL ON FUNCTION public.auth_dream_team_alcance_equipos(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_dream_team_alcance_equipos(text[]) TO authenticated, service_role;

-- The area director's equipos: same rows as before, one tree walk instead of
-- one per equipo.
CREATE OR REPLACE FUNCTION public.dream_team_equipos_director()
RETURNS TABLE (equipo_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT e.id
    FROM public.dream_team_equipos e
   WHERE auth.uid() IS NOT NULL
     AND e.activo
     AND (
       (SELECT public.auth_dream_team_alcance_global(ARRAY['dream_team.direct']))
       OR e.id = ANY ((SELECT public.auth_dream_team_alcance_equipos(ARRAY['dream_team.direct']))::uuid[])
     );
$function$;

COMMENT ON FUNCTION public.dream_team_equipos_director() IS
  'The active equipos of the actor''s dream_team.direct subtrees (area director).';

REVOKE ALL ON FUNCTION public.dream_team_equipos_director() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_equipos_director() TO authenticated;

-- dream_team_puede_registrar_persona(x) for a non-null x, as a set computed once.
CREATE OR REPLACE FUNCTION public.dream_team_equipos_registro()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coalesce(array_agg(DISTINCT x.equipo_id), '{}'::uuid[])
    FROM (SELECT r.equipo_id FROM public.dream_team_equipos_registrables() r
          UNION
          SELECT d.equipo_id FROM public.dream_team_equipos_director() d) x;
$function$;

COMMENT ON FUNCTION public.dream_team_equipos_registro() IS
  'The equipos dream_team_puede_registrar_persona(x) answers true for, as one '
  'array. Call it as (SELECT ...) in policies so it runs once per statement.';

REVOKE ALL ON FUNCTION public.dream_team_equipos_registro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dream_team_equipos_registro() TO authenticated;

-- ─── Policies ───────────────────────────────────────────────────────────────

ALTER POLICY dream_team_servicios_select ON public.dream_team_servicios
USING (
  (SELECT public.auth_dream_team_alcance_global(ARRAY[
    'talleres_crecimiento.director.read', 'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.read', 'talleres_crecimiento.lead.read',
    'talleres_crecimiento.volunteer.read', 'talleres_crecimiento.metrics.read',
    'dream_team.org.manage', 'dream_team.director.coordinate', 'dream_team.direct',
    'dream_team.coordinate', 'dream_team.lead', 'dream_team.metrics.read']))
  OR equipo_id = ANY ((SELECT public.auth_dream_team_alcance_equipos(ARRAY[
    'talleres_crecimiento.director.read', 'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.read', 'talleres_crecimiento.lead.read',
    'talleres_crecimiento.volunteer.read', 'talleres_crecimiento.metrics.read',
    'dream_team.org.manage', 'dream_team.director.coordinate', 'dream_team.direct',
    'dream_team.coordinate', 'dream_team.lead', 'dream_team.metrics.read']))::uuid[])
  OR persona_id = (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())
);

ALTER POLICY dream_team_equipos_select ON public.dream_team_equipos
USING (
  (SELECT public.auth_dream_team_alcance_global(ARRAY[
    'talleres_crecimiento.director.read', 'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.read', 'talleres_crecimiento.lead.read',
    'talleres_crecimiento.volunteer.read', 'talleres_crecimiento.metrics.read',
    'dream_team.org.manage', 'dream_team.director.coordinate', 'dream_team.direct',
    'dream_team.coordinate', 'dream_team.lead', 'dream_team.serve',
    'dream_team.metrics.read']))
  OR id = ANY ((SELECT public.auth_dream_team_alcance_equipos(ARRAY[
    'talleres_crecimiento.director.read', 'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.read', 'talleres_crecimiento.lead.read',
    'talleres_crecimiento.volunteer.read', 'talleres_crecimiento.metrics.read',
    'dream_team.org.manage', 'dream_team.director.coordinate', 'dream_team.direct',
    'dream_team.coordinate', 'dream_team.lead', 'dream_team.serve',
    'dream_team.metrics.read']))::uuid[])
);

ALTER POLICY dream_team_roles_select ON public.dream_team_roles
USING (
  (SELECT public.auth_dream_team_alcance_global(ARRAY[
    'talleres_crecimiento.director.read', 'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.read', 'talleres_crecimiento.lead.read',
    'talleres_crecimiento.volunteer.read', 'talleres_crecimiento.metrics.read',
    'dream_team.org.manage', 'dream_team.director.coordinate', 'dream_team.direct',
    'dream_team.coordinate', 'dream_team.lead', 'dream_team.serve',
    'dream_team.metrics.read']))
  OR equipo_id = ANY ((SELECT public.auth_dream_team_alcance_equipos(ARRAY[
    'talleres_crecimiento.director.read', 'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.coordinator.read', 'talleres_crecimiento.lead.read',
    'talleres_crecimiento.volunteer.read', 'talleres_crecimiento.metrics.read',
    'dream_team.org.manage', 'dream_team.director.coordinate', 'dream_team.direct',
    'dream_team.coordinate', 'dream_team.lead', 'dream_team.serve',
    'dream_team.metrics.read']))::uuid[])
);

ALTER POLICY dream_team_requisitos_read ON public.dream_team_requisitos
USING (
  (SELECT public.auth_dream_team_alcance_global(ARRAY[
    'dream_team.org.manage', 'dream_team.director.coordinate', 'dream_team.direct',
    'dream_team.coordinate', 'dream_team.lead', 'dream_team.serve']))
  OR equipo_id = ANY ((SELECT public.auth_dream_team_alcance_equipos(ARRAY[
    'dream_team.org.manage', 'dream_team.director.coordinate', 'dream_team.direct',
    'dream_team.coordinate', 'dream_team.lead', 'dream_team.serve']))::uuid[])
  OR (SELECT public.auth_has_dream_team_capability('dream_team.requirements.manage'))
  OR (SELECT public.auth_has_dream_team_capability('dream_team.metrics.read'))
);

ALTER POLICY dream_team_servicios_select_coordinador_voluntario ON public.dream_team_servicios
USING (equipo_id IS NOT NULL AND equipo_id = ANY ((SELECT public.dream_team_equipos_registro())::uuid[]));

ALTER POLICY dream_team_equipos_select_coordinador_voluntario ON public.dream_team_equipos
USING (id IS NOT NULL AND id = ANY ((SELECT public.dream_team_equipos_registro())::uuid[]));

ALTER POLICY dream_team_roles_select_coordinador_voluntario ON public.dream_team_roles
USING (equipo_id IS NOT NULL AND equipo_id = ANY ((SELECT public.dream_team_equipos_registro())::uuid[]));
