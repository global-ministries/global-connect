-- T1 (odd/tasks/talleres-inscripcion-a-grupo.md) — RED→GREEN for
-- taller_inscripciones.grupo_id, its cross-cohorte coherence trigger, and
-- talleres_asignar_inscripciones_a_grupo(). Run against STAGING inside
-- BEGIN…ROLLBACK — nothing here is kept; every fixture id lives under
-- this file's own a6000000-... namespace. 'e524ea89-d3a7-45fc-be00-
-- 5a6e7452434e' (Grupos de Corto Plazo) is referenced read-only as a
-- parent, the same real anchor other talleres fixture tests already use.
--
-- Covers acceptance criteria 1-6 of the task document:
--   1. Coordinator with scope assigns N aprobadas + a grupo of the same
--      edición → grupo_id set, response carries ocupación.
--   2. Same call with a grupo of ANOTHER cohorte fails
--      GRUPO_DE_OTRA_COHORTE — proven both through the RPC (as
--      coordinador) and by a direct UPDATE run as postgres, so the guard
--      is proven to live in the trigger, not in the function's own logic.
--   3. A pendiente inscripción cannot be placed (P0001
--      INSCRIPCION_NO_APROBADA); a retirado one keeps its grupo_id.
--   4. A coordinator of another branch cannot assign into this grupo —
--      same 42501 authorization convention as the paso-3 functions
--      (talleres_resolver_solicitud_retiro's 'sin_permisos_para_esta_
--      solicitud'), here 'sin_permisos_para_este_grupo'.
--   5. A member with zero talleres capability cannot execute the
--      function either.
--   6. Assigning past capacidad works and the response shows the excess
--      (ocupación > capacidad); nothing blocks it.
--
-- The MCP connection is `postgres`, which has BYPASSRLS — every
-- authorization assertion below runs under `SET LOCAL ROLE authenticated`
-- + request.jwt.claim.sub/role (same convention as
-- supabase/tests/talleres-t5-lider-lectura.test.sql). auth_id lookups for
-- fixtures are resolved BEFORE the first role switch.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t1_failures (case_name text) ON COMMIT DROP;
GRANT INSERT ON t1_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t1_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Runs p_sql (a full SELECT statement, dynamic) and expects it to raise
-- exactly p_expected_sqlstate.
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

-- Runs p_sql (a SELECT returning one jsonb value) and expects no
-- exception, then compares p_field of the result to p_expected (text).
CREATE OR REPLACE FUNCTION pg_temp.assert_jsonb_field(p_case text, p_sql text, p_field text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_result jsonb;
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_result;
  v_actual := v_result ->> p_field;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || p_field || '=' || p_expected || ', got ' || coalesce(v_result::text, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t1_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RAISE NOTICE 'all cases ok';
END;
$$;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('a6000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ T1 Equipo A', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('a6000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ T1 Equipo B', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('a6000000-0000-4000-8000-000000000010', 'zz-t1-fixture-a', 'ZZ T1 Fixture Taller A', 'a6000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-000000000011', 'zz-t1-fixture-b', 'ZZ T1 Fixture Taller B', 'a6000000-0000-4000-8000-000000000002');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('a6000000-0000-4000-8000-000000000020', 'authenticated', 'authenticated', 't1-fixture-director-a@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a6000000-0000-4000-8000-000000000022', 'authenticated', 'authenticated', 't1-fixture-coord-a@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a6000000-0000-4000-8000-000000000024', 'authenticated', 'authenticated', 't1-fixture-director-b@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a6000000-0000-4000-8000-000000000026', 'authenticated', 'authenticated', 't1-fixture-coord-b@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('a6000000-0000-4000-8000-000000000028', 'authenticated', 'authenticated', 't1-fixture-sin-permisos@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('a6000000-0000-4000-8000-000000000021', 'a6000000-0000-4000-8000-000000000020', 'T1', 'DirectorA', 't1-fixture-director-a@example.test', 'Soltero', 'Otro'),
  ('a6000000-0000-4000-8000-000000000023', 'a6000000-0000-4000-8000-000000000022', 'T1', 'CoordA', 't1-fixture-coord-a@example.test', 'Soltero', 'Otro'),
  ('a6000000-0000-4000-8000-000000000025', 'a6000000-0000-4000-8000-000000000024', 'T1', 'DirectorB', 't1-fixture-director-b@example.test', 'Soltero', 'Otro'),
  ('a6000000-0000-4000-8000-000000000027', 'a6000000-0000-4000-8000-000000000026', 'T1', 'CoordB', 't1-fixture-coord-b@example.test', 'Soltero', 'Otro'),
  ('a6000000-0000-4000-8000-000000000029', 'a6000000-0000-4000-8000-000000000028', 'T1', 'SinPermisos', 't1-fixture-sin-permisos@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- DirectorA/B get scoped director.write+read so this fixture can call
-- open_edicion; CoordA/B get coordinator.write on their own branch only.
-- SinPermisos gets nothing — that's the point of criterion 5.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('a6000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'a6000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-000000000021', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'a6000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-000000000023', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'a6000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-000000000025', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'a6000000-0000-4000-8000-000000000002'),
  ('a6000000-0000-4000-8000-000000000025', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'a6000000-0000-4000-8000-000000000002'),
  ('a6000000-0000-4000-8000-000000000027', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'a6000000-0000-4000-8000-000000000002');

CREATE TEMP TABLE t1_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT SELECT ON t1_fixture TO authenticated;

SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000020', true),
       set_config('request.jwt.claim.role', 'authenticated', true);

DO $ed$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'a6000000-0000-4000-8000-000000000010',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ T1 Fixture Edicion A', p_link_type => NULL,
    p_sesiones_estimadas => 1, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t1_fixture (key, id) VALUES
    ('edicionA', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorteA', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ed$;

SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000024', true),
       set_config('request.jwt.claim.role', 'authenticated', true);

DO $ed$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'a6000000-0000-4000-8000-000000000011',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ T1 Fixture Edicion B', p_link_type => NULL,
    p_sesiones_estimadas => 1, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t1_fixture (key, id) VALUES
    ('edicionB', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorteB', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ed$;

SELECT set_config('request.jwt.claim.sub', 'a6000000-0000-4000-8000-000000000020', true),
       set_config('request.jwt.claim.role', 'authenticated', true);

-- A SECOND edición/cohorte on the SAME branch (taller A) — needed to
-- prove criterion 2 for real: a grupo that is a different cohorte but
-- still inside coordinador A's own authorized node, so the failure is
-- unambiguously the coherence trigger (P0001), not the authority gate
-- (42501) a cross-branch grupo would hit first.
DO $ed$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.open_edicion(
    p_taller_id => 'a6000000-0000-4000-8000-000000000010',
    p_tipo => 'individual', p_nombre_edicion => 'ZZ T1 Fixture Edicion A2', p_link_type => NULL,
    p_sesiones_estimadas => 1, p_duracion_estimada_minutos => 60, p_modalidad_inscripcion => 'permanente_custom',
    p_fecha_inicio_periodo => now(), p_fecha_fin_periodo => NULL, p_firmantes => '[]'::jsonb, p_temporada_id => NULL
  );
  INSERT INTO t1_fixture (key, id) VALUES
    ('edicionA2', (v_resultado ->> 'edicion_id')::uuid),
    ('cohorteA2', (v_resultado ->> 'cohorte_id')::uuid);
END;
$ed$;

-- back to postgres for the rest of the fixture setup
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, estado, capacidad) VALUES
  ('a6000000-0000-4000-8000-000000000030', (SELECT id FROM t1_fixture WHERE key = 'cohorteA'), 'ZZ T1 Grupo A1', 'activo', 2),
  ('a6000000-0000-4000-8000-000000000031', (SELECT id FROM t1_fixture WHERE key = 'cohorteB'), 'ZZ T1 Grupo B1', 'activo', 10),
  ('a6000000-0000-4000-8000-000000000032', (SELECT id FROM t1_fixture WHERE key = 'cohorteA2'), 'ZZ T1 Grupo A2', 'activo', 10);

INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, unit_estado) VALUES
  ('a6000000-0000-4000-8000-000000000060', (SELECT id FROM t1_fixture WHERE key = 'edicionA'), (SELECT id FROM t1_fixture WHERE key = 'cohorteA'), 'a6000000-0000-4000-8000-000000000023', 'aprobado', NULL),
  ('a6000000-0000-4000-8000-000000000061', (SELECT id FROM t1_fixture WHERE key = 'edicionA'), (SELECT id FROM t1_fixture WHERE key = 'cohorteA'), 'a6000000-0000-4000-8000-000000000025', 'aprobado', NULL),
  ('a6000000-0000-4000-8000-000000000062', (SELECT id FROM t1_fixture WHERE key = 'edicionA'), (SELECT id FROM t1_fixture WHERE key = 'cohorteA'), 'a6000000-0000-4000-8000-000000000027', 'aprobado', NULL),
  ('a6000000-0000-4000-8000-000000000063', (SELECT id FROM t1_fixture WHERE key = 'edicionA'), (SELECT id FROM t1_fixture WHERE key = 'cohorteA'), 'a6000000-0000-4000-8000-000000000029', 'pendiente', NULL),
  ('a6000000-0000-4000-8000-000000000064', (SELECT id FROM t1_fixture WHERE key = 'edicionA'), (SELECT id FROM t1_fixture WHERE key = 'cohorteA'), 'a6000000-0000-4000-8000-000000000021', 'aprobado', NULL);

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- ══ Criterion 1 — coordinador A assigns 2 aprobadas into grupo A1 ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a6000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_jsonb_field('criterion 1: asignadas count',
  $$SELECT public.talleres_asignar_inscripciones_a_grupo(
      ARRAY['a6000000-0000-4000-8000-000000000060','a6000000-0000-4000-8000-000000000061']::uuid[],
      'a6000000-0000-4000-8000-000000000030'::uuid)$$,
  'asignadas', '2');

RESET ROLE;

SELECT pg_temp.assert_rows('criterion 1: grupo_id actually persisted (60)',
  $$SELECT 1 FROM public.taller_inscripciones WHERE id = 'a6000000-0000-4000-8000-000000000060' AND grupo_id = 'a6000000-0000-4000-8000-000000000030'$$, 1);
SELECT pg_temp.assert_rows('criterion 1: grupo_id actually persisted (61)',
  $$SELECT 1 FROM public.taller_inscripciones WHERE id = 'a6000000-0000-4000-8000-000000000061' AND grupo_id = 'a6000000-0000-4000-8000-000000000030'$$, 1);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a6000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_jsonb_field('criterion 1: ocupacion reflects both aprobadas',
  $$SELECT public.talleres_asignar_inscripciones_a_grupo(ARRAY['a6000000-0000-4000-8000-000000000060']::uuid[], 'a6000000-0000-4000-8000-000000000030'::uuid)$$,
  'ocupacion', '2');

RESET ROLE;

-- ══ Criterion 2 — a grupo of ANOTHER cohorte fails GRUPO_DE_OTRA_COHORTE,
-- both via the RPC and via a raw UPDATE run as postgres ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a6000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_sqlstate('criterion 2: RPC into grupo of another cohorte (same branch, so this is the trigger, not authority)',
  $$SELECT public.talleres_asignar_inscripciones_a_grupo(
      ARRAY['a6000000-0000-4000-8000-000000000062']::uuid[],
      'a6000000-0000-4000-8000-000000000032'::uuid)$$,
  'P0001');

RESET ROLE;

SELECT pg_temp.assert_sqlstate('criterion 2: raw UPDATE as postgres also blocked by the trigger',
  $$UPDATE public.taller_inscripciones SET grupo_id = 'a6000000-0000-4000-8000-000000000032' WHERE id = 'a6000000-0000-4000-8000-000000000062'$$,
  'P0001');

-- ══ Criterion 3 — pendiente cannot be placed; retirado keeps grupo_id ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a6000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_sqlstate('criterion 3: pendiente inscripcion rejected',
  $$SELECT public.talleres_asignar_inscripciones_a_grupo(
      ARRAY['a6000000-0000-4000-8000-000000000063']::uuid[],
      'a6000000-0000-4000-8000-000000000030'::uuid)$$,
  'P0001');

SELECT pg_temp.assert_jsonb_field('criterion 3: assign 64 before retiro',
  $$SELECT public.talleres_asignar_inscripciones_a_grupo(
      ARRAY['a6000000-0000-4000-8000-000000000064']::uuid[],
      'a6000000-0000-4000-8000-000000000030'::uuid)$$,
  'asignadas', '1');

RESET ROLE;

UPDATE public.taller_inscripciones SET estado = 'retirado', version = version + 1
WHERE id = 'a6000000-0000-4000-8000-000000000064';

SELECT pg_temp.assert_rows('criterion 3: retirado inscripcion keeps grupo_id',
  $$SELECT 1 FROM public.taller_inscripciones WHERE id = 'a6000000-0000-4000-8000-000000000064' AND grupo_id = 'a6000000-0000-4000-8000-000000000030' AND estado = 'retirado'$$, 1);

-- ══ Criterion 4 — coordinador of another branch cannot assign here ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a6000000-0000-4000-8000-000000000026');

SELECT pg_temp.assert_sqlstate('criterion 4: coordinador B cannot assign into grupo A1',
  $$SELECT public.talleres_asignar_inscripciones_a_grupo(
      ARRAY['a6000000-0000-4000-8000-000000000062']::uuid[],
      'a6000000-0000-4000-8000-000000000030'::uuid)$$,
  '42501');

RESET ROLE;

-- ══ Criterion 5 — a member with zero talleres capability cannot execute ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a6000000-0000-4000-8000-000000000028');

SELECT pg_temp.assert_sqlstate('criterion 5: sin-permisos member cannot execute',
  $$SELECT public.talleres_asignar_inscripciones_a_grupo(
      ARRAY['a6000000-0000-4000-8000-000000000062']::uuid[],
      'a6000000-0000-4000-8000-000000000030'::uuid)$$,
  '42501');

RESET ROLE;

-- ══ Criterion 6 — assigning past capacidad works; response shows the
-- excess (capacidad = 2, this puts a 3rd aprobada into the grupo) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('a6000000-0000-4000-8000-000000000022');

SELECT pg_temp.assert_jsonb_field('criterion 6: over-capacity assign is not blocked (asignadas)',
  $$SELECT public.talleres_asignar_inscripciones_a_grupo(
      ARRAY['a6000000-0000-4000-8000-000000000062']::uuid[],
      'a6000000-0000-4000-8000-000000000030'::uuid)$$,
  'asignadas', '1');

SELECT pg_temp.assert_jsonb_field('criterion 6: ocupacion (3) exceeds capacidad (2)',
  $$SELECT public.talleres_asignar_inscripciones_a_grupo(ARRAY['a6000000-0000-4000-8000-000000000062']::uuid[], 'a6000000-0000-4000-8000-000000000030'::uuid)$$,
  'ocupacion', '3');
SELECT pg_temp.assert_jsonb_field('criterion 6: capacidad still reported as 2',
  $$SELECT public.talleres_asignar_inscripciones_a_grupo(ARRAY['a6000000-0000-4000-8000-000000000062']::uuid[], 'a6000000-0000-4000-8000-000000000030'::uuid)$$,
  'capacidad', '2');

RESET ROLE;

SELECT pg_temp.report();

ROLLBACK;
