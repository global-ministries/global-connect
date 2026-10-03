-- T7 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — RED->GREEN
-- for the hardening round after an independent reviewer's pass over
-- 1ea5c31..HEAD (migration 20260928140000_talleres_paso6_hardening.sql).
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; every
-- fixture id lives under this file's own b8000000-... namespace, following
-- the same helper style as the other paso-6 test files. D1/D2 are two
-- unrelated ROOT direcciones (parent_equipo_id NULL), same convention as
-- talleres-temporadas-por-direccion.test.sql's own D1/D2, so item 2's
-- cross-direction check has two genuinely separate trees.
--
-- Fixtures:
--   D1 (b8…01), D2 (b8…02).
--   taller_temporada (b8…10, D1, individual, regimen=temporada) — items
--     1/6/7(personas)/2/3.
--   taller_pareja (b8…11, D1, pareja, vinculo=matrimonio, regimen=temporada,
--     cupo=1) — items 7(parejas)/8.
--   taller_cadencia (b8…12, D1, individual, regimen=cadencia,
--     intervalo_ediciones_dias=28) — items 10/11.
--   taller_d2 (b8…13, D2, individual, regimen=temporada) — item 2 (negative).
--   taller_dedup (b8…14, D1, individual, regimen=temporada) — item 9,
--     untouched by any other case so EDICION_YA_EXISTE can never fire from
--     anything but the dedup itself.
--   temporada_d1 (b8…60, D1, borrador), temporada_d1_cerrada (b8…61, D1,
--     cerrado).
--   director1 (b8…31, director.write+read scoped to D1), director2
--     (b8…33, scoped to D2), member (b8…35, no grants).
--   edicion_temp (b8…80, taller_temporada, effective abierto, cupo=2),
--   edicion_pareja (b8…81, taller_pareja, effective abierto, cupo=1),
--   edicion_d2 (b8…82, taller_d2, no temporada, no cupo),
--   edicion_cerrada (b8…83, taller_temporada, effective cerrado, no cupo
--     — the item 8 EDICION_NO_ABIERTA fixture).
--
-- Mutant (post-GREEN, run as its own separate BEGIN…ROLLBACK, never
-- persisted — see this task's own delegation report): CREATE OR REPLACE
-- talleres_inscripciones_cupo_gate with its `IF current_setting(...) IS
-- DISTINCT FROM '1' THEN RAISE ...` block removed (sobre_cupo=true always
-- RETURN NEW) -> a direct postgres insert with sobre_cupo=true and no
-- session flag no longer raises SOBRE_CUPO_NO_AUTORIZADO (RED); ROLLBACK
-- undoes the CREATE OR REPLACE together with the probe insert, so nothing
-- needs a separate restore step.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_h6_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_h6_failures TO authenticated;

CREATE TEMP TABLE t_h6_fixture (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_h6_fixture TO authenticated;

CREATE TEMP TABLE t_h6_resultado (key text PRIMARY KEY, valor jsonb NOT NULL) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_h6_resultado TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_h6_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_h6_failures;
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

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── fixtures (as postgres, before any role switch) ──────────────────

-- talleres.dream_team_equipo_id is 1:1 with its equipo
-- (talleres_dream_team_equipo_id_uniq, a partial unique index — verified
-- on staging), so the four D1-side fixture talleres below each need their
-- OWN child node under D1 (director1's grant is scoped to D1 itself and
-- cascades down to descendants — same convention talleres-temporadas-
-- por-direccion.test.sql's own D1/taller-A-under-D1's-child already uses).
INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('b8000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ B8 Dirección D1', NULL, true),
  ('b8000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ B8 Dirección D2', NULL, true),
  ('b8000000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ B8 D1 Hijo Temporada', 'b8000000-0000-4000-8000-000000000001', true),
  ('b8000000-0000-4000-8000-000000000004', 'talleres_crecimiento', 'ZZ B8 D1 Hijo Pareja', 'b8000000-0000-4000-8000-000000000001', true),
  ('b8000000-0000-4000-8000-000000000005', 'talleres_crecimiento', 'ZZ B8 D1 Hijo Cadencia', 'b8000000-0000-4000-8000-000000000001', true),
  ('b8000000-0000-4000-8000-000000000006', 'talleres_crecimiento', 'ZZ B8 D1 Hijo Dedup', 'b8000000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, intervalo_ediciones_dias) VALUES
  ('b8000000-0000-4000-8000-000000000010', 'zz-b8-taller-temporada', 'ZZ B8 Taller Temporada', 'b8000000-0000-4000-8000-000000000003', 'individual', NULL, 'temporada', NULL),
  ('b8000000-0000-4000-8000-000000000011', 'zz-b8-taller-pareja', 'ZZ B8 Taller Pareja', 'b8000000-0000-4000-8000-000000000004', 'pareja', 'matrimonio', 'temporada', NULL),
  ('b8000000-0000-4000-8000-000000000012', 'zz-b8-taller-cadencia', 'ZZ B8 Taller Cadencia', 'b8000000-0000-4000-8000-000000000005', 'individual', NULL, 'cadencia', 28),
  ('b8000000-0000-4000-8000-000000000013', 'zz-b8-taller-d2', 'ZZ B8 Taller D2', 'b8000000-0000-4000-8000-000000000002', 'individual', NULL, 'temporada', NULL),
  ('b8000000-0000-4000-8000-000000000014', 'zz-b8-taller-dedup', 'ZZ B8 Taller Dedup', 'b8000000-0000-4000-8000-000000000006', 'individual', NULL, 'temporada', NULL);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('b8000000-0000-4000-8000-000000000030', 'authenticated', 'authenticated', 'b8-director1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000000-0000-4000-8000-000000000032', 'authenticated', 'authenticated', 'b8-director2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000000-0000-4000-8000-000000000034', 'authenticated', 'authenticated', 'b8-member@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000000-0000-4000-8000-000000000036', 'authenticated', 'authenticated', 'b8-a@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000000-0000-4000-8000-000000000038', 'authenticated', 'authenticated', 'b8-b@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000000-0000-4000-8000-000000000040', 'authenticated', 'authenticated', 'b8-c@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000000-0000-4000-8000-000000000042', 'authenticated', 'authenticated', 'b8-d@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000000-0000-4000-8000-000000000044', 'authenticated', 'authenticated', 'b8-e@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('b8000000-0000-4000-8000-000000000048', 'authenticated', 'authenticated', 'b8-h@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('b8000000-0000-4000-8000-000000000031', 'b8000000-0000-4000-8000-000000000030', 'ZZB8', 'Director1', 'b8-director1@example.test', 'Soltero', 'Otro'),
  ('b8000000-0000-4000-8000-000000000033', 'b8000000-0000-4000-8000-000000000032', 'ZZB8', 'Director2', 'b8-director2@example.test', 'Soltero', 'Otro'),
  ('b8000000-0000-4000-8000-000000000035', 'b8000000-0000-4000-8000-000000000034', 'ZZB8', 'Member', 'b8-member@example.test', 'Soltero', 'Otro'),
  ('b8000000-0000-4000-8000-000000000037', 'b8000000-0000-4000-8000-000000000036', 'ZZB8', 'A', 'b8-a@example.test', 'Soltero', 'Otro'),
  ('b8000000-0000-4000-8000-000000000039', 'b8000000-0000-4000-8000-000000000038', 'ZZB8', 'B', 'b8-b@example.test', 'Soltero', 'Otro'),
  ('b8000000-0000-4000-8000-000000000041', 'b8000000-0000-4000-8000-000000000040', 'ZZB8', 'C', 'b8-c@example.test', 'Soltero', 'Otro'),
  ('b8000000-0000-4000-8000-000000000043', 'b8000000-0000-4000-8000-000000000042', 'ZZB8', 'D Companero', 'b8-d@example.test', 'Soltero', 'Otro'),
  ('b8000000-0000-4000-8000-000000000045', 'b8000000-0000-4000-8000-000000000044', 'ZZB8', 'E Principal', 'b8-e@example.test', 'Soltero', 'Otro'),
  ('b8000000-0000-4000-8000-000000000046', NULL, 'ZZB8', 'F SobreCupo', 'b8-f@example.test', 'Soltero', 'Otro'),
  ('b8000000-0000-4000-8000-000000000048', 'b8000000-0000-4000-8000-000000000048', 'ZZB8', 'H Principal2', 'b8-h@example.test', 'Soltero', 'Otro'),
  ('b8000000-0000-4000-8000-000000000049', NULL, 'ZZB8', 'I Companero2', 'b8-i@example.test', 'Soltero', 'Otro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('b8000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000031', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'b8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000033', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'b8000000-0000-4000-8000-000000000002'),
  ('b8000000-0000-4000-8000-000000000033', 'talleres_crecimiento.director.read',  'talleres_crecimiento', 'taller', 'b8000000-0000-4000-8000-000000000002');

INSERT INTO public.talleres_temporadas (id, nombre, slug, fecha_apertura, fecha_cierre, estado, dream_team_equipo_id) VALUES
  ('b8000000-0000-4000-8000-000000000060', 'ZZ B8 2027 Borrador', 'zz-b8-2027-borrador', '2027-02-01', '2027-06-01', 'borrador', 'b8000000-0000-4000-8000-000000000001'),
  ('b8000000-0000-4000-8000-000000000061', 'ZZ B8 2027 Cerrada', 'zz-b8-2027-cerrada', '2027-02-01', '2027-06-01', 'cerrado', 'b8000000-0000-4000-8000-000000000001');

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata) VALUES
  ('b8000000-0000-4000-8000-000000000070', 'workshop', 'active', 'ZZ B8 Evento Temp', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b8000000-0000-4000-8000-000000000071', 'workshop', 'active', 'ZZ B8 Evento Pareja', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b8000000-0000-4000-8000-000000000072', 'workshop', 'active', 'ZZ B8 Evento D2', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb),
  ('b8000000-0000-4000-8000-000000000073', 'workshop', 'active', 'ZZ B8 Evento Cerrada', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb);

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
) VALUES
  ('b8000000-0000-4000-8000-000000000080', 'b8000000-0000-4000-8000-000000000070', 'b8000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ B8 Edicion Temp', 4, 60, 'permanente_custom',
   CURRENT_DATE + 3, CURRENT_DATE + 1, CURRENT_DATE + 30),
  ('b8000000-0000-4000-8000-000000000081', 'b8000000-0000-4000-8000-000000000071', 'b8000000-0000-4000-8000-000000000011',
   'pareja', 'matrimonio', 'permanente_custom', 'abierto', 'ZZ B8 Edicion Pareja', 4, 60, 'permanente_custom',
   CURRENT_DATE + 3, CURRENT_DATE + 1, CURRENT_DATE + 30),
  ('b8000000-0000-4000-8000-000000000082', 'b8000000-0000-4000-8000-000000000072', 'b8000000-0000-4000-8000-000000000013',
   'individual', NULL, 'permanente_custom', 'borrador', 'ZZ B8 Edicion D2', 1, 60, 'permanente_custom',
   NULL, NULL, NULL),
  ('b8000000-0000-4000-8000-000000000083', 'b8000000-0000-4000-8000-000000000073', 'b8000000-0000-4000-8000-000000000010',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ B8 Edicion Cerrada', 4, 60, 'permanente_custom',
   CURRENT_DATE - 30, CURRENT_DATE - 30, CURRENT_DATE - 1);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion) VALUES
  ('b8000000-0000-4000-8000-000000000090', 'b8000000-0000-4000-8000-000000000080', 'b8000000-0000-4000-8000-000000000003', 'ZZ B8 Cohorte Temp'),
  ('b8000000-0000-4000-8000-000000000091', 'b8000000-0000-4000-8000-000000000081', 'b8000000-0000-4000-8000-000000000004', 'ZZ B8 Cohorte Pareja');

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('b8000000-0000-4000-8000-000000000100', 'b8000000-0000-4000-8000-000000000090', 'ZZ B8 Grupo Temp', 2, 'activo'),
  ('b8000000-0000-4000-8000-000000000101', 'b8000000-0000-4000-8000-000000000091', 'ZZ B8 Grupo Pareja', 1, 'activo');

-- ══════════════════════════════════════════════════════════════════════
-- Item 1: self-enroll sobre_cupo forgery
-- ══════════════════════════════════════════════════════════════════════

-- (1a) member (no grants) self-enrolls with sobre_cupo=true forged. Postgres
-- fires BEFORE ROW triggers BEFORE evaluating an INSERT's WITH CHECK (the
-- trigger sees/can modify NEW first; RLS is checked on what the trigger
-- leaves behind) — so trg_taller_inscripciones_cupo's own flag check
-- (item 1b) always intercepts a sobre_cupo=true row before the self-enroll
-- WITH CHECK's own new `sobre_cupo = false` term is ever reached. The
-- forgery is still refused, just as P0001 SOBRE_CUPO_NO_AUTORIZADO rather
-- than a generic RLS 42501 — a MORE specific refusal, not a weaker one.
-- Since 20261003160000 the policy has no member branch at all (members
-- enroll through talleres_inscribirme, which never writes sobre_cupo), so
-- RLS would refuse this row too; the trigger still answers first.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000034');
SELECT pg_temp.assert_sqlstate_msg('(1a) member self-enroll forging sobre_cupo=true is refused (trigger runs before RLS WITH CHECK)',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado, sobre_cupo) VALUES (
      'b8000000-0000-4000-8000-000000000080', 'b8000000-0000-4000-8000-000000000090',
      'b8000000-0000-4000-8000-000000000035', 'pendiente', true)$$,
  'P0001', 'SOBRE_CUPO_NO_AUTORIZADO');
RESET ROLE;

SELECT pg_temp.assert_rows('(1a) the refused insert left no row',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'b8000000-0000-4000-8000-000000000080'
       AND persona_principal_id = 'b8000000-0000-4000-8000-000000000035'$$, 0);

-- (1b) postgres bypasses RLS but the trigger itself still requires the
-- session flag -> P0001 SOBRE_CUPO_NO_AUTORIZADO.
SELECT pg_temp.assert_sqlstate_msg('(1b) a direct postgres insert with sobre_cupo=true and no flag is refused',
  $$INSERT INTO public.taller_inscripciones (
      taller_id, cohorte_id, persona_principal_id, estado, sobre_cupo, sobre_cupo_por, sobre_cupo_en
    ) VALUES (
      'b8000000-0000-4000-8000-000000000080', 'b8000000-0000-4000-8000-000000000090',
      'b8000000-0000-4000-8000-000000000035', 'pendiente', true,
      'b8000000-0000-4000-8000-000000000031', now())$$,
  'P0001', 'SOBRE_CUPO_NO_AUTORIZADO');

SELECT pg_temp.assert_rows('(1b) the refused insert left no row',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'b8000000-0000-4000-8000-000000000080'
       AND persona_principal_id = 'b8000000-0000-4000-8000-000000000035'$$, 0);

-- ══════════════════════════════════════════════════════════════════════
-- Item 6 (+ setup for items 1c/7-personas): the cupo race/UPDATE path.
-- edicion_temp cupo=2. A self-enrolls, C self-enrolls (full), C retires
-- (freed), B self-enrolls (full again), then C's row moves retirado ->
-- pendiente while full -> CUPO_LLENO. Members self-enroll through
-- talleres_inscribirme (20261003160000).
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000036');
SELECT pg_temp.assert_rows('(6-setup) A self-enrolls into edicion_temp',
  $$SELECT 1 WHERE (public.talleres_inscribirme('b8000000-0000-4000-8000-000000000080'::uuid) ->> 'ok')::boolean$$, 1);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000040');
SELECT pg_temp.assert_rows('(6-setup) C self-enrolls into edicion_temp (fills cupo)',
  $$SELECT 1 WHERE (public.talleres_inscribirme('b8000000-0000-4000-8000-000000000080'::uuid) ->> 'ok')::boolean$$, 1);
RESET ROLE;

SELECT pg_temp.assert_no_error('(6-setup) C is retired (frees the seat, never gated)',
  $$UPDATE public.taller_inscripciones SET estado = 'retirado'
     WHERE taller_id = 'b8000000-0000-4000-8000-000000000080'
       AND persona_principal_id = 'b8000000-0000-4000-8000-000000000041'$$);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000038');
SELECT pg_temp.assert_rows('(6-setup) B self-enrolls into edicion_temp (fills cupo again)',
  $$SELECT 1 WHERE (public.talleres_inscribirme('b8000000-0000-4000-8000-000000000080'::uuid) ->> 'ok')::boolean$$, 1);
RESET ROLE;

-- (6) the core case: C's row transitions retirado -> pendiente while the
-- edicion is already full (A + B) -> CUPO_LLENO.
SELECT pg_temp.assert_sqlstate_msg('(6) retirado -> pendiente on a full edicion is refused',
  $$UPDATE public.taller_inscripciones SET estado = 'pendiente'
     WHERE taller_id = 'b8000000-0000-4000-8000-000000000080'
       AND persona_principal_id = 'b8000000-0000-4000-8000-000000000041'$$,
  'P0001', 'CUPO_LLENO');

SELECT pg_temp.assert_rows('(6) C''s row is still retirado (the update did not partially apply)',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'b8000000-0000-4000-8000-000000000080'
       AND persona_principal_id = 'b8000000-0000-4000-8000-000000000041'
       AND estado = 'retirado'$$, 1);

-- structural: the gate function body actually takes the advisory lock.
SELECT pg_temp.assert_rows('structural: talleres_inscripciones_cupo_gate body contains pg_advisory_xact_lock',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_inscripciones_cupo_gate'
       AND pg_get_functiondef(p.oid) LIKE '%pg_advisory_xact_lock%'$$, 1);

-- structural: the trigger now fires on UPDATE OF estado too, not just INSERT.
SELECT pg_temp.assert_rows('structural: trg_taller_inscripciones_cupo fires on UPDATE OF estado',
  $$SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.taller_inscripciones'::regclass
       AND tgname = 'trg_taller_inscripciones_cupo'
       AND NOT tgisinternal
       AND pg_get_triggerdef(oid) LIKE '%UPDATE OF estado%'$$, 1);

-- ══════════════════════════════════════════════════════════════════════
-- Item 1c: the RPC path (talleres_inscribir_sobre_cupo) still works —
-- edicion_temp is full (A+B), director1 places F over cupo.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('(1c) talleres_inscribir_sobre_cupo(edicion_temp, F) succeeds with sobre_cupo=true',
  $$SELECT 1 FROM (SELECT public.talleres_inscribir_sobre_cupo(
       'b8000000-0000-4000-8000-000000000080'::uuid, 'b8000000-0000-4000-8000-000000000046'::uuid) AS r) q
     WHERE (r->>'sobre_cupo')::boolean = true AND (r->>'inscripcion_id') IS NOT NULL$$, 1);
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- Item 7 (personas): talleres_cupo_edicion(edicion_temp) — unidad and
-- occupancy after the dance above (A + B + F = 3 ocupados, cupo 2,
-- disponibles 0, sobre_cupo 1).
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('(7-personas) talleres_cupo_edicion(edicion_temp): unidad=personas, cupo=2/ocupados=3/sobre_cupo=1',
  $$SELECT 1 FROM public.talleres_cupo_edicion('b8000000-0000-4000-8000-000000000080'::uuid)
     WHERE unidad = 'personas' AND cupo = 2 AND ocupados = 3 AND disponibles = 0 AND sobre_cupo = 1$$, 1);
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- Item 2: taller_ediciones.temporada_id guard.
-- ══════════════════════════════════════════════════════════════════════

-- (2a) director2 (D2) points their OWN edicion_d2 at D1's temporada -> the
-- new trigger refuses it directly, with no junction row ever touched.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000032');
SELECT pg_temp.assert_sqlstate_msg('(2a) director2 cannot point edicion_d2 at D1''s temporada',
  $$UPDATE public.taller_ediciones SET temporada_id = 'b8000000-0000-4000-8000-000000000060'
     WHERE id = 'b8000000-0000-4000-8000-000000000082'$$,
  'P0001', 'TALLER_FUERA_DE_LA_DIRECCION');
RESET ROLE;

SELECT pg_temp.assert_rows('(2a) edicion_d2.temporada_id is still NULL',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = 'b8000000-0000-4000-8000-000000000082' AND temporada_id IS NULL$$, 1);

-- (2b) sanity: director1 (D1) points their OWN edicion_temp at D1's own
-- temporada -> same tree, succeeds.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_no_error('(2b) director1 CAN point edicion_temp at D1''s own temporada',
  $$UPDATE public.taller_ediciones SET temporada_id = 'b8000000-0000-4000-8000-000000000060'
     WHERE id = 'b8000000-0000-4000-8000-000000000080'$$);
RESET ROLE;

SELECT pg_temp.assert_rows('(2b) edicion_temp.temporada_id is now set',
  $$SELECT 1 FROM public.taller_ediciones
     WHERE id = 'b8000000-0000-4000-8000-000000000080'
       AND temporada_id = 'b8000000-0000-4000-8000-000000000060'$$, 1);

-- ══════════════════════════════════════════════════════════════════════
-- Item 3: temporada state not checked.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000030');

SELECT pg_temp.assert_sqlstate_msg('(3a) talleres_crear_edicion refuses a cerrado temporada',
  $$SELECT public.talleres_crear_edicion(
      'b8000000-0000-4000-8000-000000000010', NULL, 'b8000000-0000-4000-8000-000000000061')$$,
  'P0001', 'TEMPORADA_NO_DISPONIBLE');

SELECT pg_temp.assert_sqlstate_msg('(3b) talleres_agregar_taller_a_temporada refuses a cerrado temporada',
  $$SELECT public.talleres_agregar_taller_a_temporada(
      'b8000000-0000-4000-8000-000000000061', 'b8000000-0000-4000-8000-000000000010')$$,
  'P0001', 'TEMPORADA_NO_DISPONIBLE');

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- Item 4: open_edicion loses its EXECUTE grant for authenticated.
-- ══════════════════════════════════════════════════════════════════════

-- director1 (who DOES have director.write on this taller's own tree) is
-- used here on purpose: a no-capability member would already get 42501
-- from open_edicion's OWN internal authority check, which would pass this
-- assertion for the wrong reason both before and after this migration.
-- Using director1 isolates the ONE thing being tested — the REVOKEd grant
-- itself, checked by Postgres before the function body ever runs.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_sqlstate('(4) an authenticated direct call to open_edicion is refused (permission denied)',
  $$SELECT public.open_edicion(
      'b8000000-0000-4000-8000-000000000010'::uuid, 'individual', 'ZZ probe', NULL,
      1, 60, 'periodo_general', now(), NULL, '[]'::jsonb, NULL)$$,
  '42501');
RESET ROLE;

SELECT pg_temp.assert_rows('structural: open_edicion has no authenticated in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'open_edicion'
       AND NOT (p.proacl::text LIKE '%authenticated=%')$$, 1);
SELECT pg_temp.assert_rows('structural: open_edicion keeps EXECUTE for postgres and service_role',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'open_edicion'
       AND p.proacl::text LIKE '%postgres=X%' AND p.proacl::text LIKE '%service_role=X%'$$, 1);

-- ══════════════════════════════════════════════════════════════════════
-- Item 5: create_taller_abstract honors p_regimen (wins) / derives it.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000030');

DO $regimen_explicit$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.create_taller_abstract(
    'ZZ B8 Taller Regimen Explicit', NULL, 'permanente_custom', NULL, NULL,
    'b8000000-0000-4000-8000-000000000001', 'temporada'
  );
  INSERT INTO t_h6_fixture (key, id) VALUES ('taller_regimen_explicit', (v_resultado ->> 'taller_id')::uuid);
END;
$regimen_explicit$;

SELECT pg_temp.assert_rows('(5a) p_regimen=temporada wins over modalidad=permanente_custom (would derive cadencia)',
  $$SELECT 1 FROM public.talleres
     WHERE id = (SELECT id FROM t_h6_fixture WHERE key = 'taller_regimen_explicit')
       AND regimen = 'temporada' AND modalidad_default = 'periodo_general'$$, 1);

DO $regimen_derived$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.create_taller_abstract(
    'ZZ B8 Taller Regimen Derived', NULL, 'permanente_custom', NULL, NULL,
    'b8000000-0000-4000-8000-000000000001', NULL
  );
  INSERT INTO t_h6_fixture (key, id) VALUES ('taller_regimen_derived', (v_resultado ->> 'taller_id')::uuid);
END;
$regimen_derived$;

SELECT pg_temp.assert_rows('(5b) p_regimen omitted derives cadencia from modalidad=permanente_custom',
  $$SELECT 1 FROM public.talleres
     WHERE id = (SELECT id FROM t_h6_fixture WHERE key = 'taller_regimen_derived')
       AND regimen = 'cadencia' AND modalidad_default = 'permanente_custom'$$, 1);

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- Item 8: talleres_inscribir_sobre_cupo — companero, EDICION_NO_ABIERTA,
-- sobre_cupo only when actually full. edicion_pareja cupo=1.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000030');

-- (8a) pareja edicion, no companero -> COMPANERO_REQUERIDO.
SELECT pg_temp.assert_sqlstate_msg('(8a) sobre-cupo on a pareja edicion without companero is refused',
  $$SELECT public.talleres_inscribir_sobre_cupo(
      'b8000000-0000-4000-8000-000000000081'::uuid, 'b8000000-0000-4000-8000-000000000045'::uuid, NULL)$$,
  'P0001', 'COMPANERO_REQUERIDO');

-- (8b) edicion_pareja is NOT yet full (cupo=1, 0 ocupados) -> a normal
-- insert, sobre_cupo=false, companero + link_type stored like self-enroll.
DO $sobre_cupo_no_lleno$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_inscribir_sobre_cupo(
    'b8000000-0000-4000-8000-000000000081'::uuid, 'b8000000-0000-4000-8000-000000000045'::uuid,
    'b8000000-0000-4000-8000-000000000043'::uuid
  );
  INSERT INTO t_h6_resultado (key, valor) VALUES ('8b', v_resultado);
END;
$sobre_cupo_no_lleno$;

SELECT pg_temp.assert_rows('(8b) not-yet-full: sobre_cupo=false in the jsonb result',
  $$SELECT 1 FROM t_h6_resultado WHERE key = '8b' AND (valor ->> 'sobre_cupo')::boolean = false$$, 1);
SELECT pg_temp.assert_rows('(8b) the stored row: sobre_cupo=false, companero + link_type set like self-enroll',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'b8000000-0000-4000-8000-000000000081'
       AND persona_principal_id = 'b8000000-0000-4000-8000-000000000045'
       AND sobre_cupo = false AND sobre_cupo_por IS NULL AND sobre_cupo_en IS NULL
       AND companero_id = 'b8000000-0000-4000-8000-000000000043'
       AND link_type = 'matrimonio'$$, 1);

-- (8c) edicion_pareja is NOW full (1/1 from 8b) -> a SECOND placement is
-- genuinely sobre_cupo=true.
DO $sobre_cupo_lleno$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_inscribir_sobre_cupo(
    'b8000000-0000-4000-8000-000000000081'::uuid, 'b8000000-0000-4000-8000-000000000048'::uuid,
    'b8000000-0000-4000-8000-000000000049'::uuid
  );
  INSERT INTO t_h6_resultado (key, valor) VALUES ('8c', v_resultado);
END;
$sobre_cupo_lleno$;

SELECT pg_temp.assert_rows('(8c) full: sobre_cupo=true in the jsonb result',
  $$SELECT 1 FROM t_h6_resultado WHERE key = '8c' AND (valor ->> 'sobre_cupo')::boolean = true$$, 1);
SELECT pg_temp.assert_rows('(8c) the stored row: sobre_cupo=true, por/en set',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'b8000000-0000-4000-8000-000000000081'
       AND persona_principal_id = 'b8000000-0000-4000-8000-000000000048'
       AND sobre_cupo = true AND sobre_cupo_por = 'b8000000-0000-4000-8000-000000000031'
       AND sobre_cupo_en IS NOT NULL$$, 1);

-- (8d) EDICION_NO_ABIERTA: edicion_cerrada's effective state is cerrado.
SELECT pg_temp.assert_sqlstate_msg('(8d) sobre-cupo on a cerrado edicion is refused',
  $$SELECT public.talleres_inscribir_sobre_cupo(
      'b8000000-0000-4000-8000-000000000083'::uuid, 'b8000000-0000-4000-8000-000000000046'::uuid)$$,
  'P0001', 'EDICION_NO_ABIERTA');

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- Item 7 (parejas, continued): sobre_cupo excludes retirado — retire H's
-- (8c's) sobre_cupo=true row and confirm the count drops to 0.
-- ══════════════════════════════════════════════════════════════════════

SELECT pg_temp.assert_no_error('(7-parejas setup) H''s sobre-cupo row is retired',
  $$UPDATE public.taller_inscripciones SET estado = 'retirado'
     WHERE taller_id = 'b8000000-0000-4000-8000-000000000081'
       AND persona_principal_id = 'b8000000-0000-4000-8000-000000000048'$$);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000030');
SELECT pg_temp.assert_rows('(7-parejas) unidad=parejas, sobre_cupo excludes the retirado row (now 0)',
  $$SELECT 1 FROM public.talleres_cupo_edicion('b8000000-0000-4000-8000-000000000081'::uuid)
     WHERE unidad = 'parejas' AND cupo = 1 AND ocupados = 1 AND sobre_cupo = 0$$, 1);
RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- Item 9: talleres_crear_temporada de-duplicates p_taller_ids.
-- ══════════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('b8000000-0000-4000-8000-000000000030');

DO $dedup$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_crear_temporada(
    'b8000000-0000-4000-8000-000000000001', 'ZZ B8 Temporada Dedup', DATE '2027-07-01', DATE '2027-09-01',
    ARRAY['b8000000-0000-4000-8000-000000000014', 'b8000000-0000-4000-8000-000000000014']::uuid[]
  );
  INSERT INTO t_h6_resultado (key, valor) VALUES ('dedup', v_resultado);
END;
$dedup$;

SELECT pg_temp.assert_rows('(9) the same taller_id passed twice still yields exactly 1 edicion',
  $$SELECT 1 FROM t_h6_resultado WHERE key = 'dedup' AND jsonb_array_length(valor -> 'ediciones') = 1$$, 1);

-- ══════════════════════════════════════════════════════════════════════
-- Item 10: talleres_crear_edicion COALESCEs an explicit NULL p_adelantar.
-- ══════════════════════════════════════════════════════════════════════

DO $adelantar_null$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_crear_edicion(
    'b8000000-0000-4000-8000-000000000012', DATE '2026-02-01', NULL, NULL
  );
  INSERT INTO t_h6_resultado (key, valor) VALUES ('adelantar_null', v_resultado);
END;
$adelantar_null$;

SELECT pg_temp.assert_rows('(10) an explicit NULL p_adelantar still creates exactly 1 edicion (not zero)',
  $$SELECT 1 FROM t_h6_resultado WHERE key = 'adelantar_null'
     AND jsonb_array_length(valor -> 'ediciones') = 1
     AND (valor -> 'ediciones' -> 0 ->> 'nombre') = 'Febrero 2026'$$, 1);

-- ══════════════════════════════════════════════════════════════════════
-- Item 11: month-name collision across SEPARATE talleres_crear_edicion
-- calls (not just within one p_adelantar loop).
-- ══════════════════════════════════════════════════════════════════════

DO $mayo_1$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_crear_edicion(
    'b8000000-0000-4000-8000-000000000012', DATE '2026-05-01', NULL, 0
  );
  INSERT INTO t_h6_resultado (key, valor) VALUES ('mayo_1', v_resultado);
END;
$mayo_1$;

SELECT pg_temp.assert_rows('(11a) first May call: "Mayo 2026"',
  $$SELECT 1 FROM t_h6_resultado WHERE key = 'mayo_1'
     AND (valor -> 'ediciones' -> 0 ->> 'nombre') = 'Mayo 2026'$$, 1);

DO $mayo_2$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.talleres_crear_edicion(
    'b8000000-0000-4000-8000-000000000012', DATE '2026-05-15', NULL, 0
  );
  INSERT INTO t_h6_resultado (key, valor) VALUES ('mayo_2', v_resultado);
END;
$mayo_2$;

SELECT pg_temp.assert_rows('(11b) a SEPARATE call landing in the same month is disambiguated: "Mayo 2026 (15)"',
  $$SELECT 1 FROM t_h6_resultado WHERE key = 'mayo_2'
     AND (valor -> 'ediciones' -> 0 ->> 'nombre') = 'Mayo 2026 (15)'$$, 1);

RESET ROLE;

-- ══════════════════════════════════════════════════════════════════════
-- Item 12: talleres_hoy() — structural.
-- ══════════════════════════════════════════════════════════════════════

SELECT pg_temp.assert_rows('structural: talleres_estado_efectivo(taller_ediciones) body calls talleres_hoy()',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_estado_efectivo'
       AND pg_get_function_identity_arguments(p.oid) = 'p_edicion taller_ediciones'
       AND pg_get_functiondef(p.oid) LIKE '%talleres_hoy()%'$$, 1);

-- ══════════════════════════════════════════════════════════════════════
-- Structural — proacl posture of the other new/changed functions.
-- ══════════════════════════════════════════════════════════════════════

SELECT pg_temp.assert_rows('structural: talleres_nodo_en_arbol has NO authenticated/anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_nodo_en_arbol'
       AND NOT (p.proacl::text LIKE '%anon=%')
       AND NOT (p.proacl::text LIKE '%authenticated=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_hoy has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_hoy'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_cupo_edicion has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_cupo_edicion'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: talleres_inscribir_sobre_cupo has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'talleres_inscribir_sobre_cupo'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: create_taller_abstract has no anon in proacl',
  $$SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_taller_abstract'
       AND NOT (p.proacl::text LIKE '%anon=%')$$, 1);
SELECT pg_temp.assert_rows('structural: trg_taller_ediciones_temporada_misma_direccion exists on taller_ediciones',
  $$SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.taller_ediciones'::regclass
       AND tgname = 'trg_taller_ediciones_temporada_misma_direccion'
       AND NOT tgisinternal$$, 1);

-- report() runs as postgres again: it reads the temp table and raises.
RESET ROLE;
SELECT pg_temp.report();

ROLLBACK;
