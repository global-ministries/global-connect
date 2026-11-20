-- Dream Team: the experiencia global_music mints its own capabilities (T1 of
-- odd/tasks/dps-plan.md, S2, S10).
--
-- What: public.dream_team_grants_de_servicio, the SQL mirror of
-- buildGrantsForServicio in lib/platform/dream-team/grants.ts, learns the
-- experiencia global_music with the same tiers as dps:
--   voluntario  → global_music.team.serve
--   lider, coordinador → global_music.team.lead
--   director    → global_music.team.director
-- all scoped to the equipo, on top of the generic dream_team.* of each nivel.
-- Every other experiencia mints exactly what it minted before.
--
-- Why: 20261103100000_dream_team_dps_estructura.sql moves Banda Musical out of
-- DPS as Global Music with experiencia global_music. Without this, a musician
-- loaded by dream_team_cargar_voluntarios would get only the generic grants.
--
-- Same signature, result columns, volatility, SECURITY INVOKER, empty
-- search_path and privileges as 20261025100000_dream_team_grants_por_nivel.sql;
-- only the body changes. No existing grant is recalculated, revoked or written.
--
-- Pinned: the grants-table block of
-- supabase/tests/dream-team-grants-por-nivel.test.sql now holds every nivel
-- under global_music; that suite checks this function against it and
-- __tests__/lib/platform/dream-team/grants-sql-mirror.test.ts checks grants.ts
-- against it.
--
-- Rollback: re-run 20261025100000_dream_team_grants_por_nivel.sql.

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
             WHEN 'global_music' THEN CASE rol.nivel WHEN 'director' THEN 'global_music.team.director'
                                                     WHEN 'voluntario' THEN 'global_music.team.serve'
                                                     ELSE 'global_music.team.lead' END
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
      ('global_music.team.serve',         'global_music',         'equipo'),
      ('global_music.team.lead',          'global_music',         'equipo'),
      ('global_music.team.director',      'global_music',         'equipo'),
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
