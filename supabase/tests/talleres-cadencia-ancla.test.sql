-- T1 (odd/tasks/proximo-paso.md, S1 + S2) — RED->GREEN for the cadencia
-- anchor: a régimen=cadencia taller can anchor its ediciones to the first
-- Sunday of each month (talleres.ancla_ediciones = 'primer_domingo_mes')
-- instead of spacing them every intervalo_ediciones_dias, and Próximo
-- Paso is configured that way with its 4 named clases. Run against
-- STAGING inside BEGIN…ROLLBACK — nothing here is kept; every fixture id
-- lives under this file's own c7a00000-... namespace. 'e524ea89-d3a7-
-- 45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) is referenced read-only
-- as a parent equipo, like every other talleres fixture test. Próximo
-- Paso itself is looked up by slug ('proximo-paso'), never by id.
--
-- Fixtures:
--   equipo_x/taller_x (c7a…01/c7a…10) — cadencia, anchored, intervalo
--     NULL, 4 plantilla clases (cadencia_dias 7 default).
--   equipo_y/taller_y (c7a…02/c7a…11) — cadencia, NOT anchored,
--     intervalo 28 (today's behavior, pinned).
--   equipo_z/taller_z (c7a…03/c7a…12) — cadencia, NOT anchored,
--     intervalo NULL (SIN_INTERVALO still applies).
--   director (c7a…31) — director.write + director.read on the three
--     fixture nodes AND on Próximo Paso's own node.
--
-- Cases:
--   (a) anchored X from 2026-10-04 with p_adelantar=3 → 4 ediciones on
--       2026-10-04 / 2026-11-01 / 2026-12-06 / 2027-01-03, one per month,
--       named Octubre 2026 / Noviembre 2026 / Diciembre 2026 / Enero 2027;
--       the first ends 2026-10-25 (4 clases × 7 días).
--   (b) anchored X with a second Sunday (2026-10-11) → P0001
--       FECHA_NO_ES_PRIMER_DOMINGO; a Saturday (2026-10-03) too.
--   (c) unanchored Y from 2026-10-04 with p_adelantar=2 → unchanged:
--       2026-10-04 / 2026-11-01 / 2026-11-29 ('Noviembre 2026 (29)').
--   (d) unanchored Z with p_adelantar=1 → SIN_INTERVALO still.
--   (e) CHECKs: unknown anchor value, anchor on régimen=temporada, and
--       anchor together with intervalo_ediciones_dias → 23514.
--   (f) Próximo Paso: anchored, cadencia_dias 7, cierre offset 0,
--       intervalo NULL.
--   (g) Próximo Paso's active plantilla is exactly Sígueme, Intimidad con
--       Dios, Compañerismo, Influencia (numero 1..4, in that order).
--   (h) dry run on Próximo Paso (one fixture plantilla grupo added in this
--       transaction) from 2026-12-06 with p_adelantar=3 → 2026-12-06 /
--       2027-01-03 / 2027-02-07 / 2027-03-07, and the first edición's
--       grupo gets the 4 clases with those names on consecutive Sundays.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ca_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ca_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ca_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate_msg(p_case text, p_sql text, p_expected_sqlstate text, p_expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got no exception');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate OR SQLERRM IS DISTINCT FROM p_expected_message THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
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

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
  IF v_n IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s), got ' || v_n);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_ca_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- Since 20261003110000 new postgres functions carry no PUBLIC EXECUTE, and these helpers run under SET LOCAL ROLE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

CREATE TEMP TABLE t_ca_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ca_fixture TO authenticated;

CREATE TEMP TABLE t_ca_resultado (key text PRIMARY KEY, valor jsonb NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ca_resultado TO authenticated;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('c7a00000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ CA Equipo X', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('c7a00000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ CA Equipo Y', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('c7a00000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ CA Equipo Z', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

-- Taller X goes in without the anchor and gets it in its own UPDATE so a
-- missing column fails only the anchored cases, not the whole file.
INSERT INTO public.talleres (
  id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen,
  cierre_inscripcion_offset_dias, intervalo_ediciones_dias
) VALUES
  ('c7a00000-0000-4000-8000-000000000010', 'zz-ca-fixture-x', 'ZZ CA Fixture Taller X',
   'c7a00000-0000-4000-8000-000000000001', 'individual', NULL, 'cadencia', 0, NULL),
  ('c7a00000-0000-4000-8000-000000000011', 'zz-ca-fixture-y', 'ZZ CA Fixture Taller Y',
   'c7a00000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 0, 28),
  ('c7a00000-0000-4000-8000-000000000012', 'zz-ca-fixture-z', 'ZZ CA Fixture Taller Z',
   'c7a00000-0000-4000-8000-000000000003', 'individual', NULL, 'cadencia', 0, NULL);

DO $ancla_x$
BEGIN
  EXECUTE $sql$UPDATE public.talleres SET ancla_ediciones = 'primer_domingo_mes'
                WHERE id = 'c7a00000-0000-4000-8000-000000000010'$sql$;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('fixture: anchor taller X', SQLSTATE || ' ' || SQLERRM);
END;
$ancla_x$;

INSERT INTO public.taller_plantilla_clases (taller_id, numero, tema) VALUES
  ('c7a00000-0000-4000-8000-000000000010', 1, 'ZZ CA X Clase 1'),
  ('c7a00000-0000-4000-8000-000000000010', 2, 'ZZ CA X Clase 2'),
  ('c7a00000-0000-4000-8000-000000000010', 3, 'ZZ CA X Clase 3'),
  ('c7a00000-0000-4000-8000-000000000010', 4, 'ZZ CA X Clase 4'),
  ('c7a00000-0000-4000-8000-000000000011', 1, 'ZZ CA Y Clase 1'),
  ('c7a00000-0000-4000-8000-000000000011', 2, 'ZZ CA Y Clase 2'),
  ('c7a00000-0000-4000-8000-000000000011', 3, 'ZZ CA Y Clase 3'),
  ('c7a00000-0000-4000-8000-000000000011', 4, 'ZZ CA Y Clase 4');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('c7a00000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'ca-fixture-director@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('c7a00000-0000-4000-8000-000000000031', 'c7a00000-0000-4000-8000-000000000030', 'ZZ CA', 'Director', 'ca-fixture-director@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT 'c7a00000-0000-4000-8000-000000000031', k.capability_key, 'talleres_crecimiento', 'taller', e.equipo_id
FROM (VALUES
        ('c7a00000-0000-4000-8000-000000000001'::uuid),
        ('c7a00000-0000-4000-8000-000000000002'::uuid),
        ('c7a00000-0000-4000-8000-000000000003'::uuid)
     ) AS e(equipo_id)
CROSS JOIN (VALUES ('talleres_crecimiento.director.write'), ('talleres_crecimiento.director.read')) AS k(capability_key);

INSERT INTO t_ca_fixture (key, id)
SELECT 'pp_taller', id FROM public.talleres WHERE slug = 'proximo-paso';
INSERT INTO t_ca_fixture (key, id)
SELECT 'pp_equipo', dream_team_equipo_id FROM public.talleres WHERE slug = 'proximo-paso';

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT 'c7a00000-0000-4000-8000-000000000031', k.capability_key, 'talleres_crecimiento', 'taller', f.id
FROM t_ca_fixture f
CROSS JOIN (VALUES ('talleres_crecimiento.director.write'), ('talleres_crecimiento.director.read')) AS k(capability_key)
WHERE f.key = 'pp_equipo';

-- One plantilla grupo for Próximo Paso, only inside this transaction, so
-- the dry run (h) instantiates clases we can read back.
INSERT INTO public.taller_plantilla_grupos (taller_id, nombre, orden, capacidad)
SELECT id, 'ZZ CA Grupo Dry Run', 999, 12 FROM t_ca_fixture WHERE key = 'pp_taller';

-- ══ (e) CHECKs on talleres.ancla_ediciones (as postgres) ══

SELECT pg_temp.assert_sqlstate('(e) an unknown anchor value is refused',
  $$UPDATE public.talleres SET ancla_ediciones = 'ultimo_domingo_mes' WHERE id = 'c7a00000-0000-4000-8000-000000000012'$$,
  '23514');
SELECT pg_temp.assert_sqlstate('(e) an anchor on a régimen=temporada taller is refused',
  $$UPDATE public.talleres SET regimen = 'temporada', ancla_ediciones = 'primer_domingo_mes' WHERE id = 'c7a00000-0000-4000-8000-000000000012'$$,
  '23514');
SELECT pg_temp.assert_sqlstate('(e) an anchor together with intervalo_ediciones_dias is refused',
  $$UPDATE public.talleres SET ancla_ediciones = 'primer_domingo_mes' WHERE id = 'c7a00000-0000-4000-8000-000000000011'$$,
  '23514');

-- ══ (f) Próximo Paso's configuration ══

SELECT pg_temp.assert_rows('(f) Próximo Paso exists (slug proximo-paso)',
  $$SELECT 1 FROM t_ca_fixture WHERE key = 'pp_taller'$$, 1);
SELECT pg_temp.assert_rows('(f) Próximo Paso is anchored to the first Sunday, weekly clases, cierre 0, no intervalo',
  $$SELECT 1 FROM public.talleres
     WHERE slug = 'proximo-paso'
       AND regimen = 'cadencia'
       AND ancla_ediciones = 'primer_domingo_mes'
       AND cadencia_dias = 7
       AND cierre_inscripcion_offset_dias = 0
       AND intervalo_ediciones_dias IS NULL$$, 1);

-- ══ (g) Próximo Paso's 4 clases ══

SELECT pg_temp.assert_rows('(g) Próximo Paso has exactly 4 active plantilla clases',
  $$SELECT 1 FROM public.taller_plantilla_clases c
      JOIN public.talleres t ON t.id = c.taller_id
     WHERE t.slug = 'proximo-paso' AND c.activo$$, 4);
SELECT pg_temp.assert_rows('(g) the 4 clases are Sígueme, Intimidad con Dios, Compañerismo, Influencia in order',
  $$SELECT 1 FROM (
      SELECT string_agg(c.tema, ' | ' ORDER BY c.numero) AS temas,
             array_agg(c.numero ORDER BY c.numero) AS numeros
        FROM public.taller_plantilla_clases c
        JOIN public.talleres t ON t.id = c.taller_id
       WHERE t.slug = 'proximo-paso' AND c.activo
    ) s
    WHERE s.temas = 'Sígueme | Intimidad con Dios | Compañerismo | Influencia'
      AND s.numeros = ARRAY[1, 2, 3, 4]$$, 1);

-- ══ (a) anchored X: one edición per month on its first Sunday ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('c7a00000-0000-4000-8000-000000000030');

DO $a$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_crear_edicion(
    'c7a00000-0000-4000-8000-000000000010', DATE '2026-10-04', NULL, 3
  );
  INSERT INTO t_ca_resultado (key, valor) VALUES ('a', v_resultado);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('(a) anchored X with p_adelantar=3', 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$a$;

SELECT pg_temp.assert_rows('(a) exactly 4 ediciones',
  $$SELECT 1 FROM t_ca_resultado WHERE key = 'a' AND jsonb_array_length(valor -> 'ediciones') = 4$$, 1);
SELECT pg_temp.assert_rows('(a) first Sundays 2026-10-04, 2026-11-01, 2026-12-06, 2027-01-03',
  $$SELECT 1 FROM t_ca_resultado
     WHERE key = 'a'
       AND (valor -> 'ediciones' -> 0 ->> 'fecha_inicio')::date = DATE '2026-10-04'
       AND (valor -> 'ediciones' -> 1 ->> 'fecha_inicio')::date = DATE '2026-11-01'
       AND (valor -> 'ediciones' -> 2 ->> 'fecha_inicio')::date = DATE '2026-12-06'
       AND (valor -> 'ediciones' -> 3 ->> 'fecha_inicio')::date = DATE '2027-01-03'$$, 1);
SELECT pg_temp.assert_rows('(a) one name per month, no disambiguation needed',
  $$SELECT 1 FROM t_ca_resultado
     WHERE key = 'a'
       AND (valor -> 'ediciones' -> 0 ->> 'nombre') = 'Octubre 2026'
       AND (valor -> 'ediciones' -> 1 ->> 'nombre') = 'Noviembre 2026'
       AND (valor -> 'ediciones' -> 2 ->> 'nombre') = 'Diciembre 2026'
       AND (valor -> 'ediciones' -> 3 ->> 'nombre') = 'Enero 2027'$$, 1);
SELECT pg_temp.assert_rows('(a) the first edición ends 2026-10-25 and closes inscripción 2026-10-04',
  $$SELECT 1 FROM t_ca_resultado
     WHERE key = 'a'
       AND (valor -> 'ediciones' -> 0 ->> 'fecha_fin')::date = DATE '2026-10-25'
       AND (valor -> 'ediciones' -> 0 ->> 'cierre_inscripcion')::date = DATE '2026-10-04'$$, 1);

-- ══ (b) anchored X: the first clase must itself be a first Sunday ══

SELECT pg_temp.assert_sqlstate_msg('(b) a second Sunday is refused',
  $$SELECT public.talleres_crear_edicion('c7a00000-0000-4000-8000-000000000010', DATE '2026-10-11', NULL, 0)$$,
  'P0001', 'FECHA_NO_ES_PRIMER_DOMINGO');
SELECT pg_temp.assert_sqlstate_msg('(b) a Saturday in the first week is refused',
  $$SELECT public.talleres_crear_edicion('c7a00000-0000-4000-8000-000000000010', DATE '2026-10-03', NULL, 0)$$,
  'P0001', 'FECHA_NO_ES_PRIMER_DOMINGO');

-- ══ (c) unanchored Y: unchanged, every intervalo_ediciones_dias ══

DO $c$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_crear_edicion(
    'c7a00000-0000-4000-8000-000000000011', DATE '2026-10-04', NULL, 2
  );
  INSERT INTO t_ca_resultado (key, valor) VALUES ('c', v_resultado);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('(c) unanchored Y with p_adelantar=2', 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$c$;

SELECT pg_temp.assert_rows('(c) unanchored: 2026-10-04, 2026-11-01, 2026-11-29 named as today',
  $$SELECT 1 FROM t_ca_resultado
     WHERE key = 'c'
       AND jsonb_array_length(valor -> 'ediciones') = 3
       AND (valor -> 'ediciones' -> 0 ->> 'fecha_inicio')::date = DATE '2026-10-04'
       AND (valor -> 'ediciones' -> 1 ->> 'fecha_inicio')::date = DATE '2026-11-01'
       AND (valor -> 'ediciones' -> 2 ->> 'fecha_inicio')::date = DATE '2026-11-29'
       AND (valor -> 'ediciones' -> 0 ->> 'nombre') = 'Octubre 2026'
       AND (valor -> 'ediciones' -> 1 ->> 'nombre') = 'Noviembre 2026'
       AND (valor -> 'ediciones' -> 2 ->> 'nombre') = 'Noviembre 2026 (29)'$$, 1);
SELECT pg_temp.assert_rows('(c) unanchored: any weekday is still accepted',
  $$SELECT 1 FROM (SELECT public.talleres_crear_edicion('c7a00000-0000-4000-8000-000000000011', DATE '2027-06-16', NULL, 0) AS r) s
     WHERE (s.r -> 'ediciones' -> 0 ->> 'fecha_inicio')::date = DATE '2027-06-16'$$, 1);

-- ══ (d) unanchored Z: SIN_INTERVALO still ══

SELECT pg_temp.assert_sqlstate_msg('(d) unanchored with no intervalo and p_adelantar=1 is refused',
  $$SELECT public.talleres_crear_edicion('c7a00000-0000-4000-8000-000000000012', DATE '2026-10-04', NULL, 1)$$,
  'P0001', 'SIN_INTERVALO');

-- ══ (h) dry run on Próximo Paso ══

DO $h$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_crear_edicion(
    (SELECT id FROM t_ca_fixture WHERE key = 'pp_taller'), DATE '2026-12-06', NULL, 3
  );
  INSERT INTO t_ca_resultado (key, valor) VALUES ('h', v_resultado);
  INSERT INTO t_ca_fixture (key, id) VALUES
    ('pp_grupo_1', (v_resultado -> 'ediciones' -> 0 -> 'grupos_creados' -> 0 ->> 'grupo_id')::uuid);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('(h) Próximo Paso dry run', 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
END;
$h$;

SELECT pg_temp.assert_rows('(h) Próximo Paso: 2026-12-06, 2027-01-03, 2027-02-07, 2027-03-07',
  $$SELECT 1 FROM t_ca_resultado
     WHERE key = 'h'
       AND jsonb_array_length(valor -> 'ediciones') = 4
       AND (valor -> 'ediciones' -> 0 ->> 'fecha_inicio')::date = DATE '2026-12-06'
       AND (valor -> 'ediciones' -> 1 ->> 'fecha_inicio')::date = DATE '2027-01-03'
       AND (valor -> 'ediciones' -> 2 ->> 'fecha_inicio')::date = DATE '2027-02-07'
       AND (valor -> 'ediciones' -> 3 ->> 'fecha_inicio')::date = DATE '2027-03-07'
       AND (valor -> 'ediciones' -> 0 ->> 'clases_por_grupo')::int = 4$$, 1);

-- taller_sesiones is read as postgres: this checks DB state, not RLS.
RESET ROLE;
SELECT pg_temp.assert_rows('(h) the first edición''s grupo has the 4 named clases on consecutive Sundays',
  $$SELECT 1 FROM (
      SELECT string_agg(s.tema || '@' || s.fecha_programada::text, ' | ' ORDER BY s.numero) AS clases
        FROM public.taller_sesiones s
       WHERE s.grupo_id = (SELECT id FROM t_ca_fixture WHERE key = 'pp_grupo_1')
    ) x
    WHERE x.clases = 'Sígueme@2026-12-06 | Intimidad con Dios@2026-12-13 | Compañerismo@2026-12-20 | Influencia@2026-12-27'$$, 1);

-- ══ structural — grants of talleres_crear_edicion ══

SELECT pg_temp.assert_rows('structural: talleres_crear_edicion has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_crear_edicion'
       AND NOT (p.proacl::text LIKE '%anon=%')
       AND p.proacl::text LIKE '%authenticated=X%'$$, 1);

SELECT pg_temp.report();

ROLLBACK;
