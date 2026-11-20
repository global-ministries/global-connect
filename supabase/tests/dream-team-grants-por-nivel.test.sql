-- T6 (odd/tasks/uno-a-uno.md, S6.1-S6.6) — Dream Team grants by the rol's
-- nivel: public.dream_team_grants_de_servicio as redefined by migration
-- 20261025100000_dream_team_grants_por_nivel.sql, and by
-- 20261103100100_dream_team_grants_global_music.sql, which adds the
-- experiencia global_music with the tiers of dps (T1 of odd/tasks/dps-plan.md).
--
-- Covers:
--   a. The SQL mirror matches the pinned nivel x experiencia table below
--      (S6.4). The Jest test
--      __tests__/lib/platform/dream-team/grants-sql-mirror.test.ts pins
--      lib/platform/dream-team/grants.ts to the SAME table, so a change on
--      either side fails one of the two suites. Every non-exception row uses a
--      free label that names no level, so only the nivel can explain it.
--   b. A free label ("Operador de cámara") mints the grants of its nivel:
--      lider → lead, coordinador → coordinate, voluntario → serve only, and a
--      change of nivel changes what it mints (S6.1, S6.2).
--   c. The six labels in production, inserted without a nivel (so the T1
--      trigger gives them the level of their label), mint exactly today's
--      grants under dps and ninos, and the same as the label alone (S6.6).
--   d. "Líder de grupo" adds dream_team.gdv.lead scoped to the rol, whatever
--      its nivel; no other label does (S6.3).
--   e. A rol id with no row falls back to the level of its label (S6.5).
--   f. Privileges and shape unchanged: same signature and result columns,
--      SECURITY INVOKER, search_path set, STABLE (it reads dream_team_roles),
--      EXECUTE for service_role only (not PUBLIC, anon or authenticated), and
--      an authenticated session is refused.
--
-- Everything reads the migrated function, so a, b and the free-label part of
-- c-e fail until the migration is applied (RED) and pass after it (GREEN).
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. Fixtures
-- live under this file's own c6600000-... namespace. The MCP connection is
-- `postgres`, so every statement runs as the table owner; only the last f case
-- switches to authenticated. The last statement is a SELECT of the failing
-- cases (0 failing cases = all ok), because the MCP tool returns only the last
-- result-producing statement.
--
-- Fixtures (equipo 01 'ZZ T6 grants por nivel', experiencia dps):
--   a1 Operador de cámara (voluntario), a2 Guía (lider), a3 Encargado
--   (coordinador), a4 Responsable (director), a5 Líder de grupo (lider);
--   b1-b6 Voluntario, Líder, Facilitador, Entrenador, Coordinador, Director
--   inserted without a nivel.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_gn_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_gn_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Runs a query that returns one scalar and compares its text form.
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(v_actual, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

-- The capability keys a rol mints under an experiencia, sorted bytewise and
-- comma-separated, so the expected strings below do not depend on collation.
CREATE OR REPLACE FUNCTION pg_temp.claves(p_rol_id uuid, p_experiencia text, p_label text DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(g.capability_key, ',' ORDER BY g.capability_key COLLATE "C"), '')
    FROM public.dream_team_grants_de_servicio(
           'c6600000-0000-4000-8000-000000000001'::uuid, p_experiencia, p_rol_id,
           coalesce(p_label, (SELECT r.label FROM public.dream_team_roles r WHERE r.id = p_rol_id))) g;
$$;

-- ── fixtures ────────────────────────────────────────────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, activo) VALUES
  ('c6600000-0000-4000-8000-000000000001', 'dps', 'ZZ T6 grants por nivel', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel) VALUES
  ('c6600000-0000-4000-8000-0000000000a1', 'c6600000-0000-4000-8000-000000000001', 'Operador de cámara', 'voluntario'),
  ('c6600000-0000-4000-8000-0000000000a2', 'c6600000-0000-4000-8000-000000000001', 'Guía', 'lider'),
  ('c6600000-0000-4000-8000-0000000000a3', 'c6600000-0000-4000-8000-000000000001', 'Encargado', 'coordinador'),
  ('c6600000-0000-4000-8000-0000000000a4', 'c6600000-0000-4000-8000-000000000001', 'Responsable', 'director'),
  ('c6600000-0000-4000-8000-0000000000a5', 'c6600000-0000-4000-8000-000000000001', 'Líder de grupo', 'lider');

INSERT INTO public.dream_team_roles (id, equipo_id, label) VALUES
  ('c6600000-0000-4000-8000-0000000000b1', 'c6600000-0000-4000-8000-000000000001', 'Voluntario'),
  ('c6600000-0000-4000-8000-0000000000b2', 'c6600000-0000-4000-8000-000000000001', 'Líder'),
  ('c6600000-0000-4000-8000-0000000000b3', 'c6600000-0000-4000-8000-000000000001', 'Facilitador'),
  ('c6600000-0000-4000-8000-0000000000b4', 'c6600000-0000-4000-8000-000000000001', 'Entrenador'),
  ('c6600000-0000-4000-8000-0000000000b5', 'c6600000-0000-4000-8000-000000000001', 'Coordinador'),
  ('c6600000-0000-4000-8000-0000000000b6', 'c6600000-0000-4000-8000-000000000001', 'Director');

-- ── a. the pinned nivel x experiencia table ─────────────────────────
-- One row per capability: (experiencia of the equipo, nivel of the rol, rol
-- label, capability_key, experience, scope_type, alcance). alcance says what
-- scope_id holds: the equipo id, the rol id, or none (NULL). Every nivel is
-- here under every experiencia with a capability of its own (dps,
-- global_music, estudiantes, talleres_crecimiento, ninos, the_living_room)
-- and under one
-- without (experiencia), plus the "Líder de grupo" exception under each. The
-- Jest test grants-sql-mirror.test.ts parses the lines between the markers and
-- requires that coverage, so keep one tuple per line in exactly this format.
-- Each (nivel, label) pair is one fixture rol above.

CREATE TEMP TABLE t_gn_grants_tabla (
  experiencia text, nivel text, rol text, capability_key text, experience text, scope_type text, alcance text
) ON COMMIT DROP;

INSERT INTO t_gn_grants_tabla (experiencia, nivel, rol, capability_key, experience, scope_type, alcance) VALUES
-- grants-table:begin
  ('dps', 'voluntario', 'Operador de cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'voluntario', 'Operador de cámara', 'dps.team.serve', 'dps', 'equipo', 'equipo'),
  ('dps', 'lider', 'Guía', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'lider', 'Guía', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'lider', 'Guía', 'dps.team.lead', 'dps', 'equipo', 'equipo'),
  ('dps', 'coordinador', 'Encargado', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'coordinador', 'Encargado', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'coordinador', 'Encargado', 'dps.team.lead', 'dps', 'equipo', 'equipo'),
  ('dps', 'director', 'Responsable', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'director', 'Responsable', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'director', 'Responsable', 'dps.team.director', 'dps', 'equipo', 'equipo'),
  ('dps', 'lider', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'lider', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'lider', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('dps', 'lider', 'Líder de grupo', 'dps.team.lead', 'dps', 'equipo', 'equipo'),
  ('global_music', 'voluntario', 'Operador de cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('global_music', 'voluntario', 'Operador de cámara', 'global_music.team.serve', 'global_music', 'equipo', 'equipo'),
  ('global_music', 'lider', 'Guía', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('global_music', 'lider', 'Guía', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('global_music', 'lider', 'Guía', 'global_music.team.lead', 'global_music', 'equipo', 'equipo'),
  ('global_music', 'coordinador', 'Encargado', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('global_music', 'coordinador', 'Encargado', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('global_music', 'coordinador', 'Encargado', 'global_music.team.lead', 'global_music', 'equipo', 'equipo'),
  ('global_music', 'director', 'Responsable', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('global_music', 'director', 'Responsable', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('global_music', 'director', 'Responsable', 'global_music.team.director', 'global_music', 'equipo', 'equipo'),
  ('global_music', 'lider', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('global_music', 'lider', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('global_music', 'lider', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('global_music', 'lider', 'Líder de grupo', 'global_music.team.lead', 'global_music', 'equipo', 'equipo'),
  ('estudiantes', 'voluntario', 'Operador de cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'voluntario', 'Operador de cámara', 'estudiantes.team.serve', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'lider', 'Guía', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'lider', 'Guía', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'lider', 'Guía', 'estudiantes.team.lead', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'coordinador', 'Encargado', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'coordinador', 'Encargado', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'coordinador', 'Encargado', 'estudiantes.team.lead', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'director', 'Responsable', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'director', 'Responsable', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'director', 'Responsable', 'estudiantes.team.lead', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'lider', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'lider', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'lider', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('estudiantes', 'lider', 'Líder de grupo', 'estudiantes.team.lead', 'estudiantes', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'voluntario', 'Operador de cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'voluntario', 'Operador de cámara', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'lider', 'Guía', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'lider', 'Guía', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'lider', 'Guía', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'coordinador', 'Encargado', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'coordinador', 'Encargado', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'coordinador', 'Encargado', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'director', 'Responsable', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'director', 'Responsable', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'director', 'Responsable', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'lider', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'lider', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'lider', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('talleres_crecimiento', 'lider', 'Líder de grupo', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('ninos', 'voluntario', 'Operador de cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'voluntario', 'Operador de cámara', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'lider', 'Guía', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'lider', 'Guía', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'lider', 'Guía', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'coordinador', 'Encargado', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'coordinador', 'Encargado', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'coordinador', 'Encargado', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'director', 'Responsable', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'director', 'Responsable', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'director', 'Responsable', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'lider', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'lider', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'lider', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('ninos', 'lider', 'Líder de grupo', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('the_living_room', 'voluntario', 'Operador de cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'voluntario', 'Operador de cámara', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'lider', 'Guía', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'lider', 'Guía', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'lider', 'Guía', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'coordinador', 'Encargado', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'coordinador', 'Encargado', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'coordinador', 'Encargado', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'director', 'Responsable', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'director', 'Responsable', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'director', 'Responsable', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'lider', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'lider', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'lider', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('the_living_room', 'lider', 'Líder de grupo', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('experiencia', 'voluntario', 'Operador de cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'lider', 'Guía', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'lider', 'Guía', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'coordinador', 'Encargado', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'coordinador', 'Encargado', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'director', 'Responsable', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'director', 'Responsable', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'lider', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'lider', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'lider', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol')
-- grants-table:end
;

SELECT pg_temp.assert_eq('a: the SQL mirror of the nivel -> capability mapping matches the pinned table',
  $q$WITH roles AS (
            SELECT r.id, r.label, r.nivel FROM public.dream_team_roles r
             WHERE r.equipo_id = 'c6600000-0000-4000-8000-000000000001'),
          triples AS (SELECT DISTINCT experiencia, nivel, rol FROM t_gn_grants_tabla),
          actual AS (
            SELECT t.experiencia, t.nivel, t.rol, g.capability_key, g.experience, g.scope_type,
                   CASE WHEN g.scope_id IS NULL THEN 'none'
                        WHEN g.scope_id = 'c6600000-0000-4000-8000-000000000001' THEN 'equipo'
                        WHEN g.scope_id = r.id::text THEN 'rol'
                        ELSE 'other:' || g.scope_id END AS alcance
              FROM triples t
              JOIN roles r ON r.label = t.rol AND r.nivel = t.nivel
             CROSS JOIN LATERAL public.dream_team_grants_de_servicio(
               'c6600000-0000-4000-8000-000000000001'::uuid, t.experiencia, r.id, r.label) g),
          diff AS (
            SELECT 'extra' AS lado, x.* FROM (SELECT * FROM actual EXCEPT ALL SELECT * FROM t_gn_grants_tabla) x
            UNION ALL
            SELECT 'missing', y.* FROM (SELECT * FROM t_gn_grants_tabla EXCEPT ALL SELECT * FROM actual) y)
     SELECT coalesce(string_agg(lado || ' ' || experiencia || '/' || nivel || '/' || rol || '/' || capability_key
                                || '/' || scope_type || '/' || alcance, '; '), '')
       FROM diff$q$,
  '');

-- ── b. a free label mints the grants of its nivel ───────────────────

SELECT pg_temp.assert_eq('b: "Operador de cámara" with nivel voluntario only serves',
  $q$SELECT pg_temp.claves('c6600000-0000-4000-8000-0000000000a1', 'dps')$q$,
  'dps.team.serve,dream_team.serve');

UPDATE public.dream_team_roles SET nivel = 'lider' WHERE id = 'c6600000-0000-4000-8000-0000000000a1';

SELECT pg_temp.assert_eq('b: "Operador de cámara" with nivel lider leads',
  $q$SELECT pg_temp.claves('c6600000-0000-4000-8000-0000000000a1', 'dps')$q$,
  'dps.team.lead,dream_team.lead,dream_team.serve');

UPDATE public.dream_team_roles SET nivel = 'coordinador' WHERE id = 'c6600000-0000-4000-8000-0000000000a1';

SELECT pg_temp.assert_eq('b: "Operador de cámara" with nivel coordinador coordinates',
  $q$SELECT pg_temp.claves('c6600000-0000-4000-8000-0000000000a1', 'ninos')$q$,
  'dream_team.coordinate,dream_team.serve,ninos.team.serve');

UPDATE public.dream_team_roles SET nivel = 'director' WHERE id = 'c6600000-0000-4000-8000-0000000000a1';

SELECT pg_temp.assert_eq('b: "Operador de cámara" with nivel director directs',
  $q$SELECT pg_temp.claves('c6600000-0000-4000-8000-0000000000a1', 'estudiantes')$q$,
  'dream_team.direct,dream_team.serve,estudiantes.team.lead');

UPDATE public.dream_team_roles SET nivel = 'voluntario' WHERE id = 'c6600000-0000-4000-8000-0000000000a1';

-- ── c. the six labels in production keep today's grants ─────────────

SELECT pg_temp.assert_eq('c: the T1 trigger gives the six labels the level of their label',
  $q$SELECT string_agg(r.label || '=' || r.nivel, ' ' ORDER BY r.id)
       FROM public.dream_team_roles r
      WHERE r.id IN ('c6600000-0000-4000-8000-0000000000b1', 'c6600000-0000-4000-8000-0000000000b2',
                     'c6600000-0000-4000-8000-0000000000b3', 'c6600000-0000-4000-8000-0000000000b4',
                     'c6600000-0000-4000-8000-0000000000b5', 'c6600000-0000-4000-8000-0000000000b6')$q$,
  'Voluntario=voluntario Líder=lider Facilitador=lider Entrenador=lider Coordinador=coordinador Director=director');

SELECT pg_temp.assert_eq('c: the six labels mint today''s grants under dps',
  $q$SELECT string_agg(r.label || '=' || pg_temp.claves(r.id, 'dps'), ' ' ORDER BY r.id)
       FROM public.dream_team_roles r
      WHERE r.id IN ('c6600000-0000-4000-8000-0000000000b1', 'c6600000-0000-4000-8000-0000000000b2',
                     'c6600000-0000-4000-8000-0000000000b3', 'c6600000-0000-4000-8000-0000000000b4',
                     'c6600000-0000-4000-8000-0000000000b5', 'c6600000-0000-4000-8000-0000000000b6')$q$,
  'Voluntario=dps.team.serve,dream_team.serve'
  || ' Líder=dps.team.lead,dream_team.lead,dream_team.serve'
  || ' Facilitador=dps.team.lead,dream_team.lead,dream_team.serve'
  || ' Entrenador=dps.team.lead,dream_team.lead,dream_team.serve'
  || ' Coordinador=dps.team.lead,dream_team.coordinate,dream_team.serve'
  || ' Director=dps.team.director,dream_team.direct,dream_team.serve');

SELECT pg_temp.assert_eq('c: the six labels mint today''s grants under ninos',
  $q$SELECT string_agg(r.label || '=' || pg_temp.claves(r.id, 'ninos'), ' ' ORDER BY r.id)
       FROM public.dream_team_roles r
      WHERE r.id IN ('c6600000-0000-4000-8000-0000000000b1', 'c6600000-0000-4000-8000-0000000000b2',
                     'c6600000-0000-4000-8000-0000000000b3', 'c6600000-0000-4000-8000-0000000000b4',
                     'c6600000-0000-4000-8000-0000000000b5', 'c6600000-0000-4000-8000-0000000000b6')$q$,
  'Voluntario=dream_team.serve,ninos.team.serve'
  || ' Líder=dream_team.lead,dream_team.serve,ninos.team.serve'
  || ' Facilitador=dream_team.lead,dream_team.serve,ninos.team.serve'
  || ' Entrenador=dream_team.lead,dream_team.serve,ninos.team.serve'
  || ' Coordinador=dream_team.coordinate,dream_team.serve,ninos.team.serve'
  || ' Director=dream_team.direct,dream_team.serve,ninos.team.serve');

SELECT pg_temp.assert_eq('c: the six labels mint by their rol what their label alone mints',
  $q$SELECT count(*)
       FROM public.dream_team_roles r
      CROSS JOIN unnest(ARRAY['dps', 'global_music', 'estudiantes', 'talleres_crecimiento', 'ninos', 'the_living_room', 'experiencia']) AS e(experiencia)
      WHERE r.id IN ('c6600000-0000-4000-8000-0000000000b1', 'c6600000-0000-4000-8000-0000000000b2',
                     'c6600000-0000-4000-8000-0000000000b3', 'c6600000-0000-4000-8000-0000000000b4',
                     'c6600000-0000-4000-8000-0000000000b5', 'c6600000-0000-4000-8000-0000000000b6')
        AND pg_temp.claves(r.id, e.experiencia)
            IS DISTINCT FROM pg_temp.claves('c6600000-0000-4000-8000-0000000000ff', e.experiencia, r.label)$q$,
  '0');

-- ── d. the "Líder de grupo" exception ───────────────────────────────

SELECT pg_temp.assert_eq('d: "Líder de grupo" with nivel lider leads and adds dream_team.gdv.lead',
  $q$SELECT pg_temp.claves('c6600000-0000-4000-8000-0000000000a5', 'estudiantes')$q$,
  'dream_team.gdv.lead,dream_team.lead,dream_team.serve,estudiantes.team.lead');

SELECT pg_temp.assert_eq('d: dream_team.gdv.lead is scoped to the rol, in grupos_vida',
  $q$SELECT g.experience || '/' || g.scope_type || '/' || g.scope_id
       FROM public.dream_team_grants_de_servicio('c6600000-0000-4000-8000-000000000001'::uuid, 'dps',
              'c6600000-0000-4000-8000-0000000000a5'::uuid, 'Líder de grupo') g
      WHERE g.capability_key = 'dream_team.gdv.lead'$q$,
  'grupos_vida/grupo/c6600000-0000-4000-8000-0000000000a5');

UPDATE public.dream_team_roles SET nivel = 'voluntario' WHERE id = 'c6600000-0000-4000-8000-0000000000a5';

SELECT pg_temp.assert_eq('d: "Líder de grupo" with nivel voluntario still adds dream_team.gdv.lead',
  $q$SELECT pg_temp.claves('c6600000-0000-4000-8000-0000000000a5', 'estudiantes')$q$,
  'dream_team.gdv.lead,dream_team.serve,estudiantes.team.serve');

UPDATE public.dream_team_roles SET nivel = 'lider' WHERE id = 'c6600000-0000-4000-8000-0000000000a5';

SELECT pg_temp.assert_eq('d: no other rol gets dream_team.gdv.lead',
  $q$SELECT count(*)
       FROM public.dream_team_roles r
      CROSS JOIN LATERAL public.dream_team_grants_de_servicio(
        'c6600000-0000-4000-8000-000000000001'::uuid, 'estudiantes', r.id, r.label) g
      WHERE r.equipo_id = 'c6600000-0000-4000-8000-000000000001'
        AND r.id <> 'c6600000-0000-4000-8000-0000000000a5'
        AND g.capability_key = 'dream_team.gdv.lead'$q$,
  '0');

-- ── e. a rol id with no row falls back to the level of its label ────

SELECT pg_temp.assert_eq('e: without a rol row, a free label serves and "Coordinador" coordinates',
  $q$SELECT pg_temp.claves('c6600000-0000-4000-8000-0000000000ff', 'dps', 'Guía') || ' | '
         || pg_temp.claves('c6600000-0000-4000-8000-0000000000ff', 'dps', 'coordinador')$q$,
  'dps.team.serve,dream_team.serve | dps.team.lead,dream_team.coordinate,dream_team.serve');

-- ── f. privileges and shape ─────────────────────────────────────────

SELECT pg_temp.assert_eq('f: same signature and result columns, SECURITY INVOKER, STABLE, search_path set',
  $q$SELECT pg_get_function_result(p.oid) || ' ' || p.prosecdef::text || ' ' || p.provolatile::text || ' '
            || (p.proconfig IS NOT NULL AND EXISTS (
                  SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))::text
       FROM pg_proc p
      WHERE p.oid = 'public.dream_team_grants_de_servicio(uuid,text,uuid,text)'::regprocedure$q$,
  'TABLE(capability_key text, experience text, scope_type text, scope_id text) false s true');

SELECT pg_temp.assert_eq('f: EXECUTE for service_role only, not PUBLIC, anon or authenticated',
  $q$SELECT concat_ws(' ',
       has_function_privilege('service_role', 'public.dream_team_grants_de_servicio(uuid,text,uuid,text)', 'EXECUTE'),
       has_function_privilege('anon', 'public.dream_team_grants_de_servicio(uuid,text,uuid,text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.dream_team_grants_de_servicio(uuid,text,uuid,text)', 'EXECUTE'),
       EXISTS (SELECT 1
                 FROM pg_proc p
                CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = 'public.dream_team_grants_de_servicio(uuid,text,uuid,text)'::regprocedure
                  AND a.grantee = 0))$q$,
  -- concat_ws renders booleans as t/f.
  't f f f');

-- The helpers run as authenticated here; grant them explicitly, since a
-- default ACL may keep new functions (temp ones too) from PUBLIC.
GRANT INSERT, SELECT ON t_gn_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_raises(text, text, text) TO authenticated;

SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_raises('f: an authenticated session cannot execute the function',
  $q$SELECT * FROM public.dream_team_grants_de_servicio('c6600000-0000-4000-8000-000000000001'::uuid, 'dps',
       'c6600000-0000-4000-8000-0000000000a2'::uuid, 'Guía')$q$,
  '42501');

RESET ROLE;

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_gn_failures;

ROLLBACK;
