-- T5a (odd/tasks/talleres-reserva-publica.md) — RED→GREEN for
-- 20261110121000_talleres_inscripcion_core.sql: taller_inscripciones.origen
-- and por_verificar, talleres_inscripcion_crear_core, and the regression of
-- talleres_inscribirme on top of it. Run against STAGING inside
-- BEGIN…ROLLBACK — nothing here is kept; fixture ids live under the
-- cf100000-... namespace, fixture cédulas start with 99810 and emails end
-- in @example.test.
--
-- Every reference to an object the migration adds goes through dynamic SQL
-- inside a pg_temp assertion, so the RED run reaches pg_temp.report().
--
-- Talleres: T_mat cf1…10 (pareja, matrimonio), T_ind cf1…11 (individual).
-- Ediciones: E_mat cf1…90 (T_mat), E_ind cf1…91 (T_ind), E_cupo cf1…92
--   (T_mat, one grupo of capacidad 1 already taken by F), E_cerr cf1…93
--   (T_ind, cierre_inscripcion passed); cohorte cf1…c<n> for cf1…9<n>.
-- Identities (auth → usuario):
--   M1 a1 → 41  role miembro, conyuge relation M1 → S1 (cf1…51)
--   M2 a2 → 42  individual path
--   M3 a3 → 43  role miembro (ficha_nueva into the full edición)
--   M4 a4 → 44  cédula mode with P (cf1…52, cédula 99810002)
--   M5 a5 → 45  conyuge relation M5 → P (P becomes active)
-- Persons without account: S1 51, P 52, Q 53 (core calls), F 59 (filler).
--
-- Covered:
--   1. Structure: the columns and the origen CHECK; the core is a definer
--      with search_path="" that only service_role executes;
--      talleres_inscribirme keeps its definer config, grants and arguments.
--   2. Regression of talleres_inscribirme: individual reply and origen app;
--      YA_INSCRITO; conyuge_registrado; cédula mode; PAREJA_NO_DISPONIBLE;
--      CUPO_LLENO with ficha_nueva rolls back the ficha and keeps the unit;
--      EDICION_NO_ABIERTA.
--   3. The core: origen publico and por_verificar stored; YA_INSCRITO;
--      PAREJA_NO_DISPONIBLE; CUPO_LLENO; an unknown origen raises 23514;
--      authenticated cannot call it.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ic_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ic_cases (case_name text) ON COMMIT DROP;
GRANT INSERT, SELECT ON t_ic_failures, t_ic_cases TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ic_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate_msg(p_case text, p_sql text, p_expected_sqlstate text, p_expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_ic_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ', got no exception');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate
         OR (p_expected_message IS NOT NULL AND SQLERRM IS DISTINCT FROM p_expected_message) THEN
        PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || coalesce(p_expected_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
      END IF;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO t_ic_cases VALUES (p_case);
  BEGIN
    EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
    IF v_n IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ' row(s), got ' || v_n);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

-- Runs p_sql (one jsonb value) and compares it with p_expected.
CREATE OR REPLACE FUNCTION pg_temp.expect(p_case text, p_sql text, p_expected jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  INSERT INTO t_ic_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v;
    IF v IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected::text || ', got ' || coalesce(v::text, 'NULL'));
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.report()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
  v_total int;
  v_msg text;
BEGIN
  SELECT count(*) INTO v_total FROM t_ic_cases;
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_ic_failures;
  IF v_n > 0 THEN
    RAISE EXCEPTION E'% failing case(s) of %:\n%', v_n, v_total, v_msg;
  END IF;
  RETURN 'all ' || v_total || ' cases ok';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_auth_id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_auth_id::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── fixtures ────────────────────────────────────────────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('cf100000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ IC Direccion', NULL, true),
  ('cf100000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ IC Nodo Mat', 'cf100000-0000-4000-8000-000000000001', true),
  ('cf100000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ IC Nodo Ind', 'cf100000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('cf100000-0000-4000-8000-000000000010', 'zz-ic-matrimonio', 'ZZ IC Matrimonio', 'cf100000-0000-4000-8000-000000000002', 'pareja', 'matrimonio', 'cadencia', 7, 0),
  ('cf100000-0000-4000-8000-000000000011', 'zz-ic-individual', 'ZZ IC Individual', 'cf100000-0000-4000-8000-000000000003', 'individual', NULL, 'cadencia', 7, 0);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('cf100000-0000-4000-8000-0000000000a' || n)::uuid, 'authenticated', 'authenticated', 'cf1-m' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 5) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, cedula, fecha_nacimiento, estado_civil, genero)
SELECT ('cf100000-0000-4000-8000-00000000004' || n)::uuid, ('cf100000-0000-4000-8000-0000000000a' || n)::uuid,
       'ZZIC', 'M' || n, 'cf1-m' || n || '@example.test', NULL, NULL, 'Casado', 'Otro'
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, cedula, fecha_nacimiento, estado_civil, genero) VALUES
  ('cf100000-0000-4000-8000-000000000051', 'ZZIC', 'S1', '99810001', DATE '1980-01-01', 'Casado', 'Femenino'),
  ('cf100000-0000-4000-8000-000000000052', 'ZZIC', 'P', '99810002', DATE '1980-01-01', 'Casado', 'Femenino'),
  ('cf100000-0000-4000-8000-000000000053', 'ZZIC', 'Q', '99810003', DATE '1980-01-01', 'Soltero', 'Masculino'),
  ('cf100000-0000-4000-8000-000000000059', 'ZZIC', 'F', NULL, NULL, 'Soltero', 'Otro');

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT u, r.id
  FROM unnest(ARRAY['cf100000-0000-4000-8000-000000000041', 'cf100000-0000-4000-8000-000000000043']::uuid[]) AS u,
       public.roles_sistema r
 WHERE r.nombre_interno = 'miembro';

INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion) VALUES
  ('cf100000-0000-4000-8000-000000000041', 'cf100000-0000-4000-8000-000000000051', 'conyuge'),
  ('cf100000-0000-4000-8000-000000000045', 'cf100000-0000-4000-8000-000000000052', 'conyuge');

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata)
SELECT ('cf100000-0000-4000-8000-00000000008' || n)::uuid, 'workshop', 'active', 'ZZ IC Evento ' || n, CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb
  FROM generate_series(0, 3) AS n;

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
) VALUES
  ('cf100000-0000-4000-8000-000000000090', 'cf100000-0000-4000-8000-000000000080', 'cf100000-0000-4000-8000-000000000010',
   'pareja', 'matrimonio', 'permanente_custom', 'abierto', 'ZZ IC E_mat', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('cf100000-0000-4000-8000-000000000091', 'cf100000-0000-4000-8000-000000000081', 'cf100000-0000-4000-8000-000000000011',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ IC E_ind', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('cf100000-0000-4000-8000-000000000092', 'cf100000-0000-4000-8000-000000000082', 'cf100000-0000-4000-8000-000000000010',
   'pareja', 'matrimonio', 'permanente_custom', 'abierto', 'ZZ IC E_cupo', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('cf100000-0000-4000-8000-000000000093', 'cf100000-0000-4000-8000-000000000083', 'cf100000-0000-4000-8000-000000000011',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ IC E_cerr', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE - 1, CURRENT_DATE + 60);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at)
SELECT ('cf100000-0000-4000-8000-0000000000c' || n)::uuid, ('cf100000-0000-4000-8000-00000000009' || n)::uuid,
       'cf100000-0000-4000-8000-000000000002', 'ZZ IC Cohorte ' || n, (CURRENT_DATE + 30)::timestamptz
  FROM generate_series(0, 3) AS n;

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('cf100000-0000-4000-8000-000000000060', 'cf100000-0000-4000-8000-0000000000c2', 'ZZ IC Grupo Cupo', 1, 'activo');
INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado) VALUES
  ('cf100000-0000-4000-8000-000000000061', 'cf100000-0000-4000-8000-000000000092', 'cf100000-0000-4000-8000-0000000000c2',
   'cf100000-0000-4000-8000-000000000059', 'pendiente');

-- ══ 1. Structure ══

SELECT pg_temp.assert_rows('1: origen text NOT NULL DEFAULT app and por_verificar boolean NOT NULL DEFAULT false',
  $$SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'taller_inscripciones' AND is_nullable = 'NO'
       AND ((column_name = 'origen' AND data_type = 'text' AND column_default = '''app''::text')
         OR (column_name = 'por_verificar' AND data_type = 'boolean' AND column_default = 'false'))$$, 2);
SELECT pg_temp.assert_sqlstate_msg('1: origen refuses a value outside app/admin/publico',
  $$UPDATE public.taller_inscripciones SET origen = 'otro' WHERE id = 'cf100000-0000-4000-8000-000000000061'$$,
  '23514', 'new row for relation "taller_inscripciones" violates check constraint "taller_inscripciones_origen_check"');
SELECT pg_temp.assert_rows('1: the core is a definer with search_path="" executed only by service_role',
  $$SELECT 1 FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.talleres_inscripcion_crear_core(uuid,uuid,uuid,text,text,boolean,text,boolean)')
       AND p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
       AND NOT has_function_privilege('anon', p.oid, 'execute')
       AND NOT has_function_privilege('authenticated', p.oid, 'execute')
       AND has_function_privilege('service_role', p.oid, 'execute')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)$$, 1);
SELECT pg_temp.assert_rows('1: talleres_inscribirme keeps definer, search_path=public, grants and arguments, and calls the core',
  $$SELECT 1 FROM pg_proc p WHERE p.oid = 'public.talleres_inscribirme(uuid,jsonb)'::regprocedure
     AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public']
     AND has_function_privilege('authenticated', p.oid, 'execute') AND NOT has_function_privilege('anon', p.oid, 'execute')
     AND pg_get_function_arguments(p.oid) = 'p_edicion_id uuid, p_pareja jsonb DEFAULT NULL::jsonb'
     AND pg_get_functiondef(p.oid) LIKE '%talleres_inscripcion_crear_core%'$$, 1);

-- ══ 2. talleres_inscribirme regression ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf100000-0000-4000-8000-0000000000a2');
SELECT pg_temp.expect('2: an individual enrollment returns the old shape',
  $$SELECT public.talleres_inscribirme('cf100000-0000-4000-8000-000000000091', NULL) - 'inscripcion_id'$$,
  '{"ok":true,"estado":"pendiente","pareja_origen":null}');
SELECT pg_temp.expect('2: a second enrollment returns YA_INSCRITO',
  $$SELECT public.talleres_inscribirme('cf100000-0000-4000-8000-000000000091', NULL)$$,
  '{"ok":false,"codigo":"YA_INSCRITO"}');
SELECT pg_temp.expect('2: a closed edición returns EDICION_NO_ABIERTA',
  $$SELECT public.talleres_inscribirme('cf100000-0000-4000-8000-000000000093', NULL)$$,
  '{"ok":false,"codigo":"EDICION_NO_ABIERTA"}');
SELECT pg_temp.as_persona('cf100000-0000-4000-8000-0000000000a1');
SELECT pg_temp.expect('2: conyuge_registrado still enrolls the couple',
  $$SELECT public.talleres_inscribirme('cf100000-0000-4000-8000-000000000090', '{"modo":"conyuge_registrado"}') - 'inscripcion_id'$$,
  '{"ok":true,"estado":"pendiente","pareja_origen":"conyuge_registrado"}');
SELECT pg_temp.as_persona('cf100000-0000-4000-8000-0000000000a4');
SELECT pg_temp.expect('2: cédula mode still enrolls with P',
  $$SELECT public.talleres_inscribirme('cf100000-0000-4000-8000-000000000090', '{"modo":"cedula","cedula":"V-99810002"}') - 'inscripcion_id'$$,
  '{"ok":true,"estado":"pendiente","pareja_origen":"cedula"}');
SELECT pg_temp.as_persona('cf100000-0000-4000-8000-0000000000a5');
SELECT pg_temp.expect('2: a registered spouse already active returns PAREJA_NO_DISPONIBLE',
  $$SELECT public.talleres_inscribirme('cf100000-0000-4000-8000-000000000090', '{"modo":"conyuge_registrado"}')$$,
  '{"ok":false,"codigo":"PAREJA_NO_DISPONIBLE"}');
SELECT pg_temp.as_persona('cf100000-0000-4000-8000-0000000000a3');
SELECT pg_temp.expect('2: ficha_nueva into a full edición returns CUPO_LLENO',
  $$SELECT public.talleres_inscribirme('cf100000-0000-4000-8000-000000000092',
     '{"modo":"ficha_nueva","cedula":"99810010","nombre":"Ana","apellido":"Ruiz","email":"cf1-ana@example.test","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '{"ok":false,"codigo":"CUPO_LLENO"}');
RESET ROLE;

SELECT pg_temp.assert_rows('2: the member rows carry origen app and por_verificar false',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE persona_principal_id IN ('cf100000-0000-4000-8000-000000000042', 'cf100000-0000-4000-8000-000000000041',
                                    'cf100000-0000-4000-8000-000000000044')
       AND origen = 'app' AND NOT por_verificar AND estado = 'pendiente'$$, 3);
SELECT pg_temp.assert_rows('2: the couples have the expected companero',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE (persona_principal_id = 'cf100000-0000-4000-8000-000000000041' AND companero_id = 'cf100000-0000-4000-8000-000000000051')
        OR (persona_principal_id = 'cf100000-0000-4000-8000-000000000044' AND companero_id = 'cf100000-0000-4000-8000-000000000052')$$, 2);
SELECT pg_temp.assert_rows('2: CUPO_LLENO rolled back the new ficha and its invitation',
  $$SELECT 1 FROM public.usuarios WHERE cedula = '99810010' OR email = 'cf1-ana@example.test'$$, 0);
SELECT pg_temp.assert_rows('2: CUPO_LLENO kept the consumed pareja_ficha_nueva unit',
  $$SELECT 1 FROM public.acciones_limitadas WHERE actor_id = 'cf100000-0000-4000-8000-000000000043' AND accion = 'pareja_ficha_nueva'$$, 1);

-- ══ 3. The core ══

SELECT pg_temp.expect('3: the core writes a publico, por_verificar row',
  $$SELECT public.talleres_inscripcion_crear_core('cf100000-0000-4000-8000-000000000091', 'cf100000-0000-4000-8000-000000000053',
     NULL, NULL, NULL, false, 'publico', true) - 'inscripcion_id'$$,
  '{"ok":true}');
SELECT pg_temp.assert_rows('3: the row is pendiente, publico, por_verificar, first cohorte',
  $$SELECT 1 FROM public.taller_inscripciones
     WHERE taller_id = 'cf100000-0000-4000-8000-000000000091' AND persona_principal_id = 'cf100000-0000-4000-8000-000000000053'
       AND estado = 'pendiente' AND origen = 'publico' AND por_verificar AND NOT sobre_cupo
       AND cohorte_id = 'cf100000-0000-4000-8000-0000000000c1'$$, 1);
SELECT pg_temp.expect('3: an active principal returns YA_INSCRITO',
  $$SELECT public.talleres_inscripcion_crear_core('cf100000-0000-4000-8000-000000000091', 'cf100000-0000-4000-8000-000000000053',
     NULL, NULL, NULL, false, 'publico', false)$$,
  '{"ok":false,"codigo":"YA_INSCRITO"}');
SELECT pg_temp.expect('3: an active companero returns PAREJA_NO_DISPONIBLE',
  $$SELECT public.talleres_inscripcion_crear_core('cf100000-0000-4000-8000-000000000090', 'cf100000-0000-4000-8000-000000000053',
     'cf100000-0000-4000-8000-000000000051', 'matrimonio', 'cedula', false, 'publico', false)$$,
  '{"ok":false,"codigo":"PAREJA_NO_DISPONIBLE"}');
SELECT pg_temp.expect('3: a full edición returns CUPO_LLENO',
  $$SELECT public.talleres_inscripcion_crear_core('cf100000-0000-4000-8000-000000000092', 'cf100000-0000-4000-8000-000000000053',
     'cf100000-0000-4000-8000-000000000052', 'matrimonio', 'cedula', false, 'publico', false)$$,
  '{"ok":false,"codigo":"CUPO_LLENO"}');
SELECT pg_temp.expect('3: a closed edición returns EDICION_NO_ABIERTA',
  $$SELECT public.talleres_inscripcion_crear_core('cf100000-0000-4000-8000-000000000093', 'cf100000-0000-4000-8000-000000000053',
     NULL, NULL, NULL, false, 'publico', false)$$,
  '{"ok":false,"codigo":"EDICION_NO_ABIERTA"}');
SELECT pg_temp.assert_sqlstate_msg('3: an unknown origen raises the CHECK',
  $$SELECT public.talleres_inscripcion_crear_core('cf100000-0000-4000-8000-000000000091', 'cf100000-0000-4000-8000-000000000059',
     NULL, NULL, NULL, false, 'otro', false)$$, '23514', NULL);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf100000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_sqlstate_msg('3: authenticated cannot call the core',
  $$SELECT public.talleres_inscripcion_crear_core('cf100000-0000-4000-8000-000000000091', 'cf100000-0000-4000-8000-000000000042',
     NULL, NULL, NULL, false, 'publico', false)$$,
  '42501', 'permission denied for function talleres_inscripcion_crear_core');
RESET ROLE;
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;

SELECT pg_temp.report();

ROLLBACK;
