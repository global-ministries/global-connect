-- R3i + R3j (odd/tasks/talleres-rediseno.md, S8 S9, L8) — RED→GREEN for
-- 20261111140000_talleres_origen_admin_y_avisame_conteo.sql:
--   R3i staff inscriptions are origen 'admin' (talleres_inscribir_sobre_cupo
--       writes it; the staff insert policy accepts it on the direct insert
--       of «Inscribir a alguien»); older rows keep 'app'.
--   R3j talleres_avisame_lugar_contar(uuid[]) counts the «Avísame» requests
--       not yet notified, only for ediciones the caller reads as staff.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept; fixture
-- ids live under d3a10000-..., emails end in @example.test. For the GREEN
-- run, paste the migration right after this file's BEGIN.
--
-- Every assertion runs through a pg_temp helper that records failures
-- instead of aborting, so the RED run (migration NOT applied) reaches
-- pg_temp.report() and lists every failing case.
--
-- H = talleres_hoy(), captured once into zz_r3.h.
-- Nodes: ROOT d3a1…01 > UNO …02, DOS …03 (one taller per node).
-- Talleres: T_uno …10 (individual, on UNO), T_dos …11 (individual, on DOS).
-- Ediciones (event …8<n>, cohorte …c<n>), all abierto:
--   E1 …91 (T_uno), grupo …41 capacidad 1 (cupo 1), filled by P0's
--     pendiente (origen app, written before the change);
--   E2 …92 (T_dos), no grupo;
--   E3 …93 (T_uno), no grupo (no cupo).
-- Persons: COORD …21/a1 coordinator.write+read at UNO; OTRO …22/a2
--   authenticated without any grant; P0 …30, P1 …31, P2 …32 (no account).
-- «Avísame» rows: E1 three (one already notified), E2 one, E3 none.
--
-- Covered:
--   1. Structure: contar is SECURITY DEFINER with search_path='', returns
--      only (edicion_id, pendientes); no PUBLIC entry, anon cannot run it,
--      authenticated and service_role can. sobre_cupo keeps SECURITY
--      DEFINER, search_path=public and its grants.
--   2. R3i: COORD places P1 over the cupo of E1: the row is sobre_cupo and
--      origen 'admin'; P0's older row stays 'app'.
--   3. R3i: COORD's direct insert with origen 'admin' (the action's shape)
--      passes taller_inscripciones_insert.
--   4. R3j: COORD gets E1 = 2 (the notified row excluded) and E3 = 0, no
--      row for E2 (not managed) nor for an unknown id.
--   5. R3j: OTRO (authenticated, no grant) gets zero rows.
--   6. R3j: anon cannot execute it (42501).
--
-- The MCP connection is `postgres` (BYPASSRLS) — every authority
-- assertion runs under SET LOCAL ROLE authenticated/anon + jwt claims;
-- data assertions run as postgres.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

SELECT set_config('zz_r3.h', public.talleres_hoy()::text, true);

CREATE TEMP TABLE t_r3_failures (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_r3_failures TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.h() RETURNS date LANGUAGE sql AS $$
  SELECT current_setting('zz_r3.h')::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_r3_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_msg text;
BEGIN
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_r3_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s):\n%', v_n, v_msg;
  END IF;
  RETURN 'all cases ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- postgres' default privileges no longer give PUBLIC EXECUTE on the
-- functions it creates, temp ones included.
GRANT EXECUTE ON FUNCTION pg_temp.h(), pg_temp.fail(text, text), pg_temp.assert_sqlstate(text, text, text),
  pg_temp.assert_rows(text, text, int), pg_temp.assert_no_error(text, text), pg_temp.as_persona(uuid)
  TO authenticated, anon;

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('d3a10000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ R3 Raiz', NULL, true),
  ('d3a10000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ R3 Uno', 'd3a10000-0000-4000-8000-000000000001', true),
  ('d3a10000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ R3 Dos', 'd3a10000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('d3a10000-0000-4000-8000-000000000010', 'zz-r3-uno', 'ZZ R3 Uno', 'd3a10000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 7, -3),
  ('d3a10000-0000-4000-8000-000000000011', 'zz-r3-dos', 'ZZ R3 Dos', 'd3a10000-0000-4000-8000-000000000003', 'individual', NULL, 'cadencia', 7, -3);

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata)
SELECT ('d3a10000-0000-4000-8000-00000000008' || n)::uuid, 'workshop', 'active', 'ZZ R3 Evento ' || n, CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb
  FROM generate_series(1, 3) AS n;

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
)
SELECT ('d3a10000-0000-4000-8000-00000000009' || x.n)::uuid, ('d3a10000-0000-4000-8000-00000000008' || x.n)::uuid, x.taller::uuid,
       'individual', NULL, 'permanente_custom', 'abierto', 'ZZ R3 E' || x.n, 3, 90, 'permanente_custom',
       pg_temp.h() + 8, pg_temp.h() + 5, pg_temp.h() + 30
  FROM (VALUES
    (1, 'd3a10000-0000-4000-8000-000000000010'),
    (2, 'd3a10000-0000-4000-8000-000000000011'),
    (3, 'd3a10000-0000-4000-8000-000000000010')
  ) AS x(n, taller);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at) VALUES
  ('d3a10000-0000-4000-8000-0000000000c1', 'd3a10000-0000-4000-8000-000000000091', 'd3a10000-0000-4000-8000-000000000002', 'ZZ R3 Cohorte 1', (pg_temp.h() + 8)::timestamptz),
  ('d3a10000-0000-4000-8000-0000000000c2', 'd3a10000-0000-4000-8000-000000000092', 'd3a10000-0000-4000-8000-000000000003', 'ZZ R3 Cohorte 2', (pg_temp.h() + 8)::timestamptz),
  ('d3a10000-0000-4000-8000-0000000000c3', 'd3a10000-0000-4000-8000-000000000093', 'd3a10000-0000-4000-8000-000000000002', 'ZZ R3 Cohorte 3', (pg_temp.h() + 8)::timestamptz);

-- E1's cupo is 1 (its only grupo).
INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('d3a10000-0000-4000-8000-000000000041', 'd3a10000-0000-4000-8000-0000000000c1', 'ZZ R3 Cupo uno', 1, 'activo');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('d3a10000-0000-4000-8000-0000000000' || a)::uuid, 'authenticated', 'authenticated', 'd3a1-' || a || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY['a1', 'a2', 'a3', 'a4', 'a5']) AS a
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  ('d3a10000-0000-4000-8000-000000000021', 'd3a10000-0000-4000-8000-0000000000a1', 'Carla', 'ZZR3 Coord', 'd3a1-a1@example.test', 'Soltero', 'Femenino'),
  ('d3a10000-0000-4000-8000-000000000022', 'd3a10000-0000-4000-8000-0000000000a2', 'Otto', 'ZZR3 Otro', 'd3a1-a2@example.test', 'Soltero', 'Masculino'),
  ('d3a10000-0000-4000-8000-000000000023', 'd3a10000-0000-4000-8000-0000000000a3', 'Lia', 'ZZR3 Voluntaria', 'd3a1-a3@example.test', 'Soltero', 'Femenino'),
  ('d3a10000-0000-4000-8000-000000000024', 'd3a10000-0000-4000-8000-0000000000a4', 'Leo', 'ZZR3 Lider', 'd3a1-a4@example.test', 'Soltero', 'Masculino'),
  ('d3a10000-0000-4000-8000-000000000025', 'd3a10000-0000-4000-8000-0000000000a5', 'Dora', 'ZZR3 Directora', 'd3a1-a5@example.test', 'Soltero', 'Femenino'),
  ('d3a10000-0000-4000-8000-000000000030', NULL, 'Pía', 'ZZR3 Cero', NULL, 'Soltero', 'Femenino'),
  ('d3a10000-0000-4000-8000-000000000031', NULL, 'Rita', 'ZZR3 Uno', NULL, 'Soltero', 'Femenino'),
  ('d3a10000-0000-4000-8000-000000000032', NULL, 'Sara', 'ZZR3 Dos', NULL, 'Soltero', 'Femenino');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('d3a10000-0000-4000-8000-000000000021', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'd3a10000-0000-4000-8000-000000000002'),
  ('d3a10000-0000-4000-8000-000000000021', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'd3a10000-0000-4000-8000-000000000002'),
  ('d3a10000-0000-4000-8000-000000000023', 'talleres_crecimiento.volunteer.read', 'talleres_crecimiento', 'taller', 'd3a10000-0000-4000-8000-000000000001'),
  ('d3a10000-0000-4000-8000-000000000024', 'talleres_crecimiento.lead.read', 'talleres_crecimiento', 'taller', 'd3a10000-0000-4000-8000-000000000001'),
  ('d3a10000-0000-4000-8000-000000000025', 'talleres_crecimiento.director.read', 'talleres_crecimiento', 'taller', 'd3a10000-0000-4000-8000-000000000001');

-- P0: written before the change, default origen (app); fills E1's cupo.
INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado) VALUES
  ('d3a10000-0000-4000-8000-000000000050', 'd3a10000-0000-4000-8000-000000000091', 'd3a10000-0000-4000-8000-0000000000c1', 'd3a10000-0000-4000-8000-000000000030', 'pendiente');

-- «Avísame» requests: E1 two waiting + one already notified, E2 one.
INSERT INTO public.taller_avisame_lugar (id, edicion_id, nombre, email, usuario_id, ip_hash, notificado_en) VALUES
  ('d3a10000-0000-4000-8000-0000000000b1', 'd3a10000-0000-4000-8000-000000000091', 'Ana Espera', 'ana.r3@example.test', NULL, repeat('a', 64), NULL),
  ('d3a10000-0000-4000-8000-0000000000b2', 'd3a10000-0000-4000-8000-000000000091', 'Bea Espera', 'bea.r3@example.test', NULL, repeat('b', 64), NULL),
  ('d3a10000-0000-4000-8000-0000000000b3', 'd3a10000-0000-4000-8000-000000000091', 'Cris Avisada', 'cris.r3@example.test', NULL, repeat('c', 64), now()),
  ('d3a10000-0000-4000-8000-0000000000b4', 'd3a10000-0000-4000-8000-000000000092', 'Dora Espera', 'dora.r3@example.test', NULL, repeat('d', 64), NULL);

-- ══ 1. Structure ══

SELECT pg_temp.assert_rows('1: contar is SECURITY DEFINER with search_path=''''',
  $$SELECT 1 FROM pg_proc
     WHERE oid = to_regprocedure('public.talleres_avisame_lugar_contar(uuid[])')
       AND prosecdef AND proconfig = ARRAY['search_path=""']$$, 1);
SELECT pg_temp.assert_rows('1: contar returns only edicion_id and pendientes (no name, no email)',
  $$SELECT 1 FROM pg_proc
     WHERE oid = to_regprocedure('public.talleres_avisame_lugar_contar(uuid[])')
       AND pg_get_function_result(oid) = 'TABLE(edicion_id uuid, pendientes integer)'$$, 1);
SELECT pg_temp.assert_rows('1: contar: no PUBLIC entry, anon cannot execute, authenticated and service_role can',
  $$SELECT 1 FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.talleres_avisame_lugar_contar(uuid[])')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0)
       AND NOT has_function_privilege('anon', p.oid, 'execute')
       AND has_function_privilege('authenticated', p.oid, 'execute')
       AND has_function_privilege('service_role', p.oid, 'execute')$$, 1);
SELECT pg_temp.assert_rows('1: taller_avisame_lugar stays unreadable for anon and authenticated',
  $$SELECT 1 WHERE NOT has_table_privilege('anon', 'public.taller_avisame_lugar', 'select')
               AND NOT has_table_privilege('authenticated', 'public.taller_avisame_lugar', 'select')$$, 1);
SELECT pg_temp.assert_rows('1: sobre_cupo keeps SECURITY DEFINER, search_path=public and its grants',
  $$SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.talleres_inscribir_sobre_cupo(uuid, uuid, uuid)'::regprocedure
       AND p.prosecdef AND p.proconfig = ARRAY['search_path=public']
       AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) x WHERE x.grantee = 0)
       AND NOT has_function_privilege('anon', p.oid, 'execute')
       AND has_function_privilege('authenticated', p.oid, 'execute')
       AND has_function_privilege('service_role', p.oid, 'execute')$$, 1);

-- ══ 2. R3i: sobre cupo by the team is origen admin ══

SELECT pg_temp.assert_rows('2: E1 is full before the placement',
  $$SELECT 1 FROM public.talleres_cupo_edicion_calculo('d3a10000-0000-4000-8000-000000000091') c
     WHERE c.cupo = 1 AND c.ocupados = 1$$, 1);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('d3a10000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_no_error('2: COORD places P1 over the cupo of E1',
  $$SELECT public.talleres_inscribir_sobre_cupo('d3a10000-0000-4000-8000-000000000091', 'd3a10000-0000-4000-8000-000000000031', NULL)$$);
RESET ROLE;

SELECT pg_temp.assert_rows('2: P1''s row is sobre_cupo, placed by COORD, origen admin',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'd3a10000-0000-4000-8000-000000000091'
       AND persona_principal_id = 'd3a10000-0000-4000-8000-000000000031'
       AND sobre_cupo AND sobre_cupo_por = 'd3a10000-0000-4000-8000-000000000021'
       AND origen = 'admin'$$, 1);
SELECT pg_temp.assert_rows('2: P0''s older row stays origen app',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE id = 'd3a10000-0000-4000-8000-000000000050' AND origen = 'app'$$, 1);

-- ══ 3. R3i: the direct insert of «Inscribir a alguien» ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('d3a10000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_no_error('3: COORD inserts P2 in E3 with origen admin under RLS',
  $$INSERT INTO public.taller_inscripciones (taller_id, cohorte_id, persona_principal_id, estado, origen) VALUES
      ('d3a10000-0000-4000-8000-000000000093', 'd3a10000-0000-4000-8000-0000000000c3', 'd3a10000-0000-4000-8000-000000000032', 'pendiente', 'admin')$$);
RESET ROLE;

SELECT pg_temp.assert_rows('3: P2''s row in E3 is origen admin',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'd3a10000-0000-4000-8000-000000000093'
       AND persona_principal_id = 'd3a10000-0000-4000-8000-000000000032'
       AND origen = 'admin'$$, 1);

-- ══ 4. R3j: a manager gets the counts of what they manage ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('d3a10000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_rows('4: COORD gets exactly two rows (E1 and E3; not E2, not an unknown id)',
  $$SELECT * FROM public.talleres_avisame_lugar_contar(ARRAY[
      'd3a10000-0000-4000-8000-000000000091', 'd3a10000-0000-4000-8000-000000000092',
      'd3a10000-0000-4000-8000-000000000093', 'd3a10000-0000-4000-8000-0000000000ff']::uuid[])$$, 2);
SELECT pg_temp.assert_rows('4: E1 counts 2 (the notified request is excluded)',
  $$SELECT 1 FROM public.talleres_avisame_lugar_contar(ARRAY['d3a10000-0000-4000-8000-000000000091']::uuid[]) r
     WHERE r.edicion_id = 'd3a10000-0000-4000-8000-000000000091' AND r.pendientes = 2$$, 1);
SELECT pg_temp.assert_rows('4: E3 counts 0',
  $$SELECT 1 FROM public.talleres_avisame_lugar_contar(ARRAY['d3a10000-0000-4000-8000-000000000093']::uuid[]) r
     WHERE r.edicion_id = 'd3a10000-0000-4000-8000-000000000093' AND r.pendientes = 0$$, 1);
SELECT pg_temp.assert_rows('4: no row for E2 (another node)',
  $$SELECT 1 FROM public.talleres_avisame_lugar_contar(ARRAY['d3a10000-0000-4000-8000-000000000092']::uuid[])$$, 0);
SELECT pg_temp.assert_rows('4: an empty or NULL array gives no row',
  $$SELECT 1 FROM public.talleres_avisame_lugar_contar(NULL) UNION ALL
    SELECT 1 FROM public.talleres_avisame_lugar_contar('{}'::uuid[])$$, 0);
RESET ROLE;

-- ══ 5. R3j: an authenticated user without a grant gets nothing ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('d3a10000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_rows('5: OTRO gets zero rows',
  $$SELECT * FROM public.talleres_avisame_lugar_contar(ARRAY[
      'd3a10000-0000-4000-8000-000000000091', 'd3a10000-0000-4000-8000-000000000092',
      'd3a10000-0000-4000-8000-000000000093']::uuid[])$$, 0);
RESET ROLE;

-- ══ 6. R3j: anon cannot run it ══

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_sqlstate('6: anon gets 42501',
  $$SELECT * FROM public.talleres_avisame_lugar_contar(ARRAY['d3a10000-0000-4000-8000-000000000091']::uuid[])$$, '42501');
RESET ROLE;

-- 7. Only dirección and coordinación see the count (L9): volunteer.read and
--    lead.read get no row, a director on the root reaches every edición below.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('d3a10000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_rows('7: volunteer.read on ROOT gets no row',
  $$SELECT 1 FROM public.talleres_avisame_lugar_contar(ARRAY['d3a10000-0000-4000-8000-000000000091','d3a10000-0000-4000-8000-000000000092','d3a10000-0000-4000-8000-000000000093']::uuid[])$$, 0);
SELECT pg_temp.as_persona('d3a10000-0000-4000-8000-0000000000a4');
SELECT pg_temp.assert_rows('7: lead.read on ROOT gets no row',
  $$SELECT 1 FROM public.talleres_avisame_lugar_contar(ARRAY['d3a10000-0000-4000-8000-000000000091','d3a10000-0000-4000-8000-000000000092','d3a10000-0000-4000-8000-000000000093']::uuid[])$$, 0);
SELECT pg_temp.as_persona('d3a10000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_rows('7: director.read on ROOT reads E1, E2 and E3 through ancestors',
  $$SELECT 1 FROM public.talleres_avisame_lugar_contar(ARRAY['d3a10000-0000-4000-8000-000000000091','d3a10000-0000-4000-8000-000000000092','d3a10000-0000-4000-8000-000000000093']::uuid[])$$, 3);
SELECT pg_temp.assert_rows('7: E2 counts 1',
  $$SELECT 1 FROM public.talleres_avisame_lugar_contar(ARRAY['d3a10000-0000-4000-8000-000000000092']::uuid[]) r WHERE r.pendientes = 1$$, 1);
RESET ROLE;

SELECT pg_temp.report();

ROLLBACK;
