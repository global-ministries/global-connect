-- T1 (odd/tasks/gdv-directores-alcance.md) — the single rule that decides which
-- groups a director general sees: gdv_dg_ve_grupo / gdv_dg_grupos_visibles,
-- driven by director_general_segmentos.alcance.
--
-- Covers:
--   1. Existing director_general_segmentos rows default to alcance 'segmento'.
--   2. The check constraint only admits 'segmento' and 'directores'.
--   3. Scope 'segmento' sees every group of the segment, including one with no
--      director de etapa.
--   4. Scope 'directores' sees only the groups of the director de etapa marked
--      for that director general (dg_directores_etapa) in the same segment.
--   5. A director de etapa marked for the person but belonging to ANOTHER
--      segment contributes nothing, even when a group of the assigned segment
--      is linked to them.
--   6. A director general with no rows sees nothing; a group in a segment that
--      is not assigned is not visible.
--   7. The boolean helper and the set helper agree.
--   8. anon and authenticated cannot execute the helpers.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture rows
-- live under this file's own d1000000-... namespace. The last statement is a
-- SELECT of the failing cases (empty = all ok), because the MCP tool returns
-- only the last result-producing statement.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_alc_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_alc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate(p_case text, p_sql text, p_expected_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got no exception');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

-- Existing rows keep their meaning: the column default must have filled them.
-- Measured before the fixtures so only real rows are counted.
SELECT pg_temp.assert_eq(
  'existing rows default to segmento',
  $q$SELECT count(*) FROM public.director_general_segmentos WHERE alcance IS DISTINCT FROM 'segmento'$q$,
  '0');

-- Fixtures (as postgres).
-- Segments: SA scope 'segmento', SB scope 'directores', SC not assigned.
INSERT INTO public.segmentos (id, nombre) VALUES
  ('d1000000-0000-4000-8000-0000000000a1', 'ZZ Alc SA'),
  ('d1000000-0000-4000-8000-0000000000a2', 'ZZ Alc SB'),
  ('d1000000-0000-4000-8000-0000000000a3', 'ZZ Alc SC');

-- People: two director general, four directores de etapa (DA in SA, DB1/DB2 in
-- SB, DX in SC).
INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'ZZ Alc', 'DG uno',  'Otro', 'Soltero'),
  ('d1000000-0000-4000-8000-000000000002', 'ZZ Alc', 'DG vacio', 'Otro', 'Soltero'),
  ('d1000000-0000-4000-8000-000000000011', 'ZZ Alc', 'Dir DA',  'Otro', 'Soltero'),
  ('d1000000-0000-4000-8000-000000000012', 'ZZ Alc', 'Dir DB1', 'Otro', 'Soltero'),
  ('d1000000-0000-4000-8000-000000000013', 'ZZ Alc', 'Dir DB2', 'Otro', 'Soltero'),
  ('d1000000-0000-4000-8000-000000000014', 'ZZ Alc', 'Dir DX',  'Otro', 'Soltero');

INSERT INTO public.segmento_lideres (id, segmento_id, usuario_id, tipo_lider) VALUES
  ('d1000000-0000-4000-8000-0000000000b1', 'd1000000-0000-4000-8000-0000000000a1', 'd1000000-0000-4000-8000-000000000011', 'director_etapa'),
  ('d1000000-0000-4000-8000-0000000000b2', 'd1000000-0000-4000-8000-0000000000a2', 'd1000000-0000-4000-8000-000000000012', 'director_etapa'),
  ('d1000000-0000-4000-8000-0000000000b3', 'd1000000-0000-4000-8000-0000000000a2', 'd1000000-0000-4000-8000-000000000013', 'director_etapa'),
  ('d1000000-0000-4000-8000-0000000000b4', 'd1000000-0000-4000-8000-0000000000a3', 'd1000000-0000-4000-8000-000000000014', 'director_etapa');

-- Groups. GA1 has a director, GA2 has none; GB1..GB4 in SB; GC1 in SC.
INSERT INTO public.grupos (id, nombre, temporada_id, segmento_id) VALUES
  ('d1000000-0000-4000-8000-0000000000c1', 'ZZ Alc GA1', (SELECT id FROM public.temporadas LIMIT 1), 'd1000000-0000-4000-8000-0000000000a1'),
  ('d1000000-0000-4000-8000-0000000000c2', 'ZZ Alc GA2', (SELECT id FROM public.temporadas LIMIT 1), 'd1000000-0000-4000-8000-0000000000a1'),
  ('d1000000-0000-4000-8000-0000000000c3', 'ZZ Alc GB1', (SELECT id FROM public.temporadas LIMIT 1), 'd1000000-0000-4000-8000-0000000000a2'),
  ('d1000000-0000-4000-8000-0000000000c4', 'ZZ Alc GB2', (SELECT id FROM public.temporadas LIMIT 1), 'd1000000-0000-4000-8000-0000000000a2'),
  ('d1000000-0000-4000-8000-0000000000c5', 'ZZ Alc GB3', (SELECT id FROM public.temporadas LIMIT 1), 'd1000000-0000-4000-8000-0000000000a2'),
  ('d1000000-0000-4000-8000-0000000000c6', 'ZZ Alc GB4', (SELECT id FROM public.temporadas LIMIT 1), 'd1000000-0000-4000-8000-0000000000a2'),
  ('d1000000-0000-4000-8000-0000000000c7', 'ZZ Alc GC1', (SELECT id FROM public.temporadas LIMIT 1), 'd1000000-0000-4000-8000-0000000000a3');

-- Who directs what. GB4 (segment SB) is linked to DX, a director de etapa of SC:
-- that pairing is inconsistent data and must never open the group to a person
-- who only marked DX.
INSERT INTO public.director_etapa_grupos (director_etapa_id, grupo_id) VALUES
  ('d1000000-0000-4000-8000-0000000000b1', 'd1000000-0000-4000-8000-0000000000c1'),
  ('d1000000-0000-4000-8000-0000000000b2', 'd1000000-0000-4000-8000-0000000000c3'),
  ('d1000000-0000-4000-8000-0000000000b3', 'd1000000-0000-4000-8000-0000000000c4'),
  ('d1000000-0000-4000-8000-0000000000b4', 'd1000000-0000-4000-8000-0000000000c6'),
  ('d1000000-0000-4000-8000-0000000000b4', 'd1000000-0000-4000-8000-0000000000c7');

-- DG uno: SA with the whole segment, SB only for the marked directors.
INSERT INTO public.director_general_segmentos (usuario_id, segmento_id, alcance) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000a1', 'segmento'),
  ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000a2', 'directores');

-- DG uno marks DA (SA, ignored by scope 'segmento'), DB1 (SB) and DX (SC, a
-- director of a segment DG uno does not hold). DB2 is left unmarked.
INSERT INTO public.dg_directores_etapa (dg_usuario_id, segmento_lider_id) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000b1'),
  ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000b2'),
  ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000b4');

-- Cases ----------------------------------------------------------------------

-- 2. Check constraint.
SELECT pg_temp.assert_sqlstate(
  'alcance rejects another value',
  $q$UPDATE public.director_general_segmentos SET alcance = 'todo' WHERE usuario_id = 'd1000000-0000-4000-8000-000000000001'$q$,
  '23514');
SELECT pg_temp.assert_sqlstate(
  'alcance rejects null',
  $q$UPDATE public.director_general_segmentos SET alcance = NULL WHERE usuario_id = 'd1000000-0000-4000-8000-000000000001'$q$,
  '23502');

-- 3. Scope 'segmento': the whole segment, with and without a director.
SELECT pg_temp.assert_eq('segmento: group with director',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000c1')$q$, 'true');
SELECT pg_temp.assert_eq('segmento: group without director',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000c2')$q$, 'true');

-- 4. Scope 'directores': only the marked director's groups.
SELECT pg_temp.assert_eq('directores: marked director group',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000c3')$q$, 'true');
SELECT pg_temp.assert_eq('directores: unmarked director group',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000c4')$q$, 'false');
SELECT pg_temp.assert_eq('directores: group without director',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000c5')$q$, 'false');

-- 5. A marked director of another segment contributes nothing.
SELECT pg_temp.assert_eq('directores: marked director of another segment',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000c6')$q$, 'false');

-- 6. Segment not assigned; person with no rows.
SELECT pg_temp.assert_eq('segment not assigned',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000c7')$q$, 'false');
SELECT pg_temp.assert_eq('person without rows sees nothing (boolean)',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-0000000000c1')$q$, 'false');
SELECT pg_temp.assert_eq('person without rows sees nothing (set)',
  $q$SELECT count(*) FROM public.gdv_dg_grupos_visibles('d1000000-0000-4000-8000-000000000002')$q$, '0');

-- 7. Both helpers agree, and the visible set is exactly GA1, GA2, GB1.
SELECT pg_temp.assert_eq('set helper returns the expected groups',
  $q$SELECT string_agg(g::text, ',' ORDER BY g) FROM public.gdv_dg_grupos_visibles('d1000000-0000-4000-8000-000000000001') g$q$,
  'd1000000-0000-4000-8000-0000000000c1,d1000000-0000-4000-8000-0000000000c2,d1000000-0000-4000-8000-0000000000c3');
SELECT pg_temp.assert_eq('boolean and set helpers agree on every fixture group',
  $q$SELECT count(*) FROM public.grupos g
      WHERE g.nombre LIKE 'ZZ Alc %'
        AND public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', g.id)
            IS DISTINCT FROM (g.id IN (SELECT public.gdv_dg_grupos_visibles('d1000000-0000-4000-8000-000000000001')))$q$,
  '0');

-- Flipping the scope flips the answer for the same person.
UPDATE public.director_general_segmentos SET alcance = 'directores'
 WHERE usuario_id = 'd1000000-0000-4000-8000-000000000001' AND segmento_id = 'd1000000-0000-4000-8000-0000000000a1';
SELECT pg_temp.assert_eq('scope flipped to directores: unmarked group of SA hidden',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000c2')$q$, 'false');
SELECT pg_temp.assert_eq('scope flipped to directores: marked director of SA visible',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000c1')$q$, 'true');
UPDATE public.director_general_segmentos SET alcance = 'segmento'
 WHERE usuario_id = 'd1000000-0000-4000-8000-000000000001' AND segmento_id = 'd1000000-0000-4000-8000-0000000000a2';
SELECT pg_temp.assert_eq('scope flipped to segmento: unmarked group of SB visible',
  $q$SELECT public.gdv_dg_ve_grupo('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-0000000000c5')$q$, 'true');

-- 8. Privileges: only security definer callers may use the helpers.
SELECT pg_temp.assert_eq('anon cannot execute gdv_dg_ve_grupo',
  $q$SELECT has_function_privilege('anon', 'public.gdv_dg_ve_grupo(uuid,uuid)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('authenticated cannot execute gdv_dg_ve_grupo',
  $q$SELECT has_function_privilege('authenticated', 'public.gdv_dg_ve_grupo(uuid,uuid)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('anon cannot execute gdv_dg_grupos_visibles',
  $q$SELECT has_function_privilege('anon', 'public.gdv_dg_grupos_visibles(uuid)', 'execute')$q$, 'false');
SELECT pg_temp.assert_eq('authenticated cannot execute gdv_dg_grupos_visibles',
  $q$SELECT has_function_privilege('authenticated', 'public.gdv_dg_grupos_visibles(uuid)', 'execute')$q$, 'false');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_alc_failures;

ROLLBACK;
