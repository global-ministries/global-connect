-- T3 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — RED->GREEN
-- for "temporadas por dirección": talleres_temporadas.dream_team_equipo_id,
-- the scoped RLS on talleres_temporadas/talleres_temporada_talleres, the
-- trg_talleres_temporada_talleres_misma_direccion membership trigger, and
-- the three RPCs (talleres_crear_temporada, talleres_agregar_taller_a_
-- temporada, talleres_quitar_taller_de_temporada). Run against STAGING
-- inside BEGIN…ROLLBACK — nothing here is kept; every fixture id lives
-- under this file's own b6000000-... namespace.
--
-- Fixtures:
--   D1 (b6…01) — root dirección, 'ZZ TD Dirección D1'.
--   D1 hijo (b6…02) — child of D1, 'ZZ TD D1 Hijo'.
--   D2 (b6…03) — root dirección, 'ZZ TD Dirección D2', unrelated to D1.
--   taller A (b6…10) — regimen=temporada, hangs off D1's CHILD (b6…02).
--   taller C (b6…11) — regimen=cadencia, hangs off D1 directly (b6…01).
--   taller B (b6…12) — regimen=temporada, hangs off D2 (b6…03).
--   director1 (b6…31) — director.write + director.read scoped to D1.
--   director2 (b6…33) — director.write + director.read scoped to D2.
--   member (b6…35) — no capability grant at all.
-- None of A/B/C carry a plantilla (no plantilla_clases/plantilla_grupos):
-- their ediciones get sesiones_snapshot=1 (the no-plantilla fallback) and
-- zero grupos — irrelevant to what this file checks (temporada ownership,
-- tree membership, RLS, refusal codes), already covered by talleres-
-- crear-edicion.test.sql.
--
-- Cases (task's own lettering):
--   (a) director1 talleres_crear_temporada(D1, '2027 - I', 2027-02-01,
--       2027-06-30, [A]) → temporada owned by D1, junction row, 1 edición
--       named '2027 - I' with fecha_inicio 2027-02-01.
--   (b) same director1, a NEW temporada with [B] → TALLER_FUERA_DE_LA_
--       DIRECCION (B hangs off D2, not D1's tree).
--   (c) same director1, a NEW temporada with [C] → TALLER_NO_ES_POR_
--       TEMPORADA (C is regimen=cadencia).
--   (d) director2 cannot SELECT D1's temporada (0 rows), cannot UPDATE it
--       (0 rows), and talleres_agregar_taller_a_temporada on it → 42501.
--   (e) director1 adds A again (already has a non-cancelled edición from
--       (a)) → EDICION_YA_EXISTE.
--   (f) director1 quita A (no inscritos) → its edición 'cancelado', the
--       junction row is gone.
--   (g) director1 adds A again (after (f)'s cancel) → allowed, a BRAND NEW
--       edición (never resurrects the cancelled one).
--   (h) postgres inserts a taller_inscripciones row for (g)'s edición;
--       director1 quita A again → EDICION_CON_INSCRITOS.
--   (i) postgres INSERTs directly into talleres_temporada_talleres (B into
--       D1's own temporada from (a)) → the trigger itself raises P0001
--       TALLER_FUERA_DE_LA_DIRECCION, with no RPC involved.
--   (j) member (no capability grant) → 42501 on talleres_crear_temporada.
-- Mutant (verified manually against staging, outside this file, restored
-- after): comment out talleres_crear_temporada's `IF v_taller.regimen <>
-- 'temporada'` check → a (c)-equivalent call (temporada with a cadencia
-- taller) goes RED (no exception, an edición gets created for a taller
-- that isn't regimen=temporada); CREATE OR REPLACE back to the migration's
-- own body restores GREEN.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_td_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_td_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_td_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_td_failures;
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

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('b6000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ TD Dirección D1', NULL, true),
  ('b6000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ TD D1 Hijo', 'b6000000-0000-4000-8000-000000000001', true),
  ('b6000000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ TD Dirección D2', NULL, true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, regimen, estado) VALUES
  ('b6000000-0000-4000-8000-000000000010', 'zz-td-fixture-a', 'ZZ TD Fixture Taller A', 'b6000000-0000-4000-8000-000000000002', 'individual', 'temporada', 'active'),
  ('b6000000-0000-4000-8000-000000000011', 'zz-td-fixture-c', 'ZZ TD Fixture Taller C', 'b6000000-0000-4000-8000-000000000001', 'individual', 'cadencia', 'active'),
  ('b6000000-0000-4000-8000-000000000012', 'zz-td-fixture-b', 'ZZ TD Fixture Taller B', 'b6000000-0000-4000-8000-000000000003', 'individual', 'temporada', 'active');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b6000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'td-fixture-director1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b6000000-0000-4000-8000-000000000032', 'authenticated', 'authenticated', 'td-fixture-director2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b6000000-0000-4000-8000-000000000034', 'authenticated', 'authenticated', 'td-fixture-miembro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('b6000000-0000-4000-8000-000000000031', 'b6000000-0000-4000-8000-000000000030', 'ZZ TD', 'Director1', 'td-fixture-director1@example.test', 'Soltero', 'Otro'),
  ('b6000000-0000-4000-8000-000000000033', 'b6000000-0000-4000-8000-000000000032', 'ZZ TD', 'Director2', 'td-fixture-director2@example.test', 'Soltero', 'Otro'),
  ('b6000000-0000-4000-8000-000000000035', 'b6000000-0000-4000-8000-000000000034', 'ZZ TD', 'Miembro', 'td-fixture-miembro@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('b6000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'b6000000-0000-4000-8000-000000000001'),
  ('b6000000-0000-4000-8000-000000000033', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b6000000-0000-4000-8000-000000000003'),
  ('b6000000-0000-4000-8000-000000000033', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'b6000000-0000-4000-8000-000000000003');

CREATE TEMP TABLE t_td_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_td_fixture TO authenticated;

CREATE TEMP TABLE t_td_resultado (key text PRIMARY KEY, valor jsonb NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_td_resultado TO authenticated;

-- ══ (a) director1: talleres_crear_temporada(D1, '2027 - I', …, [A]) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b6000000-0000-4000-8000-000000000030');

DO $a$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_crear_temporada(
    'b6000000-0000-4000-8000-000000000001', '2027 - I', DATE '2027-02-01', DATE '2027-06-30',
    ARRAY['b6000000-0000-4000-8000-000000000010']::uuid[]
  );
  INSERT INTO t_td_resultado (key, valor) VALUES ('a', v_resultado);
  INSERT INTO t_td_fixture (key, id) VALUES
    ('temporada_a', (v_resultado ->> 'temporada_id')::uuid),
    ('edicion_a1', (v_resultado -> 'ediciones' -> 0 ->> 'edicion_id')::uuid);
END;
$a$;

SELECT pg_temp.assert_rows('(a) temporada is owned by D1',
  $$SELECT 1 FROM public.talleres_temporadas
     WHERE id = (SELECT id FROM t_td_fixture WHERE key = 'temporada_a')
       AND dream_team_equipo_id = 'b6000000-0000-4000-8000-000000000001'
       AND estado = 'borrador'$$, 1);
SELECT pg_temp.assert_rows('(a) exactly 1 edicion in the result',
  $$SELECT 1 FROM t_td_resultado WHERE key = 'a' AND jsonb_array_length(valor -> 'ediciones') = 1$$, 1);
SELECT pg_temp.assert_rows('(a) edicion named after the temporada, fecha_inicio = fecha_apertura',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = (SELECT id FROM t_td_fixture WHERE key = 'edicion_a1')
       AND nombre_snapshot = '2027 - I'
       AND fecha_inicio = DATE '2027-02-01'$$, 1);
SELECT pg_temp.assert_rows('(a) the junction row exists',
  $$SELECT 1 FROM public.talleres_temporada_talleres
     WHERE temporada_id = (SELECT id FROM t_td_fixture WHERE key = 'temporada_a')
       AND taller_id = 'b6000000-0000-4000-8000-000000000010'$$, 1);

-- ══ (b) director1: a NEW temporada with [B] → TALLER_FUERA_DE_LA_DIRECCION ══

SELECT pg_temp.assert_sqlstate_msg('(b) taller B (D2''s tree) is refused under a D1 temporada',
  $$SELECT public.talleres_crear_temporada(
      'b6000000-0000-4000-8000-000000000001', 'zz-td-b-attempt', DATE '2027-02-01', DATE '2027-06-30',
      ARRAY['b6000000-0000-4000-8000-000000000012']::uuid[]
    )$$,
  'P0001', 'TALLER_FUERA_DE_LA_DIRECCION');
SELECT pg_temp.assert_rows('(b) no orphan temporada was left behind',
  $$SELECT 1 FROM public.talleres_temporadas WHERE nombre = 'zz-td-b-attempt'$$, 0);

-- ══ (c) director1: a NEW temporada with [C] → TALLER_NO_ES_POR_TEMPORADA ══

SELECT pg_temp.assert_sqlstate_msg('(c) taller C (regimen=cadencia) is refused',
  $$SELECT public.talleres_crear_temporada(
      'b6000000-0000-4000-8000-000000000001', 'zz-td-c-attempt', DATE '2027-02-01', DATE '2027-06-30',
      ARRAY['b6000000-0000-4000-8000-000000000011']::uuid[]
    )$$,
  'P0001', 'TALLER_NO_ES_POR_TEMPORADA');

-- ══ (d) director2 cannot see, edit, or add to D1's temporada ══

SELECT pg_temp.as_persona('b6000000-0000-4000-8000-000000000032');

SELECT pg_temp.assert_rows('(d) director2 cannot SELECT D1''s temporada',
  $$SELECT 1 FROM public.talleres_temporadas WHERE id = (SELECT id FROM t_td_fixture WHERE key = 'temporada_a')$$, 0);

DO $d_update$
DECLARE
  v_n int;
BEGIN
  UPDATE public.talleres_temporadas
  SET estado = 'abierto'
  WHERE id = (SELECT id FROM t_td_fixture WHERE key = 'temporada_a');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN
    PERFORM pg_temp.fail('(d) director2 cannot UPDATE D1''s temporada', 'expected 0 rows updated, got ' || v_n);
  END IF;
END;
$d_update$;

SELECT pg_temp.assert_sqlstate_msg('(d) director2 cannot talleres_agregar_taller_a_temporada on D1''s temporada',
  $$SELECT public.talleres_agregar_taller_a_temporada(
      (SELECT id FROM t_td_fixture WHERE key = 'temporada_a'), 'b6000000-0000-4000-8000-000000000010'
    )$$,
  '42501', 'sin_permisos_para_esta_temporada');

-- ══ (e) director1: add A again → EDICION_YA_EXISTE ══

SELECT pg_temp.as_persona('b6000000-0000-4000-8000-000000000030');

SELECT pg_temp.assert_sqlstate_msg('(e) A already has a non-cancelled edicion in this temporada',
  $$SELECT public.talleres_agregar_taller_a_temporada(
      (SELECT id FROM t_td_fixture WHERE key = 'temporada_a'), 'b6000000-0000-4000-8000-000000000010'
    )$$,
  'P0001', 'EDICION_YA_EXISTE');

-- ══ (f) director1: quitar A (no inscritos) → cancelado, junction gone ══

DO $f$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_quitar_taller_de_temporada(
    (SELECT id FROM t_td_fixture WHERE key = 'temporada_a'), 'b6000000-0000-4000-8000-000000000010'
  );
  INSERT INTO t_td_resultado (key, valor) VALUES ('f', v_resultado);
END;
$f$;

SELECT pg_temp.assert_rows('(f) the edicion from (a) is now cancelado',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = (SELECT id FROM t_td_fixture WHERE key = 'edicion_a1') AND estado = 'cancelado'$$, 1);
SELECT pg_temp.assert_rows('(f) the junction row is gone',
  $$SELECT 1 FROM public.talleres_temporada_talleres
     WHERE temporada_id = (SELECT id FROM t_td_fixture WHERE key = 'temporada_a')
       AND taller_id = 'b6000000-0000-4000-8000-000000000010'$$, 0);

-- ══ (g) director1: add A again after cancel → allowed, brand new edicion ══

DO $g$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_agregar_taller_a_temporada(
    (SELECT id FROM t_td_fixture WHERE key = 'temporada_a'), 'b6000000-0000-4000-8000-000000000010'
  );
  INSERT INTO t_td_resultado (key, valor) VALUES ('g', v_resultado);
  INSERT INTO t_td_fixture (key, id) VALUES ('edicion_a2', (v_resultado ->> 'edicion_id')::uuid);
END;
$g$;

SELECT pg_temp.assert_rows('(g) the new edicion is a DIFFERENT row from (a)''s cancelled one',
  $$SELECT 1 FROM t_td_fixture f1 JOIN t_td_fixture f2 ON f1.key = 'edicion_a1' AND f2.key = 'edicion_a2'
     WHERE f1.id <> f2.id$$, 1);
SELECT pg_temp.assert_rows('(g) the new edicion is borrador (not cancelado)',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = (SELECT id FROM t_td_fixture WHERE key = 'edicion_a2') AND estado = 'borrador'$$, 1);
SELECT pg_temp.assert_rows('(g) the junction row exists again',
  $$SELECT 1 FROM public.talleres_temporada_talleres
     WHERE temporada_id = (SELECT id FROM t_td_fixture WHERE key = 'temporada_a')
       AND taller_id = 'b6000000-0000-4000-8000-000000000010'$$, 1);

-- ══ (h) postgres inserts an inscripcion for (g)'s edicion; quitar → EDICION_CON_INSCRITOS ══

RESET ROLE;

DO $h_fixture$
DECLARE
  v_cohorte_id uuid;
BEGIN
  SELECT id INTO v_cohorte_id FROM public.talleres_crecimiento_cohortes
   WHERE taller_id = (SELECT id FROM t_td_fixture WHERE key = 'edicion_a2');

  INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado)
  VALUES (
    (SELECT id FROM t_td_fixture WHERE key = 'edicion_a2'),
    v_cohorte_id,
    'b6000000-0000-4000-8000-000000000035',
    'pendiente'
  );
END;
$h_fixture$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b6000000-0000-4000-8000-000000000030');

SELECT pg_temp.assert_sqlstate_msg('(h) the edicion has an inscripcion, quitar is refused',
  $$SELECT public.talleres_quitar_taller_de_temporada(
      (SELECT id FROM t_td_fixture WHERE key = 'temporada_a'), 'b6000000-0000-4000-8000-000000000010'
    )$$,
  'P0001', 'EDICION_CON_INSCRITOS');

-- ══ (i) postgres: direct junction INSERT (B into D1's temporada) → trigger ══

RESET ROLE;

SELECT pg_temp.assert_sqlstate_msg('(i) a direct junction insert is still refused by the trigger itself',
  $$INSERT INTO public.talleres_temporada_talleres (temporada_id, taller_id)
    VALUES ((SELECT id FROM t_td_fixture WHERE key = 'temporada_a'), 'b6000000-0000-4000-8000-000000000012')$$,
  'P0001', 'TALLER_FUERA_DE_LA_DIRECCION');

-- ══ (j) member (no capability grant) → 42501 on create ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b6000000-0000-4000-8000-000000000034');

SELECT pg_temp.assert_sqlstate_msg('(j) a member with no capability grant is refused',
  $$SELECT public.talleres_crear_temporada(
      'b6000000-0000-4000-8000-000000000001', 'zz-td-member-attempt', DATE '2027-02-01', DATE '2027-06-30',
      ARRAY[]::uuid[]
    )$$,
  '42501', 'sin_permisos_para_esta_direccion');

RESET ROLE;

-- ══ structural ══

SELECT pg_temp.assert_rows('structural: talleres_temporadas policies reference dream_team_equipo_id',
  $$SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'talleres_temporadas'
       AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%dream_team_equipo_id%'
     HAVING count(*) = 4$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_temporada_talleres policies reference talleres_equipo_de_temporada',
  $$SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'talleres_temporada_talleres'
       AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%talleres_equipo_de_temporada%'
     HAVING count(*) = 3$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_equipo_de_temporada has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_equipo_de_temporada'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_crear_temporada has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_crear_temporada'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_agregar_taller_a_temporada has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_agregar_taller_a_temporada'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_quitar_taller_de_temporada has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_quitar_taller_de_temporada'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);

-- report() runs as postgres again: it reads the temp table and raises.
SELECT pg_temp.report();

ROLLBACK;
