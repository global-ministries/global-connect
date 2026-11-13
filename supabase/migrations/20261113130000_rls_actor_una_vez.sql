-- odd/tasks/rendimiento-sistema.md, T4 (S5).
--
-- Why: three policies looked up "who am I" (or the caller's roles) once PER
-- ROW instead of once per statement:
--
-- * grupos_select_scoped_authenticated: EXISTS (SELECT 1 FROM usuarios actor
--   WHERE actor.auth_id = auth.uid() AND puede_ver_grupo(actor.id, grupos.id))
--   is correlated with each grupo, so for every grupo the caller's own usuarios
--   row was searched again under usuarios' own RLS (puede_ver_usuario on each
--   usuarios row). Reading the 196 grupos took 2.5-4.7 s for a pastor,
--   director, leader or member (88 ms for an admin) and up to 7.98 s under
--   load, against the 8 s statement_timeout.
-- * dream_team_capability_grants_read_own: the same correlated self lookup per
--   grant row.
-- * "Solo admin puede ver usuarios": obtener_roles_usuario(auth.uid()) per
--   usuarios row.
--
-- What: the same predicates with the lookup hoisted into (SELECT ...), which
-- the planner evaluates once (InitPlan). Same rows for every user:
-- * usuarios.auth_id is unique (unique_auth_id_nonnull) and a user always sees
--   their own usuarios row (usuarios_can_view_profile_photos: auth.uid() =
--   auth_id), so "the visible usuarios row with my auth_id" is exactly
--   get_my_internal_id(). With no row both sides are false:
--   puede_ver_grupo(NULL, x) returns false.
-- * obtener_roles_usuario(auth.uid()) does not depend on the row.
--
-- ALTER POLICY keeps each policy's name, command and roles; only USING changes.

ALTER POLICY grupos_select_scoped_authenticated ON public.grupos
USING (public.puede_ver_grupo((SELECT public.get_my_internal_id()), id));

-- The repo renames it to *_read_own_pastoral (20260725120000); production
-- still carries the original name. Alter whichever exists.
DO $$
DECLARE
  v_nombre text;
BEGIN
  FOR v_nombre IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'dream_team_capability_grants'
       AND policyname IN ('dream_team_capability_grants_read_own', 'dream_team_capability_grants_read_own_pastoral')
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.dream_team_capability_grants USING (persona_id = (SELECT public.get_my_internal_id()))',
      v_nombre);
  END LOOP;
END $$;

ALTER POLICY "Solo admin puede ver usuarios" ON public.usuarios
USING ((SELECT public.obtener_roles_usuario(auth.uid())) && ARRAY['admin'::text]);
