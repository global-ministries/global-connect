-- T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — RED->GREEN for
-- the edicion cupo: talleres_cupo_edicion(), the BEFORE INSERT gate
-- (trg_taller_inscripciones_cupo / CUPO_LLENO), talleres_inscribir_
-- sobre_cupo(), and talleres_inscripciones_sobre_cupo_personas().
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; every
-- fixture id lives under this file's own b7000000-... namespace, following
-- the same helper style as supabase/tests/talleres-estado-derivado.test.sql.
-- 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) is
-- referenced read-only as a parent equipo, the same real anchor other
-- talleres fixture tests already use.
--
-- Fixtures:
--   equipo b7…01, taller b7…10 (tipo=individual, regimen=temporada defaults).
--   edicion1 (b7…60, cohorte b7…80, grupo b7…50 capacidad=2) — the cupo=2
--     scenario. Dates mirror talleres-estado-derivado.test.sql's R_open
--     fixture (cierre tomorrow, inicio in 3 days, fin in 30 -> abierto),
--     so self-enroll succeeds without depending on a refresh.
--   edicion2 (b7…61, cohorte b7…81, NO grupo) — cupo=0 ("sin cupo
--     definido"), same effective-abierto dates.
--
-- Identities (auth.users id / usuarios id pairs, same convention as the
-- estado-derivado fixture):
--   A  091/092 — self-enroll #1 on edicion1.
--   B  093/094 — self-enroll #2 on edicion1 (fills the 2 seats).
--   C  095/096 — self-enroll #3 on edicion1 (CUPO_LLENO).
--   D  097/098 — "miembro sin capacidad" (no grants at all): the 42501 case.
--   E  099/100 — director (talleres_crecimiento.director.write scoped to
--                 equipo b7…01): the coordinator/director actor.
--   F  —  /101 — usuarios-only (no login needed): the sobre-cupo target.
--   G  102/103, I 106/107 — edicion2's two unlimited self-enrolls.
--   H  104/105 — self-enrolls into edicion1 AFTER A is retired (freed seat).
--
-- Sequencing note: the task's own scenario list is not a strict execution
-- order. A's row is retired and H's self-enroll (freed seat) run BEFORE
-- E places F sobre cupo — inserting F first would leave edicion1 exactly
-- at cupo again after retiring A (B+F=2=cupo), which would wrongly keep
-- refusing H. Retiring A while occupancy is only A+B=2 (dropping to 1)
-- lets H's self-enroll genuinely prove the freed seat, and the sobre-cupo
-- placement (which bypasses the gate regardless of occupancy) runs after.
--
-- Mutant (post-GREEN, restored after, verified manually against staging —
-- never persisted): replace the `IF v_calculo.cupo > 0 AND v_calculo.
-- ocupados >= v_calculo.cupo THEN` line in talleres_inscripciones_cupo_gate
-- with `IF false THEN` -> case (3) goes RED (C's self-enroll no longer
-- raises); restore the real CREATE OR REPLACE and confirm GREEN again.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cu_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_cu_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cu_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_expected_sqlstate text, p_expected_message_substr text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' (' || p_expected_message_substr || '), got no exception');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
    ELSIF position(p_expected_message_substr IN SQLERRM) = 0 THEN
      PERFORM pg_temp.fail(p_case, 'expected message containing ''' || p_expected_message_substr || ''', got ' || SQLERRM);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_no_error(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_cu_failures;
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
  ('b7000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ B7 Equipo Taller', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('b7000000-0000-4000-8000-000000000010', 'zz-b7-fixture', 'ZZ B7 Fixture Taller', 'b7000000-0000-4000-8000-000000000001');

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata) VALUES
  ('b7000000-0000-4000-8000-000000000070', 'workshop', 'active', 'ZZ B7 Evento Edicion1', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b7000000-0000-4000-8000-000000000071', 'workshop', 'active', 'ZZ B7 Evento Edicion2', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb);

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
) VALUES
  ('b7000000-0000-4000-8000-000000000060', 'b7000000-0000-4000-8000-000000000070', 'b7000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'abierto', 'ZZ B7 Edicion1', 4, 60, 'permanente_custom',
   CURRENT_DATE + 3, CURRENT_DATE + 1, CURRENT_DATE + 30),
  ('b7000000-0000-4000-8000-000000000061', 'b7000000-0000-4000-8000-000000000071', 'b7000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'abierto', 'ZZ B7 Edicion2', 4, 60, 'permanente_custom',
   CURRENT_DATE + 3, CURRENT_DATE + 1, CURRENT_DATE + 30);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion) VALUES
  ('b7000000-0000-4000-8000-000000000080', 'b7000000-0000-4000-8000-000000000060', 'b7000000-0000-4000-8000-000000000001', 'ZZ B7 Cohorte Edicion1'),
  ('b7000000-0000-4000-8000-000000000081', 'b7000000-0000-4000-8000-000000000061', 'b7000000-0000-4000-8000-000000000001', 'ZZ B7 Cohorte Edicion2');

-- Edicion1's only grupo: capacidad 2. Edicion2 gets NONE (cupo = 0).
INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('b7000000-0000-4000-8000-000000000050', 'b7000000-0000-4000-8000-000000000080', 'ZZ B7 Grupo 1', 2, 'activo');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b7000000-0000-4000-8000-000000000091', 'authenticated', 'authenticated', 'b7-a@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b7000000-0000-4000-8000-000000000093', 'authenticated', 'authenticated', 'b7-b@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b7000000-0000-4000-8000-000000000095', 'authenticated', 'authenticated', 'b7-c@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b7000000-0000-4000-8000-000000000097', 'authenticated', 'authenticated', 'b7-d@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b7000000-0000-4000-8000-000000000099', 'authenticated', 'authenticated', 'b7-e@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b7000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'b7-g@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b7000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'b7-h@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b7000000-0000-4000-8000-000000000106', 'authenticated', 'authenticated', 'b7-i@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('b7000000-0000-4000-8000-000000000092', 'b7000000-0000-4000-8000-000000000091', 'ZZB7', 'A', 'b7-a@example.test', 'Soltero', 'Otro'),
  ('b7000000-0000-4000-8000-000000000094', 'b7000000-0000-4000-8000-000000000093', 'ZZB7', 'B', 'b7-b@example.test', 'Soltero', 'Otro'),
  ('b7000000-0000-4000-8000-000000000096', 'b7000000-0000-4000-8000-000000000095', 'ZZB7', 'C', 'b7-c@example.test', 'Soltero', 'Otro'),
  ('b7000000-0000-4000-8000-000000000098', 'b7000000-0000-4000-8000-000000000097', 'ZZB7', 'D', 'b7-d@example.test', 'Soltero', 'Otro'),
  ('b7000000-0000-4000-8000-000000000100', 'b7000000-0000-4000-8000-000000000099', 'ZZB7', 'E Director', 'b7-e@example.test', 'Soltero', 'Otro'),
  ('b7000000-0000-4000-8000-000000000101', NULL, 'ZZB7', 'F Sobre Cupo', 'b7-f@example.test', 'Soltero', 'Otro'),
  ('b7000000-0000-4000-8000-000000000103', 'b7000000-0000-4000-8000-000000000102', 'ZZB7', 'G', 'b7-g@example.test', 'Soltero', 'Otro'),
  ('b7000000-0000-4000-8000-000000000105', 'b7000000-0000-4000-8000-000000000104', 'ZZB7', 'H', 'b7-h@example.test', 'Soltero', 'Otro'),
  ('b7000000-0000-4000-8000-000000000107', 'b7000000-0000-4000-8000-000000000106', 'ZZB7', 'I', 'b7-i@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('b7000000-0000-4000-8000-000000000100', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b7000000-0000-4000-8000-000000000001');

-- ══ (1)(2) two self-enrolls fill edicion1's 2-seat cupo ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000091');
SELECT pg_temp.assert_no_error('(1) A self-enrolls into edicion1',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado) VALUES (
      'b7000000-0000-4000-8000-000000000060', 'b7000000-0000-4000-8000-000000000080',
      'b7000000-0000-4000-8000-000000000092', 'pendiente')$$);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000093');
SELECT pg_temp.assert_no_error('(2) B self-enrolls into edicion1 (fills cupo)',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado) VALUES (
      'b7000000-0000-4000-8000-000000000060', 'b7000000-0000-4000-8000-000000000080',
      'b7000000-0000-4000-8000-000000000094', 'pendiente')$$);
RESET ROLE;

-- ══ (3) third self-enroll refused: P0001 CUPO_LLENO ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000095');
SELECT pg_temp.assert_raises('(3) C self-enroll into a full edicion1 -> CUPO_LLENO',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado) VALUES (
      'b7000000-0000-4000-8000-000000000060', 'b7000000-0000-4000-8000-000000000080',
      'b7000000-0000-4000-8000-000000000096', 'pendiente')$$,
  'P0001', 'CUPO_LLENO');
RESET ROLE;

SELECT pg_temp.assert_rows('(3) the refused insert left no row',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'b7000000-0000-4000-8000-000000000060'
       AND persona_principal_id = 'b7000000-0000-4000-8000-000000000096'$$, 0);

-- ══ (4) talleres_cupo_edicion(edicion1): cupo 2, ocupados 2, disponibles 0, sobre_cupo 0 ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000091');
SELECT pg_temp.assert_rows('(4) talleres_cupo_edicion(edicion1) reads cupo=2/ocupados=2/disponibles=0/sobre_cupo=0',
  $$SELECT 1 FROM public.talleres_cupo_edicion('b7000000-0000-4000-8000-000000000060'::uuid)
     WHERE cupo = 2 AND ocupados = 2 AND disponibles = 0 AND sobre_cupo = 0$$, 1);
RESET ROLE;

-- ══ (5)(6) retire A, then H's self-enroll proves the freed seat ══

SELECT pg_temp.assert_no_error('(5) retire A''s inscripcion',
  $$UPDATE public.taller_inscripciones SET estado = 'retirado'
     WHERE taller_id = 'b7000000-0000-4000-8000-000000000060'
       AND persona_principal_id = 'b7000000-0000-4000-8000-000000000092'$$);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000104');
SELECT pg_temp.assert_no_error('(6) H self-enrolls into edicion1 after A''s seat is freed',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado) VALUES (
      'b7000000-0000-4000-8000-000000000060', 'b7000000-0000-4000-8000-000000000080',
      'b7000000-0000-4000-8000-000000000105', 'pendiente')$$);
RESET ROLE;

-- ══ (7) director E places F sobre cupo on edicion1 (full again: B+H) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000099');
SELECT pg_temp.assert_rows('(7) talleres_inscribir_sobre_cupo(edicion1, F) succeeds and reports sobre_cupo=1',
  $$SELECT 1 FROM (SELECT public.talleres_inscribir_sobre_cupo(
       'b7000000-0000-4000-8000-000000000060'::uuid, 'b7000000-0000-4000-8000-000000000101'::uuid) AS r) q
     WHERE (r->>'sobre_cupo')::int = 1 AND (r->>'cupo')::int = 2 AND (r->>'inscripcion_id') IS NOT NULL$$, 1);
RESET ROLE;

SELECT pg_temp.assert_rows('(7) F''s row carries sobre_cupo=true and sobre_cupo_por=E',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'b7000000-0000-4000-8000-000000000060'
       AND persona_principal_id = 'b7000000-0000-4000-8000-000000000101'
       AND sobre_cupo = true
       AND sobre_cupo_por = 'b7000000-0000-4000-8000-000000000100'
       AND sobre_cupo_en IS NOT NULL$$, 1);

-- ══ (8) same director, same persona again -> P0001 YA_INSCRITO ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000099');
SELECT pg_temp.assert_raises('(8) talleres_inscribir_sobre_cupo(edicion1, F) again -> YA_INSCRITO',
  $$SELECT public.talleres_inscribir_sobre_cupo(
      'b7000000-0000-4000-8000-000000000060'::uuid, 'b7000000-0000-4000-8000-000000000101'::uuid)$$,
  'P0001', 'YA_INSCRITO');
RESET ROLE;

-- ══ (9) a member with no grants calling talleres_inscribir_sobre_cupo -> 42501 ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000097');
SELECT pg_temp.assert_raises('(9) D (no grants) calling talleres_inscribir_sobre_cupo -> 42501 sin_permisos_para_este_taller',
  $$SELECT public.talleres_inscribir_sobre_cupo(
      'b7000000-0000-4000-8000-000000000060'::uuid, 'b7000000-0000-4000-8000-000000000101'::uuid)$$,
  '42501', 'sin_permisos_para_este_taller');
RESET ROLE;

-- ══ (10) edicion2 has no grupos -> cupo 0 -> self-enroll unlimited (two succeed) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000102');
SELECT pg_temp.assert_no_error('(10) G self-enrolls into edicion2 (cupo=0, no limit)',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado) VALUES (
      'b7000000-0000-4000-8000-000000000061', 'b7000000-0000-4000-8000-000000000081',
      'b7000000-0000-4000-8000-000000000103', 'pendiente')$$);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000106');
SELECT pg_temp.assert_no_error('(10) I also self-enrolls into edicion2 (still no limit)',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado) VALUES (
      'b7000000-0000-4000-8000-000000000061', 'b7000000-0000-4000-8000-000000000081',
      'b7000000-0000-4000-8000-000000000107', 'pendiente')$$);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b7000000-0000-4000-8000-000000000102');
SELECT pg_temp.assert_rows('(10) talleres_cupo_edicion(edicion2) reads cupo=0/ocupados=2',
  $$SELECT 1 FROM public.talleres_cupo_edicion('b7000000-0000-4000-8000-000000000061'::uuid)
     WHERE cupo = 0 AND ocupados = 2$$, 1);
RESET ROLE;

-- ══ (11) structural: the sobre_cupo metadata CHECK rejects a half-set row ══

SELECT pg_temp.assert_sqlstate('(11) sobre_cupo=true without sobre_cupo_por/en is rejected (23514)',
  $$UPDATE public.taller_inscripciones SET sobre_cupo = true
     WHERE taller_id = 'b7000000-0000-4000-8000-000000000060'
       AND persona_principal_id = 'b7000000-0000-4000-8000-000000000094'$$,
  '23514');

-- ══ structural — no anon/authenticated in proacl where it must not be ══

SELECT pg_temp.assert_rows('structural: talleres_cupo_edicion has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_cupo_edicion'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_inscribir_sobre_cupo has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_inscribir_sobre_cupo'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_inscripciones_sobre_cupo_personas has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_inscripciones_sobre_cupo_personas'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_cupo_edicion_calculo has no EXECUTE for anon or authenticated',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_cupo_edicion_calculo'
       AND NOT (p.proacl::text LIKE '%anon=%') AND NOT (p.proacl::text LIKE '%authenticated=X%')$$, 1);

-- report() runs as postgres again: it reads the temp table and raises.
RESET ROLE;
SELECT pg_temp.report();

ROLLBACK;
