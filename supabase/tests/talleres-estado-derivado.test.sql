-- T1 (odd/tasks/talleres-temporadas-y-ediciones.md) — RED->GREEN for the
-- derived edicion state: talleres_estado_efectivo(), talleres_refrescar_
-- estados(), the talleres.regimen -> modalidad_default mirror, the
-- tipo/vinculo CHECK, and the self-enroll gate now reading the derived
-- state instead of the stored column (taller_ediciones_select,
-- taller_inscripciones_insert, talleres_crecimiento_cohortes_select).
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; every
-- fixture id lives under this file's own b4000000-... namespace, following
-- the same helper style as supabase/tests/talleres-plantillas-del-taller.test.sql.
-- 'e524ea89-d3a7-45fc-be00-5a6e7452434e' (Grupos de Corto Plazo) is
-- referenced read-only as a parent equipo, the same real anchor other
-- talleres fixture tests already use.
--
-- Dates are all relative to CURRENT_DATE so this file stays valid whenever
-- it is re-run.
--
-- Identities:
--   miembro sin capacidad (b4…92) — no dream_team_servicios row, no
--                                    capability grant: the self-enroll actor.
--
-- Fixture talleres (each needs its own dream_team_equipo_id — 1:1 via the
-- partial unique index talleres_dream_team_equipo_id_uniq):
--   b4…10 — equipo b4…01. tipo=individual (default), regimen=temporada
--            (default): carries the 9 date-state edicion fixtures below.
--   b4…11 — equipo b4…02. tipo=pareja, vinculo=novios: proves (11)'s
--            success branch.
--
-- Edicion fixtures on b4…10 (operating_core_events/taller_ediciones/
-- talleres_crecimiento_cohortes triplets), estado stored deliberately
-- WRONG wherever the derivation should override it, to prove the function
-- truly derives from dates rather than echoing the stored column:
--   R1 (b4…61) stored 'cerrado' — cierre tomorrow, inicio in 3 days -> abierto
--   R2 (b4…62) stored 'cerrado' — inicio yesterday, cierre yesterday, fin next week -> en_curso
--   R3 (b4…63) stored 'cerrado' — inicio last week, cierre in 2 days (late entry), fin next week -> abierto
--   R4 (b4…64) stored 'abierto' — fin yesterday -> cerrado
--   R5 (b4…65) stored 'borrador' — dates identical to R1 -> stays borrador
--   R6 (b4…66) stored 'cancelado' — dates identical to R4 -> stays cancelado
--   R7 (b4…67) stored 'abierto' — all 3 dates NULL -> falls back to stored 'abierto'
--   R_open   (b4…68) stored 'abierto' — dates identical to R1 -> abierto (self-enroll succeeds)
--   R_closed (b4…69) stored 'abierto' — dates identical to R4 -> cerrado (self-enroll refused)
--
-- Covers this task's acceptance criterion 5 (borrador/cancelado stay
-- manual; a closed edicion refuses inscription) plus this file's own
-- cases (1)-(11) named after the task's own numbering.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ed_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ed_failures TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ed_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_ed_failures;
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

-- Two equipos: talleres.dream_team_equipo_id is 1:1 with its equipo
-- (talleres_dream_team_equipo_id_uniq, a partial unique index — verified
-- on staging), so the two fixture talleres below cannot share one.
INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('b4000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ B4 Equipo Taller', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true),
  ('b4000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ B4 Equipo Taller Pareja', 'e524ea89-d3a7-45fc-be00-5a6e7452434e', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id) VALUES
  ('b4000000-0000-4000-8000-000000000010', 'zz-b4-fixture', 'ZZ B4 Fixture Taller', 'b4000000-0000-4000-8000-000000000001');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b4000000-0000-4000-8000-000000000091', 'authenticated', 'authenticated', 'b4-fixture-miembro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('b4000000-0000-4000-8000-000000000092', 'b4000000-0000-4000-8000-000000000091', 'ZZB4', 'Miembro', 'b4-fixture-miembro@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

-- One operating_core_event + taller_edicion + cohorte triplet per row.
-- estado is deliberately set to a value the dates should OVERRIDE, except
-- for R5 (borrador) and R6 (cancelado), which must survive untouched.

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata) VALUES
  ('b4000000-0000-4000-8000-000000000071', 'workshop', 'active', 'ZZ B4 Evento R1', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b4000000-0000-4000-8000-000000000072', 'workshop', 'active', 'ZZ B4 Evento R2', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b4000000-0000-4000-8000-000000000073', 'workshop', 'active', 'ZZ B4 Evento R3', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b4000000-0000-4000-8000-000000000074', 'workshop', 'active', 'ZZ B4 Evento R4', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b4000000-0000-4000-8000-000000000075', 'workshop', 'active', 'ZZ B4 Evento R5', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b4000000-0000-4000-8000-000000000076', 'workshop', 'active', 'ZZ B4 Evento R6', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b4000000-0000-4000-8000-000000000077', 'workshop', 'active', 'ZZ B4 Evento R7', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b4000000-0000-4000-8000-000000000078', 'workshop', 'active', 'ZZ B4 Evento R_open', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b4000000-0000-4000-8000-000000000079', 'workshop', 'active', 'ZZ B4 Evento R_closed', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb);

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
) VALUES
  ('b4000000-0000-4000-8000-000000000061', 'b4000000-0000-4000-8000-000000000071', 'b4000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'cerrado', 'ZZ B4 R1', 4, 60, 'permanente_custom',
   CURRENT_DATE + 3, CURRENT_DATE + 1, CURRENT_DATE + 30),
  ('b4000000-0000-4000-8000-000000000062', 'b4000000-0000-4000-8000-000000000072', 'b4000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'cerrado', 'ZZ B4 R2', 4, 60, 'permanente_custom',
   CURRENT_DATE - 1, CURRENT_DATE - 1, CURRENT_DATE + 7),
  ('b4000000-0000-4000-8000-000000000063', 'b4000000-0000-4000-8000-000000000073', 'b4000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'cerrado', 'ZZ B4 R3', 4, 60, 'permanente_custom',
   CURRENT_DATE - 7, CURRENT_DATE + 2, CURRENT_DATE + 7),
  ('b4000000-0000-4000-8000-000000000064', 'b4000000-0000-4000-8000-000000000074', 'b4000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'abierto', 'ZZ B4 R4', 4, 60, 'permanente_custom',
   CURRENT_DATE - 30, CURRENT_DATE - 30, CURRENT_DATE - 1),
  ('b4000000-0000-4000-8000-000000000065', 'b4000000-0000-4000-8000-000000000075', 'b4000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'borrador', 'ZZ B4 R5', 4, 60, 'permanente_custom',
   CURRENT_DATE + 3, CURRENT_DATE + 1, CURRENT_DATE + 30),
  ('b4000000-0000-4000-8000-000000000066', 'b4000000-0000-4000-8000-000000000076', 'b4000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'cancelado', 'ZZ B4 R6', 4, 60, 'permanente_custom',
   CURRENT_DATE - 30, CURRENT_DATE - 30, CURRENT_DATE - 1),
  ('b4000000-0000-4000-8000-000000000067', 'b4000000-0000-4000-8000-000000000077', 'b4000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'abierto', 'ZZ B4 R7', 4, 60, 'permanente_custom',
   NULL, NULL, NULL),
  ('b4000000-0000-4000-8000-000000000068', 'b4000000-0000-4000-8000-000000000078', 'b4000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'abierto', 'ZZ B4 R_open', 4, 60, 'permanente_custom',
   CURRENT_DATE + 3, CURRENT_DATE + 1, CURRENT_DATE + 30),
  ('b4000000-0000-4000-8000-000000000069', 'b4000000-0000-4000-8000-000000000079', 'b4000000-0000-4000-8000-000000000010',
   'individual', 'permanente_custom', 'abierto', 'ZZ B4 R_closed', 4, 60, 'permanente_custom',
   CURRENT_DATE - 30, CURRENT_DATE - 30, CURRENT_DATE - 1);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion) VALUES
  ('b4000000-0000-4000-8000-000000000081', 'b4000000-0000-4000-8000-000000000061', 'b4000000-0000-4000-8000-000000000001', 'ZZ B4 Cohorte R1'),
  ('b4000000-0000-4000-8000-000000000082', 'b4000000-0000-4000-8000-000000000062', 'b4000000-0000-4000-8000-000000000001', 'ZZ B4 Cohorte R2'),
  ('b4000000-0000-4000-8000-000000000083', 'b4000000-0000-4000-8000-000000000063', 'b4000000-0000-4000-8000-000000000001', 'ZZ B4 Cohorte R3'),
  ('b4000000-0000-4000-8000-000000000084', 'b4000000-0000-4000-8000-000000000064', 'b4000000-0000-4000-8000-000000000001', 'ZZ B4 Cohorte R4'),
  ('b4000000-0000-4000-8000-000000000085', 'b4000000-0000-4000-8000-000000000065', 'b4000000-0000-4000-8000-000000000001', 'ZZ B4 Cohorte R5'),
  ('b4000000-0000-4000-8000-000000000086', 'b4000000-0000-4000-8000-000000000066', 'b4000000-0000-4000-8000-000000000001', 'ZZ B4 Cohorte R6'),
  ('b4000000-0000-4000-8000-000000000087', 'b4000000-0000-4000-8000-000000000067', 'b4000000-0000-4000-8000-000000000001', 'ZZ B4 Cohorte R7'),
  ('b4000000-0000-4000-8000-000000000088', 'b4000000-0000-4000-8000-000000000068', 'b4000000-0000-4000-8000-000000000001', 'ZZ B4 Cohorte R_open'),
  ('b4000000-0000-4000-8000-000000000089', 'b4000000-0000-4000-8000-000000000069', 'b4000000-0000-4000-8000-000000000001', 'ZZ B4 Cohorte R_closed');

-- ══ talleres_estado_efectivo(): cases 1-7 (function called directly,
-- both overloads, as postgres — this is pure computation, not an RLS test) ══

SELECT pg_temp.assert_rows('(1) cierre tomorrow + inicio in 3 days -> abierto (uuid overload)',
  $$SELECT 1 WHERE public.talleres_estado_efectivo('b4000000-0000-4000-8000-000000000061'::uuid) = 'abierto'$$, 1);
SELECT pg_temp.assert_rows('(1) same, row overload',
  $$SELECT 1 FROM public.taller_ediciones te WHERE te.id = 'b4000000-0000-4000-8000-000000000061'
     AND public.talleres_estado_efectivo(te) = 'abierto'$$, 1);

SELECT pg_temp.assert_rows('(2) inicio yesterday, cierre yesterday, fin next week -> en_curso',
  $$SELECT 1 WHERE public.talleres_estado_efectivo('b4000000-0000-4000-8000-000000000062'::uuid) = 'en_curso'$$, 1);

SELECT pg_temp.assert_rows('(3) inicio last week, cierre in 2 days (late entry), fin next week -> abierto',
  $$SELECT 1 WHERE public.talleres_estado_efectivo('b4000000-0000-4000-8000-000000000063'::uuid) = 'abierto'$$, 1);

SELECT pg_temp.assert_rows('(4) fin yesterday -> cerrado',
  $$SELECT 1 WHERE public.talleres_estado_efectivo('b4000000-0000-4000-8000-000000000064'::uuid) = 'cerrado'$$, 1);

SELECT pg_temp.assert_rows('(5) stored borrador with abierto-shaped dates -> stays borrador',
  $$SELECT 1 WHERE public.talleres_estado_efectivo('b4000000-0000-4000-8000-000000000065'::uuid) = 'borrador'$$, 1);

SELECT pg_temp.assert_rows('(6) stored cancelado -> stays cancelado',
  $$SELECT 1 WHERE public.talleres_estado_efectivo('b4000000-0000-4000-8000-000000000066'::uuid) = 'cancelado'$$, 1);

SELECT pg_temp.assert_rows('(7) NULL dates + stored abierto -> falls back to abierto',
  $$SELECT 1 WHERE public.talleres_estado_efectivo('b4000000-0000-4000-8000-000000000067'::uuid) = 'abierto'$$, 1);

-- ══ (9) self-enroll: refused into the case-4-shaped closed edicion,
-- allowed into the case-1-shaped open one. Run BEFORE (8)'s refresh so
-- R_closed's STORED column is still the (wrong) 'abierto' it started
-- with — the point is that RLS must not depend on the refresh having run. ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b4000000-0000-4000-8000-000000000091');

SELECT pg_temp.assert_sqlstate('(9) self-enroll into a stored-abierto/effective-cerrado edicion is refused',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado) VALUES (
      'b4000000-0000-4000-8000-000000000069', 'b4000000-0000-4000-8000-000000000089',
      'b4000000-0000-4000-8000-000000000092', 'pendiente')$$,
  '42501');

SELECT pg_temp.assert_no_error('(9) self-enroll into the effective-abierto edicion succeeds',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado) VALUES (
      'b4000000-0000-4000-8000-000000000068', 'b4000000-0000-4000-8000-000000000088',
      'b4000000-0000-4000-8000-000000000092', 'pendiente')$$);

RESET ROLE;

SELECT pg_temp.assert_rows('(9) the refused insert left no row',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'b4000000-0000-4000-8000-000000000069'
       AND persona_principal_id = 'b4000000-0000-4000-8000-000000000092'$$, 0);
SELECT pg_temp.assert_rows('(9) the accepted insert is there',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'b4000000-0000-4000-8000-000000000068'
       AND persona_principal_id = 'b4000000-0000-4000-8000-000000000092' AND estado = 'pendiente'$$, 1);

-- ══ (8) talleres_refrescar_estados(taller): updates every row on this
-- taller whose stored estado differs from its effective one — R1-R4 AND
-- R_closed (5 rows; R_closed was left stored 'abierto' by (9) on purpose),
-- returns 5, leaves R5/R6 (manual) and R7/R_open (already matching)
-- untouched ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b4000000-0000-4000-8000-000000000091');

SELECT pg_temp.assert_rows('(8) talleres_refrescar_estados(taller) returns exactly 5',
  $$SELECT 1 WHERE public.talleres_refrescar_estados('b4000000-0000-4000-8000-000000000010'::uuid) = 5$$, 1);

RESET ROLE;

SELECT pg_temp.assert_rows('(8) R1 estado is now abierto',
  $$SELECT 1 FROM public.taller_ediciones WHERE id = 'b4000000-0000-4000-8000-000000000061' AND estado = 'abierto'$$, 1);
SELECT pg_temp.assert_rows('(8) R2 estado is now en_curso',
  $$SELECT 1 FROM public.taller_ediciones WHERE id = 'b4000000-0000-4000-8000-000000000062' AND estado = 'en_curso'$$, 1);
SELECT pg_temp.assert_rows('(8) R3 estado is now abierto',
  $$SELECT 1 FROM public.taller_ediciones WHERE id = 'b4000000-0000-4000-8000-000000000063' AND estado = 'abierto'$$, 1);
SELECT pg_temp.assert_rows('(8) R4 estado is now cerrado',
  $$SELECT 1 FROM public.taller_ediciones WHERE id = 'b4000000-0000-4000-8000-000000000064' AND estado = 'cerrado'$$, 1);
SELECT pg_temp.assert_rows('(8) R5 (borrador) is untouched',
  $$SELECT 1 FROM public.taller_ediciones WHERE id = 'b4000000-0000-4000-8000-000000000065' AND estado = 'borrador'$$, 1);
SELECT pg_temp.assert_rows('(8) R6 (cancelado) is untouched',
  $$SELECT 1 FROM public.taller_ediciones WHERE id = 'b4000000-0000-4000-8000-000000000066' AND estado = 'cancelado'$$, 1);
SELECT pg_temp.assert_rows('(8) R7 (already matching) is untouched',
  $$SELECT 1 FROM public.taller_ediciones WHERE id = 'b4000000-0000-4000-8000-000000000067' AND estado = 'abierto'$$, 1);
SELECT pg_temp.assert_rows('(8) R_open (already matching) is untouched',
  $$SELECT 1 FROM public.taller_ediciones WHERE id = 'b4000000-0000-4000-8000-000000000068' AND estado = 'abierto'$$, 1);
SELECT pg_temp.assert_rows('(8) R_closed now reads cerrado too, since the refresh is taller-wide',
  $$SELECT 1 FROM public.taller_ediciones WHERE id = 'b4000000-0000-4000-8000-000000000069' AND estado = 'cerrado'$$, 1);

-- ══ (10) talleres.regimen mirror: update to cadencia flips modalidad_default ══

SELECT pg_temp.assert_no_error('(10) update regimen to cadencia',
  $$UPDATE public.talleres SET regimen = 'cadencia' WHERE id = 'b4000000-0000-4000-8000-000000000010'$$);
SELECT pg_temp.assert_rows('(10) modalidad_default mirrors to permanente_custom',
  $$SELECT 1 FROM public.talleres WHERE id = 'b4000000-0000-4000-8000-000000000010' AND modalidad_default = 'permanente_custom'$$, 1);

-- ══ (11) tipo/vinculo CHECK: pareja+novios ok; vinculo with individual fails 23514 ══

SELECT pg_temp.assert_no_error('(11) tipo=pareja with vinculo=novios is accepted',
  $$INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo) VALUES (
      'b4000000-0000-4000-8000-000000000011', 'zz-b4-fixture-pareja', 'ZZ B4 Fixture Pareja',
      'b4000000-0000-4000-8000-000000000002', 'pareja', 'novios')$$);

SELECT pg_temp.assert_sqlstate('(11) vinculo on an individual taller is rejected (check_violation)',
  $$UPDATE public.talleres SET vinculo = 'matrimonio' WHERE id = 'b4000000-0000-4000-8000-000000000010'$$,
  '23514');

-- ══ structural — no anon in proacl for the 3 new functions ══

SELECT pg_temp.assert_rows('structural: talleres_estado_efectivo (both overloads) has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_estado_efectivo'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 2);
SELECT pg_temp.assert_rows('structural: talleres_refrescar_estados has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_refrescar_estados'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);

-- report() runs as postgres again: it reads the temp table and raises.
RESET ROLE;
SELECT pg_temp.report();

ROLLBACK;
