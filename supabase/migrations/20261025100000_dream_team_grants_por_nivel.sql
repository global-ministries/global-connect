-- T6 (odd/tasks/uno-a-uno.md, S6.1-S6.6) — Dream Team grants come from the
-- rol's nivel, not its label.
--
-- What:
--   public.dream_team_grants_de_servicio(equipo, experiencia, rol, label), the
--   SQL mirror of buildGrantsForServicio in lib/platform/dream-team/grants.ts,
--   now reads the nivel of p_rol_id from dream_team_roles:
--     generic      voluntario → dream_team.serve
--                  lider → serve + dream_team.lead
--                  coordinador → serve + dream_team.coordinate
--                  director → serve + dream_team.direct (scoped to the equipo)
--     experiencia  lider and coordinador pick the lead tier, director the
--                  director tier (estudiantes: lead), voluntario the serve
--                  tier; talleres_crecimiento, ninos and the_living_room have
--                  one capability for every tier, as before.
--     label        "Líder de grupo" still adds dream_team.gdv.lead scoped to
--                  the rol; no nivel mints it.
--   A p_rol_id with no row (the function is also called with made-up ids by
--   the test suites) falls back to dream_team_nivel_desde_label(p_rol_label),
--   as the TypeScript side does when a caller passes no nivel. A real rol
--   always has one: dream_team_roles.nivel is NOT NULL since
--   20261015100000_dream_team_nivel_rol.sql.
--
-- Why: a rol's label is free text, and since #577 its level is chosen when it
-- is created. Matching the label against fixed sets gave an "Operador de
-- cámara" created as lider nothing but the experiencia's serve capability.
--
-- Same signature and result columns, so dream_team_cargar_voluntarios (its
-- only caller) needs no change. It goes from IMMUTABLE to STABLE because it
-- now reads a table; CREATE OR REPLACE allows that. Still SECURITY INVOKER
-- with an empty search_path: the loader that calls it runs as postgres or
-- service_role, which read dream_team_roles regardless of RLS.
--
-- Pinned: the grants-table block of
-- supabase/tests/dream-team-grants-por-nivel.test.sql holds every nivel under
-- every experiencia; that suite checks this function against it and
-- __tests__/lib/platform/dream-team/grants-sql-mirror.test.ts checks
-- grants.ts against it.
--
-- Data safety: no existing grant is recalculated, revoked or written. Only the
-- function body changes; it runs when the loader activates a new servicio. In
-- production (2026-10-24) every rol carries one of the six standard labels
-- with the nivel that label gives, so it mints exactly what it minted before
-- for every one of them.
--
-- Rollback: re-run section 3 of
-- 20261003163000_dream_team_cargar_voluntarios.sql (CREATE OR REPLACE of
-- dream_team_grants_de_servicio by label, IMMUTABLE, with its COMMENT); the
-- REVOKE/GRANT below stay valid.

CREATE OR REPLACE FUNCTION public.dream_team_grants_de_servicio(
  p_equipo_id   uuid,
  p_experiencia text,
  p_rol_id      uuid,
  p_rol_label   text
)
RETURNS TABLE (capability_key text, experience text, scope_type text, scope_id text)
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  WITH rol AS (
    SELECT coalesce((SELECT r.nivel FROM public.dream_team_roles r WHERE r.id = p_rol_id),
                    public.dream_team_nivel_desde_label(p_rol_label)) AS nivel,
           public.dream_team_normalizar_etiqueta(p_rol_label) = 'lider de grupo' AS es_lider_de_grupo
  ),
  -- NIVEL_TO_GENERIC_CAPABILITIES, then the "Líder de grupo" exception.
  genericas AS (
    SELECT g.orden, g.capability_key
      FROM rol
      JOIN (VALUES
        ('voluntario',  1, 'dream_team.serve'),
        ('lider',       1, 'dream_team.serve'),
        ('lider',       2, 'dream_team.lead'),
        ('coordinador', 1, 'dream_team.serve'),
        ('coordinador', 2, 'dream_team.coordinate'),
        ('director',    1, 'dream_team.serve'),
        ('director',    2, 'dream_team.direct')
      ) AS g(nivel, orden, capability_key) ON g.nivel = rol.nivel
    UNION ALL
    SELECT 3, 'dream_team.gdv.lead' FROM rol WHERE rol.es_lider_de_grupo
  ),
  -- resolveExperienceSpecificCapability with TIER_BY_NIVEL.
  especifica AS (
    SELECT 100 AS orden,
           CASE p_experiencia
             WHEN 'dps' THEN CASE rol.nivel WHEN 'director' THEN 'dps.team.director'
                                            WHEN 'voluntario' THEN 'dps.team.serve'
                                            ELSE 'dps.team.lead' END
             WHEN 'estudiantes' THEN CASE rol.nivel WHEN 'voluntario' THEN 'estudiantes.team.serve'
                                                    ELSE 'estudiantes.team.lead' END
             WHEN 'talleres_crecimiento' THEN 'talleres_crecimiento.team.serve'
             WHEN 'ninos' THEN 'ninos.team.serve'
             WHEN 'the_living_room' THEN 'the_living_room.team.serve'
           END AS capability_key
      FROM rol
  ),
  -- PLATFORM_CAPABILITIES (lib/platform/experiences.ts), for the keys above.
  capacidades AS (
    SELECT * FROM (VALUES
      ('dream_team.serve',                'dream_team',           'equipo'),
      ('dream_team.lead',                 'dream_team',           'equipo'),
      ('dream_team.coordinate',           'dream_team',           'equipo'),
      ('dream_team.direct',               'dream_team',           'equipo'),
      ('dream_team.gdv.lead',             'grupos_vida',          'grupo'),
      ('dps.team.serve',                  'dps',                  'equipo'),
      ('dps.team.lead',                   'dps',                  'equipo'),
      ('dps.team.director',               'dps',                  'equipo'),
      ('estudiantes.team.serve',          'estudiantes',          'equipo'),
      ('estudiantes.team.lead',           'estudiantes',          'equipo'),
      ('talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller'),
      ('ninos.team.serve',                'ninos',                'equipo'),
      ('the_living_room.team.serve',      'the_living_room',      'experience')
    ) AS c(capability_key, experience, scope_type)
  )
  -- scopeIdForGrant: experience -> none, grupo -> the rol, else the equipo.
  SELECT c.capability_key, c.experience, c.scope_type,
         CASE c.scope_type
           WHEN 'experience' THEN NULL
           WHEN 'grupo' THEN p_rol_id::text
           ELSE p_equipo_id::text
         END
    FROM (SELECT orden, capability_key FROM genericas
          UNION ALL
          SELECT orden, capability_key FROM especifica WHERE capability_key IS NOT NULL) k
    JOIN capacidades c ON c.capability_key = k.capability_key
   ORDER BY k.orden;
$$;

COMMENT ON FUNCTION public.dream_team_grants_de_servicio(uuid, text, uuid, text) IS
  'The capability grants a servicio mints when it becomes activo, from the nivel '
  'of its rol (uno-a-uno T6): a SQL mirror of buildGrantsForServicio in '
  'lib/platform/dream-team/grants.ts, used by dream_team_cargar_voluntarios. Both '
  'sides are pinned to the grants-table of '
  'supabase/tests/dream-team-grants-por-nivel.test.sql (SQL suite and the Jest '
  'test grants-sql-mirror.test.ts); change them together.';

REVOKE ALL ON FUNCTION public.dream_team_grants_de_servicio(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dream_team_grants_de_servicio(uuid, text, uuid, text) TO service_role;
