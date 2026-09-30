-- T4b (odd/tasks/gdv-directores-alcance.md) — gdv_dg_grupos_activos_visibles:
-- the groups of the single director general rule, restricted to active groups
-- in one call (the app used to fetch every visible id and filter with a long
-- IN list).
--
-- Covers:
--   1. An active group of an assigned segment is returned.
--   2. An inactive group and a soft-deleted group (activo = false, eliminado =
--      true) are not.
--   3. A group outside the scope (segment not assigned, or unmarked director
--      under scope 'directores') is not.
--   4. A person without rows gets nothing.
--   5. anon and authenticated cannot execute the function.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own d2000000-... namespace. The last statement is a
-- SELECT of the failing cases (empty = all ok), because the MCP tool returns
-- only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_act_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_act_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

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

-- Fixtures (as postgres). SA is held with scope 'segmento', SB with 'directores',
-- SC is not assigned.
INSERT INTO public.segmentos (id, nombre) VALUES
  ('d2000000-0000-4000-8000-0000000000a1', 'ZZ Act SA'),
  ('d2000000-0000-4000-8000-0000000000a2', 'ZZ Act SB'),
  ('d2000000-0000-4000-8000-0000000000a3', 'ZZ Act SC');

INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'ZZ Act', 'DG uno',   'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000002', 'ZZ Act', 'DG vacio', 'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000011', 'ZZ Act', 'Dir B1',   'Otro', 'Soltero'),
  ('d2000000-0000-4000-8000-000000000012', 'ZZ Act', 'Dir B2',   'Otro', 'Soltero');

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('d2000000-0000-4000-8000-0000000000b1', 'd2000000-0000-4000-8000-0000000000a2', 'd2000000-0000-4000-8000-000000000011', 'director_etapa'),
  ('d2000000-0000-4000-8000-0000000000b2', 'd2000000-0000-4000-8000-0000000000a2', 'd2000000-0000-4000-8000-000000000012', 'director_etapa');

-- SA: active, inactive, soft-deleted. SB: marked director active, unmarked
-- director active. SC: active but outside the scope.
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id, activo, eliminado) VALUES
  ('d2000000-0000-4000-8000-0000000000c1', 'ZZ Act SA activo',    (SELECT id FROM public.temporadas LIMIT 1), 'd2000000-0000-4000-8000-0000000000a1', true,  false),
  ('d2000000-0000-4000-8000-0000000000c2', 'ZZ Act SA inactivo',  (SELECT id FROM public.temporadas LIMIT 1), 'd2000000-0000-4000-8000-0000000000a1', false, false),
  ('d2000000-0000-4000-8000-0000000000c3', 'ZZ Act SA eliminado', (SELECT id FROM public.temporadas LIMIT 1), 'd2000000-0000-4000-8000-0000000000a1', false, true),
  ('d2000000-0000-4000-8000-0000000000c4', 'ZZ Act SB marcado',   (SELECT id FROM public.temporadas LIMIT 1), 'd2000000-0000-4000-8000-0000000000a2', true,  false),
  ('d2000000-0000-4000-8000-0000000000c5', 'ZZ Act SB sin marcar',(SELECT id FROM public.temporadas LIMIT 1), 'd2000000-0000-4000-8000-0000000000a2', true,  false),
  ('d2000000-0000-4000-8000-0000000000c6', 'ZZ Act SC activo',    (SELECT id FROM public.temporadas LIMIT 1), 'd2000000-0000-4000-8000-0000000000a3', true,  false);

INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('d2000000-0000-4000-8000-0000000000b1', 'd2000000-0000-4000-8000-0000000000c4'),
  ('d2000000-0000-4000-8000-0000000000b2', 'd2000000-0000-4000-8000-0000000000c5');

INSERT INTO public.director_general_segmentos (usuario_id, segmento_id, alcance) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-0000000000a1', 'segmento'),
  ('d2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-0000000000a2', 'directores');

INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-0000000000b1');

-- Cases ----------------------------------------------------------------------

-- 1-3. Exactly the active groups the rule shows: SA active + SB marked.
SELECT pg_temp.assert_eq('returns exactly the active groups in scope',
  $q$SELECT string_agg(g::text, ',' ORDER BY g)
       FROM public.gdv_dg_grupos_activos_visibles('d2000000-0000-4000-8000-000000000001') g$q$,
  'd2000000-0000-4000-8000-0000000000c1,d2000000-0000-4000-8000-0000000000c4');
SELECT pg_temp.assert_eq('active group of a whole-segment scope is returned',
  $q$SELECT count(*) FROM public.gdv_dg_grupos_activos_visibles('d2000000-0000-4000-8000-000000000001') g
      WHERE g = 'd2000000-0000-4000-8000-0000000000c1'$q$, '1');
SELECT pg_temp.assert_eq('inactive group is not returned',
  $q$SELECT count(*) FROM public.gdv_dg_grupos_activos_visibles('d2000000-0000-4000-8000-000000000001') g
      WHERE g = 'd2000000-0000-4000-8000-0000000000c2'$q$, '0');
SELECT pg_temp.assert_eq('deleted group is not returned',
  $q$SELECT count(*) FROM public.gdv_dg_grupos_activos_visibles('d2000000-0000-4000-8000-000000000001') g
      WHERE g = 'd2000000-0000-4000-8000-0000000000c3'$q$, '0');
SELECT pg_temp.assert_eq('unmarked director group is not returned',
  $q$SELECT count(*) FROM public.gdv_dg_grupos_activos_visibles('d2000000-0000-4000-8000-000000000001') g
      WHERE g = 'd2000000-0000-4000-8000-0000000000c5'$q$, '0');
SELECT pg_temp.assert_eq('group of a segment outside the scope is not returned',
  $q$SELECT count(*) FROM public.gdv_dg_grupos_activos_visibles('d2000000-0000-4000-8000-000000000001') g
      WHERE g = 'd2000000-0000-4000-8000-0000000000c6'$q$, '0');

-- 4. A person without rows gets nothing.
SELECT pg_temp.assert_eq('person without rows gets nothing',
  $q$SELECT count(*) FROM public.gdv_dg_grupos_activos_visibles('d2000000-0000-4000-8000-000000000002')$q$, '0');

-- 5. Privileges.
SELECT pg_temp.assert_eq('anon cannot execute gdv_dg_grupos_activos_visibles',
  $q$SELECT has_function_privilege('anon', 'public.gdv_dg_grupos_activos_visibles(uuid)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('authenticated cannot execute gdv_dg_grupos_activos_visibles',
  $q$SELECT has_function_privilege('authenticated', 'public.gdv_dg_grupos_activos_visibles(uuid)', 'execute')$q$, 'false');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_act_failures;

ROLLBACK;
