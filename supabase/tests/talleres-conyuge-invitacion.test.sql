-- C1 (odd/tasks/talleres-conyuge-invitacion.md) — RED→GREEN for
-- 20261004150000_talleres_conyuge_invitacion.sql: talleres.momento_envio_acceso,
-- invitaciones_acceso, the ficha_nueva mode of talleres_inscribirme, the
-- sender and activation functions, the cancel trigger and
-- ficha_tiene_invitacion_abierta. Run against STAGING inside
-- BEGIN…ROLLBACK — nothing here is kept; fixture ids live under the
-- cf000000-... namespace, fixture cédulas start with 998 and emails end in
-- @example.test.
--
-- Every reference to an object the migration adds goes through dynamic SQL
-- inside a pg_temp assertion, so the RED run reaches pg_temp.report() and
-- lists every failing case. report() returns 'all N cases ok' or raises.
--
-- Talleres: T_mat cf…10 (pareja, matrimonio, al_aprobar by default),
--   T_ins cf…11 (pareja, novios, set to al_inscribirse once the column
--   exists), T_ind cf…12 (individual).
-- Ediciones (abierto): E_mat cf…90, E_ins cf…91, E_ind cf…92; cohorte
--   cf…c<n> for edición cf…9<n>.
-- Identities (auth → usuario):
--   M1 cf…a1 → cf…41  role miembro (main path)
--   M2 cf…a2 → cf…42  no role
--   M3 cf…a3 → cf…43  role miembro (al_inscribirse, block)
--   M4 cf…a4 → cf…44  role miembro (cancel trigger)
-- Persons: P_exist cf…51 cédula 99800001, email cf-exist@example.test.
-- auth only: cf…b1 cf-authonly@example.test.
-- Global cap filler actor: cf…59 (no account).
--
-- Covered:
--   1. Structure: the column and its CHECK, the pareja_origen CHECK, the
--      table (RLS on, no grants to anon/authenticated, partial unique),
--      the trigger, every new function definer with search_path=public,
--      anon executes none, authenticated none of the new ones,
--      service_role all.
--   2. Validation errors raise 22023 before any throttle.
--   3. A caller without a role gets LIMITE_ALCANZADO and records nothing.
--   4. Existing cédula, existing email (usuarios, any case; auth.users)
--      and a minor all return PAREJA_NO_CONFIRMADA and keep the unit.
--   5. 2 per 30 days per caller; 6. 30 per 24 h overall.
--   7. Success: exact reply (no invitacion_id), the ficha (normalized
--      cédula, lower email, no role, no auth_id), the inscription and the
--      en_espera invitation.
--   8. pendientes_de_envio honors al_aprobar / al_inscribirse.
--   9. preparar_envio / registrar_envio / consultar and token rotation.
--  10. verificar: mismatches count down, a match moves to activando; the
--      5th mismatch blocks and drops the token.
--  11. vincular: email must match, auth_id only when NULL, role miembro,
--      aceptada, conyuge relation, single use.
--  12. ficha_tiene_invitacion_abierta.
--  13. no_aprobado cancels the open invitation; the ficha stays.
--  14. authenticated reaches neither the table nor the service functions.
--  15. An individual enrollment still returns the old shape.
--
-- The MCP connection is `postgres` (BYPASSRLS): authority assertions run
-- under SET LOCAL ROLE authenticated/anon + jwt claims.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ci_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ci_cases (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ci_result (key text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT, UPDATE ON t_ci_failures, t_ci_cases, t_ci_result TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ci_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_sqlstate_msg(p_case text, p_sql text, p_expected_sqlstate text, p_expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_ci_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got no exception');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE IS DISTINCT FROM p_expected_sqlstate OR SQLERRM IS DISTINCT FROM p_expected_message THEN
        PERFORM pg_temp.fail(p_case, 'expected ' || p_expected_sqlstate || ' ' || p_expected_message || ', got ' || SQLSTATE || ' ' || SQLERRM);
      END IF;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO t_ci_cases VALUES (p_case);
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

CREATE OR REPLACE FUNCTION pg_temp.run(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_ci_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

-- Runs p_sql (one jsonb value), keeps it under p_key and, when p_expected
-- is given, compares it.
CREATE OR REPLACE FUNCTION pg_temp.capture(p_case text, p_key text, p_sql text, p_expected jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v jsonb;
BEGIN
  INSERT INTO t_ci_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v;
    INSERT INTO t_ci_result (key, j) VALUES (p_key, v)
      ON CONFLICT (key) DO UPDATE SET j = EXCLUDED.j;
    IF p_expected IS NOT NULL AND v IS DISTINCT FROM p_expected THEN
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
  SELECT count(*) INTO v_total FROM t_ci_cases;
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_ci_failures;
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

-- 64-hex token hashes used below.
CREATE TEMP TABLE t_ci_hash (k text PRIMARY KEY, h text) ON COMMIT DROP;
INSERT INTO t_ci_hash VALUES
  ('h1', repeat('a1', 32)), ('h2', repeat('b2', 32)), ('h3', repeat('c3', 32));

-- ── fixtures (as postgres, before any role switch) ──────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('cf000000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ CI Direccion', NULL, true),
  ('cf000000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ CI Nodo Mat', 'cf000000-0000-4000-8000-000000000001', true),
  ('cf000000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ CI Nodo Ins', 'cf000000-0000-4000-8000-000000000001', true),
  ('cf000000-0000-4000-8000-000000000004', 'talleres_crecimiento', 'ZZ CI Nodo Ind', 'cf000000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('cf000000-0000-4000-8000-000000000010', 'zz-ci-matrimonio', 'ZZ CI Matrimonio', 'cf000000-0000-4000-8000-000000000002', 'pareja', 'matrimonio', 'cadencia', 7, 0),
  ('cf000000-0000-4000-8000-000000000011', 'zz-ci-novios', 'ZZ CI Novios', 'cf000000-0000-4000-8000-000000000003', 'pareja', 'novios', 'cadencia', 7, 0),
  ('cf000000-0000-4000-8000-000000000012', 'zz-ci-individual', 'ZZ CI Individual', 'cf000000-0000-4000-8000-000000000004', 'individual', NULL, 'cadencia', 7, 0);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('cf000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'cf-m1@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('cf000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated', 'cf-m2@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('cf000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'cf-m3@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('cf000000-0000-4000-8000-0000000000a4', 'authenticated', 'authenticated', 'cf-m4@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('cf000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'cf-authonly@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('cf000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'cf-otro@example.test', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, cedula, fecha_nacimiento, estado_civil, genero) VALUES
  ('cf000000-0000-4000-8000-000000000041', 'cf000000-0000-4000-8000-0000000000a1', 'Mario', 'ZZCI Uno', 'cf-m1@example.test', NULL, NULL, 'Casado', 'Masculino'),
  ('cf000000-0000-4000-8000-000000000042', 'cf000000-0000-4000-8000-0000000000a2', 'ZZCI', 'Dos', 'cf-m2@example.test', NULL, NULL, 'Soltero', 'Otro'),
  ('cf000000-0000-4000-8000-000000000043', 'cf000000-0000-4000-8000-0000000000a3', 'ZZCI', 'Tres', 'cf-m3@example.test', NULL, NULL, 'Soltero', 'Otro'),
  ('cf000000-0000-4000-8000-000000000044', 'cf000000-0000-4000-8000-0000000000a4', 'ZZCI', 'Cuatro', 'cf-m4@example.test', NULL, NULL, 'Soltero', 'Otro'),
  ('cf000000-0000-4000-8000-000000000051', NULL, 'ZZCI', 'Existe', 'cf-exist@example.test', '99800001', NULL, 'Soltero', 'Otro'),
  ('cf000000-0000-4000-8000-000000000059', NULL, 'ZZCI', 'Relleno', NULL, NULL, NULL, 'Soltero', 'Otro');

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT u, r.id
  FROM unnest(ARRAY['cf000000-0000-4000-8000-000000000041', 'cf000000-0000-4000-8000-000000000043',
                    'cf000000-0000-4000-8000-000000000044']::uuid[]) AS u,
       public.roles_sistema r
 WHERE r.nombre_interno = 'miembro';

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata)
SELECT ('cf000000-0000-4000-8000-00000000008' || n)::uuid, 'workshop', 'active', 'ZZ CI Evento ' || n, CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb
  FROM generate_series(0, 2) AS n;

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
) VALUES
  ('cf000000-0000-4000-8000-000000000090', 'cf000000-0000-4000-8000-000000000080', 'cf000000-0000-4000-8000-000000000010',
   'pareja', 'matrimonio', 'permanente_custom', 'abierto', 'ZZ CI E_mat', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('cf000000-0000-4000-8000-000000000091', 'cf000000-0000-4000-8000-000000000081', 'cf000000-0000-4000-8000-000000000011',
   'pareja', 'novios', 'permanente_custom', 'abierto', 'ZZ CI E_ins', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60),
  ('cf000000-0000-4000-8000-000000000092', 'cf000000-0000-4000-8000-000000000082', 'cf000000-0000-4000-8000-000000000012',
   'individual', NULL, 'permanente_custom', 'abierto', 'ZZ CI E_ind', 4, 60, 'permanente_custom', CURRENT_DATE + 30, CURRENT_DATE + 20, CURRENT_DATE + 60);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at)
SELECT ('cf000000-0000-4000-8000-0000000000c' || n)::uuid, ('cf000000-0000-4000-8000-00000000009' || n)::uuid,
       'cf000000-0000-4000-8000-000000000002', 'ZZ CI Cohorte ' || n, (CURRENT_DATE + 30)::timestamptz
  FROM generate_series(0, 2) AS n;

-- ══ 1. Structure ══

SELECT pg_temp.assert_rows('1: talleres.momento_envio_acceso text NOT NULL DEFAULT al_aprobar',
  $$SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'talleres' AND column_name = 'momento_envio_acceso'
       AND data_type = 'text' AND is_nullable = 'NO' AND column_default = '''al_aprobar''::text'$$, 1);
SELECT pg_temp.assert_sqlstate_msg('1: momento_envio_acceso refuses other values',
  $$UPDATE public.talleres SET momento_envio_acceso = 'nunca' WHERE id = 'cf000000-0000-4000-8000-000000000010'$$,
  '23514', 'new row for relation "talleres" violates check constraint "talleres_momento_envio_acceso_check"');
SELECT pg_temp.run('1: T_ins becomes al_inscribirse',
  $$UPDATE public.talleres SET momento_envio_acceso = 'al_inscribirse' WHERE id = 'cf000000-0000-4000-8000-000000000011'$$);
SELECT pg_temp.assert_rows('1: pareja_origen accepts ficha_nueva',
  $$SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.taller_inscripciones'::regclass AND conname = 'taller_inscripciones_pareja_origen_check'
       AND pg_get_constraintdef(oid) LIKE '%ficha_nueva%'$$, 1);
SELECT pg_temp.assert_rows('1: invitaciones_acceso has RLS on and no privilege for anon or authenticated',
  $$SELECT 1 FROM pg_class c
     WHERE c.oid = to_regclass('public.invitaciones_acceso') AND c.relrowsecurity
       AND NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
       AND NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')$$, 1);
SELECT pg_temp.assert_rows('1: one open invitation per usuario (partial unique)',
  $$SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'invitaciones_acceso_una_abierta_por_usuario'
       AND indexdef LIKE 'CREATE UNIQUE INDEX % (usuario_id) WHERE%en_espera%enviada%activando%'$$, 1);
SELECT pg_temp.assert_rows('1: the cancel trigger fires AFTER UPDATE OF estado',
  $$SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.taller_inscripciones'::regclass AND tgname = 'trg_taller_inscripciones_cancela_invitaciones'
       AND pg_get_triggerdef(oid) LIKE '%AFTER UPDATE OF estado ON public.taller_inscripciones FOR EACH ROW%'$$, 1);

CREATE TEMP TABLE t_ci_fn (sig text) ON COMMIT DROP;
INSERT INTO t_ci_fn VALUES
  ('public.invitacion_acceso_pendientes_de_envio()'),
  ('public.invitacion_acceso_preparar_envio(uuid,text,timestamptz)'),
  ('public.invitacion_acceso_registrar_envio(uuid,boolean,text)'),
  ('public.talleres_inscripcion_cancela_invitaciones()'),
  ('public.invitacion_acceso_consultar(text)'),
  ('public.invitacion_acceso_verificar(text,text)'),
  ('public.invitacion_acceso_vincular(uuid,uuid,boolean)'),
  ('public.ficha_tiene_invitacion_abierta(uuid)');
GRANT SELECT ON t_ci_fn, t_ci_hash TO authenticated, anon;

SELECT pg_temp.assert_rows('1: the eight new functions are definers with search_path=public',
  $$SELECT 1 FROM t_ci_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
     WHERE p.prosecdef AND p.proconfig @> ARRAY['search_path=public']$$, 8);
SELECT pg_temp.assert_rows('1: neither anon nor authenticated executes them, no PUBLIC entry, service_role executes all',
  $$SELECT 1 FROM t_ci_fn f JOIN pg_proc p ON p.oid = to_regprocedure(f.sig)
     WHERE NOT has_function_privilege('anon', p.oid, 'execute')
       AND NOT has_function_privilege('authenticated', p.oid, 'execute')
       AND has_function_privilege('service_role', p.oid, 'execute')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)$$, 8);
SELECT pg_temp.assert_rows('1: talleres_inscribirme keeps authenticated and loses anon',
  $$SELECT 1 FROM pg_proc p WHERE p.oid = 'public.talleres_inscribirme(uuid,jsonb)'::regprocedure
     AND has_function_privilege('authenticated', p.oid, 'execute') AND NOT has_function_privilege('anon', p.oid, 'execute')
     AND pg_get_functiondef(p.oid) LIKE '%ficha_nueva%'$$, 1);

-- ══ 2. Validation (M1, E_mat) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf000000-0000-4000-8000-0000000000a1');

SELECT pg_temp.assert_sqlstate_msg('2: a malformed cédula raises CEDULA_INVALIDA',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"abc","nombre":"Ana","apellido":"Ruiz","email":"cf-n@example.test","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '22023', 'CEDULA_INVALIDA');
SELECT pg_temp.assert_sqlstate_msg('2: an empty nombre raises NOMBRE_INVALIDO',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"  ","apellido":"Ruiz","email":"cf-n@example.test","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '22023', 'NOMBRE_INVALIDO');
SELECT pg_temp.assert_sqlstate_msg('2: a missing apellido raises NOMBRE_INVALIDO',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"Ana","email":"cf-n@example.test","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '22023', 'NOMBRE_INVALIDO');
SELECT pg_temp.assert_sqlstate_msg('2: a malformed email raises EMAIL_INVALIDO',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"Ana","apellido":"Ruiz","email":"no-arroba","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '22023', 'EMAIL_INVALIDO');
SELECT pg_temp.assert_sqlstate_msg('2: genero Otro raises GENERO_INVALIDO',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"Ana","apellido":"Ruiz","email":"cf-n@example.test","fecha_nacimiento":"1990-01-01","genero":"Otro"}')$$,
  '22023', 'GENERO_INVALIDO');
SELECT pg_temp.assert_sqlstate_msg('2: an impossible date raises FECHA_NACIMIENTO_INVALIDA',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"Ana","apellido":"Ruiz","email":"cf-n@example.test","fecha_nacimiento":"1990-13-01","genero":"Femenino"}')$$,
  '22023', 'FECHA_NACIMIENTO_INVALIDA');
SELECT pg_temp.assert_sqlstate_msg('2: a non-ISO date raises FECHA_NACIMIENTO_INVALIDA',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"Ana","apellido":"Ruiz","email":"cf-n@example.test","fecha_nacimiento":"01/01/1990","genero":"Femenino"}')$$,
  '22023', 'FECHA_NACIMIENTO_INVALIDA');
SELECT pg_temp.assert_sqlstate_msg('2: a future date raises FECHA_NACIMIENTO_INVALIDA',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     jsonb_build_object('modo','ficha_nueva','cedula','99800010','nombre','Ana','apellido','Ruiz','email','cf-n@example.test',
                        'fecha_nacimiento', to_char(CURRENT_DATE + 10, 'YYYY-MM-DD'),'genero','Femenino'))$$,
  '22023', 'FECHA_NACIMIENTO_INVALIDA');
RESET ROLE;
SELECT pg_temp.assert_rows('2: validation errors consumed no unit',
  $$SELECT 1 FROM public.acciones_limitadas WHERE actor_id = 'cf000000-0000-4000-8000-000000000041'$$, 0);

-- ══ 3. Only callers with a role ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf000000-0000-4000-8000-0000000000a2');
SELECT pg_temp.capture('3: a caller without a role gets LIMITE_ALCANZADO', 'm2_sin_rol',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"Ana","apellido":"Ruiz","email":"cf-n@example.test","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '{"ok":false,"codigo":"LIMITE_ALCANZADO"}');
RESET ROLE;
SELECT pg_temp.assert_rows('3: and nothing was recorded or created',
  $$SELECT 1 FROM public.acciones_limitadas WHERE actor_id = 'cf000000-0000-4000-8000-000000000042'
    UNION ALL SELECT 1 FROM public.usuarios WHERE cedula = '99800010'$$, 0);

-- ══ 4. Neutral refusals (M1; the units are cleared between pairs) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('4: an existing cédula returns PAREJA_NO_CONFIRMADA', 'r_cedula',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800001","nombre":"Ana","apellido":"Ruiz","email":"cf-n@example.test","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '{"ok":false,"codigo":"PAREJA_NO_CONFIRMADA"}');
SELECT pg_temp.capture('4: an existing usuarios email in another case returns PAREJA_NO_CONFIRMADA', 'r_email',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"Ana","apellido":"Ruiz","email":"CF-Exist@Example.test","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '{"ok":false,"codigo":"PAREJA_NO_CONFIRMADA"}');
RESET ROLE;
SELECT pg_temp.assert_rows('4: each refusal kept its pareja_ficha_nueva unit',
  $$SELECT 1 FROM public.acciones_limitadas WHERE actor_id = 'cf000000-0000-4000-8000-000000000041' AND accion = 'pareja_ficha_nueva'$$, 2);
DELETE FROM public.acciones_limitadas WHERE actor_id = 'cf000000-0000-4000-8000-000000000041';
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('4: an email only in auth.users returns PAREJA_NO_CONFIRMADA', 'r_auth',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"Ana","apellido":"Ruiz","email":"cf-authonly@example.test","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '{"ok":false,"codigo":"PAREJA_NO_CONFIRMADA"}');
SELECT pg_temp.capture('4: a minor returns PAREJA_NO_CONFIRMADA', 'r_menor',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     jsonb_build_object('modo','ficha_nueva','cedula','99800010','nombre','Ana','apellido','Ruiz','email','cf-n@example.test',
                        'fecha_nacimiento', to_char(CURRENT_DATE - interval '10 years', 'YYYY-MM-DD'),'genero','Femenino'))$$,
  '{"ok":false,"codigo":"PAREJA_NO_CONFIRMADA"}');

-- ══ 5. 2 per 30 days per caller ══

SELECT pg_temp.capture('5: the third ficha_nueva in 30 days returns LIMITE_ALCANZADO', 'r_limite',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"Ana","apellido":"Ruiz","email":"cf-n@example.test","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '{"ok":false,"codigo":"LIMITE_ALCANZADO"}');
RESET ROLE;
SELECT pg_temp.assert_rows('5: the refusal recorded nothing and no ficha exists',
  $$SELECT 1 FROM public.acciones_limitadas WHERE actor_id = 'cf000000-0000-4000-8000-000000000041'
    UNION ALL SELECT 1 FROM public.usuarios WHERE cedula = '99800010'$$, 2);
UPDATE public.acciones_limitadas SET created_at = now() - interval '31 days'
 WHERE actor_id = 'cf000000-0000-4000-8000-000000000041';

-- ══ 6. 30 per 24 h overall ══

INSERT INTO public.acciones_limitadas (actor_id, accion)
SELECT 'cf000000-0000-4000-8000-000000000059', 'pareja_ficha_nueva'
  FROM generate_series(1, 30 - (SELECT count(*)::int FROM public.acciones_limitadas
                                 WHERE accion = 'pareja_ficha_nueva' AND created_at > now() - interval '24 hours'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('6: the global cap of 30 per 24 h returns LIMITE_ALCANZADO', 'r_global',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800010","nombre":"Ana","apellido":"Ruiz","email":"cf-n@example.test","fecha_nacimiento":"1990-01-01","genero":"Femenino"}')$$,
  '{"ok":false,"codigo":"LIMITE_ALCANZADO"}');
RESET ROLE;
DELETE FROM public.acciones_limitadas WHERE actor_id = 'cf000000-0000-4000-8000-000000000059';

-- ══ 7. Success (M1 on E_mat, al_aprobar) ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('7: ficha_nueva enrolls the couple', 'ok_m1',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"V-99800010","nombre":" Ana  María ","apellido":"Ruiz","email":"CF-Ana@Example.test","fecha_nacimiento":"1990-05-04","genero":"Femenino"}')$$);
RESET ROLE;
SELECT pg_temp.assert_rows('7: the reply is exactly {ok, inscripcion_id, estado pendiente, pareja_origen ficha_nueva}',
  $$SELECT 1 FROM t_ci_result
     WHERE key = 'ok_m1' AND j - 'inscripcion_id' = '{"ok":true,"estado":"pendiente","pareja_origen":"ficha_nueva"}'::jsonb
       AND (j ->> 'inscripcion_id') IS NOT NULL AND NOT j ? 'invitacion_id'$$, 1);
SELECT pg_temp.assert_rows('7: the ficha has the normalized cédula, lower email, no auth_id, Casado, Femenino',
  $$SELECT 1 FROM public.usuarios
     WHERE cedula = '99800010' AND email = 'cf-ana@example.test' AND auth_id IS NULL
       AND nombre = 'Ana María' AND fecha_nacimiento = DATE '1990-05-04'
       AND estado_civil = 'Casado' AND genero = 'Femenino'$$, 1);
SELECT pg_temp.assert_rows('7: the ficha holds no role',
  $$SELECT 1 FROM public.usuario_roles ur JOIN public.usuarios u ON u.id = ur.usuario_id WHERE u.cedula = '99800010'$$, 0);
SELECT pg_temp.assert_rows('7: the inscription is pendiente with the ficha as companero and pareja_origen ficha_nueva',
  $$SELECT 1 FROM public.taller_inscripciones i JOIN public.usuarios u ON u.id = i.companero_id
     WHERE i.id = (SELECT (j ->> 'inscripcion_id')::uuid FROM t_ci_result WHERE key = 'ok_m1')
       AND u.cedula = '99800010' AND i.persona_principal_id = 'cf000000-0000-4000-8000-000000000041'
       AND i.estado = 'pendiente' AND i.pareja_origen = 'ficha_nueva' AND i.link_type = 'matrimonio'$$, 1);
SELECT pg_temp.assert_rows('7: one en_espera invitation with origen, creado_por, edicion and inscripcion, no token',
  $$SELECT 1 FROM public.invitaciones_acceso ia JOIN public.usuarios u ON u.id = ia.usuario_id
     WHERE u.cedula = '99800010' AND ia.estado = 'en_espera' AND ia.origen = 'taller_pareja'
       AND ia.creado_por = 'cf000000-0000-4000-8000-000000000041'
       AND ia.edicion_id = 'cf000000-0000-4000-8000-000000000090'
       AND ia.inscripcion_id = (SELECT (j ->> 'inscripcion_id')::uuid FROM t_ci_result WHERE key = 'ok_m1')
       AND ia.token_hash IS NULL AND ia.envios = 0$$, 1);

-- M3 on E_ins (al_inscribirse, novios).
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf000000-0000-4000-8000-0000000000a3');
SELECT pg_temp.capture('7: M3 enrolls with a new ficha on the al_inscribirse edición', 'ok_m3',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000091',
     '{"modo":"ficha_nueva","cedula":"99800011","nombre":"Beto","apellido":"Sol","email":"cf-beto@example.test","fecha_nacimiento":"1991-02-03","genero":"Masculino"}')$$);
RESET ROLE;
SELECT pg_temp.assert_rows('7: the novios ficha is Soltero',
  $$SELECT 1 FROM public.usuarios WHERE cedula = '99800011' AND estado_civil = 'Soltero'$$, 1);

CREATE TEMP TABLE t_ci_inv (cedula text, id uuid) ON COMMIT DROP;
GRANT SELECT ON t_ci_inv TO authenticated, anon;
SELECT pg_temp.run('7: collect the invitation ids',
  $$INSERT INTO t_ci_inv SELECT u.cedula, ia.id
      FROM public.invitaciones_acceso ia JOIN public.usuarios u ON u.id = ia.usuario_id
     WHERE u.cedula IN ('99800010', '99800011')$$);

-- ══ 8. pendientes_de_envio ══

SELECT pg_temp.assert_rows('8: the al_inscribirse invitation is ready at once',
  $$SELECT 1 FROM public.invitacion_acceso_pendientes_de_envio() p JOIN t_ci_inv t ON t.id = p.invitacion_id
     WHERE t.cedula = '99800011'$$, 1);
SELECT pg_temp.assert_rows('8: the al_aprobar invitation is not listed while pendiente',
  $$SELECT 1 FROM public.invitacion_acceso_pendientes_de_envio() p JOIN t_ci_inv t ON t.id = p.invitacion_id
     WHERE t.cedula = '99800010'$$, 0);
UPDATE public.taller_inscripciones SET estado = 'aprobado'
 WHERE id = (SELECT (j ->> 'inscripcion_id')::uuid FROM t_ci_result WHERE key = 'ok_m1');
SELECT pg_temp.assert_rows('8: once aprobado it is listed',
  $$SELECT 1 FROM public.invitacion_acceso_pendientes_de_envio() p JOIN t_ci_inv t ON t.id = p.invitacion_id
     WHERE t.cedula = '99800010'$$, 1);

-- ══ 9. preparar / registrar / consultar ══

SELECT pg_temp.capture('9: a malformed hash returns TOKEN_INVALIDO', 'prep_bad',
  $$SELECT public.invitacion_acceso_preparar_envio((SELECT id FROM t_ci_inv WHERE cedula = '99800010'), 'XYZ', now() + interval '7 days')$$,
  '{"ok":false,"codigo":"TOKEN_INVALIDO"}');
SELECT pg_temp.capture('9: an expiry beyond 8 days returns TOKEN_INVALIDO', 'prep_far',
  $$SELECT public.invitacion_acceso_preparar_envio((SELECT id FROM t_ci_inv WHERE cedula = '99800010'),
     (SELECT h FROM t_ci_hash WHERE k = 'h1'), now() + interval '30 days')$$,
  '{"ok":false,"codigo":"TOKEN_INVALIDO"}');
SELECT pg_temp.capture('9: preparar_envio returns what the email needs', 'prep_ok',
  $$SELECT public.invitacion_acceso_preparar_envio((SELECT id FROM t_ci_inv WHERE cedula = '99800010'),
     (SELECT h FROM t_ci_hash WHERE k = 'h1'), now() + interval '7 days')$$,
  '{"ok":true,"email":"cf-ana@example.test","nombre_invitado":"Ana María","nombre_invitante":"Mario ZZCI Uno","taller_nombre":"ZZ CI Matrimonio"}');
SELECT pg_temp.capture('9: before any send, consultar says invalid', 'cons_antes',
  $$SELECT public.invitacion_acceso_consultar((SELECT h FROM t_ci_hash WHERE k = 'h1'))$$, '{"valida":false}');
SELECT pg_temp.capture('9: a failed send keeps en_espera', 'reg_fail',
  $$SELECT public.invitacion_acceso_registrar_envio((SELECT id FROM t_ci_inv WHERE cedula = '99800010'), false, 'smtp caido')$$,
  '{"ok":true}');
SELECT pg_temp.assert_rows('9: ultimo_error stored, still en_espera, envios 0',
  $$SELECT 1 FROM public.invitaciones_acceso WHERE id = (SELECT id FROM t_ci_inv WHERE cedula = '99800010')
     AND estado = 'en_espera' AND envios = 0 AND ultimo_error = 'smtp caido'$$, 1);
SELECT pg_temp.capture('9: a successful send', 'reg_ok',
  $$SELECT public.invitacion_acceso_registrar_envio((SELECT id FROM t_ci_inv WHERE cedula = '99800010'), true, NULL)$$,
  '{"ok":true}');
SELECT pg_temp.assert_rows('9: enviada, envios 1, error cleared, no longer pending',
  $$SELECT 1 FROM public.invitaciones_acceso WHERE id = (SELECT id FROM t_ci_inv WHERE cedula = '99800010')
     AND estado = 'enviada' AND envios = 1 AND ultimo_error IS NULL AND ultimo_envio_en IS NOT NULL
     AND id NOT IN (SELECT invitacion_id FROM public.invitacion_acceso_pendientes_de_envio())$$, 1);
SELECT pg_temp.capture('9: consultar returns the names and the vinculo', 'cons_ok',
  $$SELECT public.invitacion_acceso_consultar((SELECT h FROM t_ci_hash WHERE k = 'h1'))$$,
  '{"valida":true,"taller_nombre":"ZZ CI Matrimonio","nombre_invitado":"Ana María","nombre_invitante":"Mario Z.","vinculo":"matrimonio"}');
SELECT pg_temp.capture('9: a resend rotates the token', 'prep_rot',
  $$SELECT public.invitacion_acceso_preparar_envio((SELECT id FROM t_ci_inv WHERE cedula = '99800010'),
     (SELECT h FROM t_ci_hash WHERE k = 'h2'), now() + interval '7 days') -> 'ok'$$, 'true');
SELECT pg_temp.capture('9: the old token no longer works', 'cons_old',
  $$SELECT public.invitacion_acceso_consultar((SELECT h FROM t_ci_hash WHERE k = 'h1'))$$, '{"valida":false}');
SELECT pg_temp.capture('9: an unknown token is invalid', 'cons_unknown',
  $$SELECT public.invitacion_acceso_consultar(repeat('0', 64))$$, '{"valida":false}');

-- ══ 10. verificar ══

SELECT pg_temp.capture('10: a wrong cédula counts down', 'ver_bad1',
  $$SELECT public.invitacion_acceso_verificar((SELECT h FROM t_ci_hash WHERE k = 'h2'), '12345678')$$,
  '{"ok":false,"codigo":"CEDULA_NO_COINCIDE","intentos_restantes":4}');
SELECT pg_temp.capture('10: a malformed cédula also counts', 'ver_bad2',
  $$SELECT public.invitacion_acceso_verificar((SELECT h FROM t_ci_hash WHERE k = 'h2'), 'xx')$$,
  '{"ok":false,"codigo":"CEDULA_NO_COINCIDE","intentos_restantes":3}');
SELECT pg_temp.capture('10: the right cédula (any format) moves to activando', 'ver_ok',
  $$SELECT public.invitacion_acceso_verificar((SELECT h FROM t_ci_hash WHERE k = 'h2'), 'V-99800010')
       - 'invitacion_id'$$,
  '{"ok":true,"email":"cf-ana@example.test"}');
SELECT pg_temp.assert_rows('10: activando with activando_en and the returned id',
  $$SELECT 1 FROM public.invitaciones_acceso ia JOIN t_ci_result r ON r.key = 'ver_ok'
     WHERE ia.id = (SELECT id FROM t_ci_inv WHERE cedula = '99800010')
       AND ia.estado = 'activando' AND ia.activando_en IS NOT NULL AND ia.intentos_activacion = 2$$, 1);

-- M3's invitation: five failures block it.
SELECT pg_temp.run('10: send M3''s invitation',
  $$SELECT public.invitacion_acceso_preparar_envio((SELECT id FROM t_ci_inv WHERE cedula = '99800011'),
     (SELECT h FROM t_ci_hash WHERE k = 'h3'), now() + interval '7 days');
    SELECT public.invitacion_acceso_registrar_envio((SELECT id FROM t_ci_inv WHERE cedula = '99800011'), true, NULL)$$);
SELECT pg_temp.run('10: four wrong attempts',
  $$SELECT public.invitacion_acceso_verificar((SELECT h FROM t_ci_hash WHERE k = 'h3'), '11111111') FROM generate_series(1, 4)$$);
SELECT pg_temp.capture('10: the fifth wrong attempt blocks', 'ver_block',
  $$SELECT public.invitacion_acceso_verificar((SELECT h FROM t_ci_hash WHERE k = 'h3'), '11111111')$$,
  '{"ok":false,"codigo":"BLOQUEADA"}');
SELECT pg_temp.assert_rows('10: bloqueada, token dropped, 5 attempts',
  $$SELECT 1 FROM public.invitaciones_acceso WHERE id = (SELECT id FROM t_ci_inv WHERE cedula = '99800011')
     AND estado = 'bloqueada' AND token_hash IS NULL AND intentos_activacion = 5$$, 1);
SELECT pg_temp.capture('10: even the right cédula is refused afterwards', 'ver_after',
  $$SELECT public.invitacion_acceso_verificar((SELECT h FROM t_ci_hash WHERE k = 'h3'), '99800011')$$,
  '{"ok":false,"codigo":"INVITACION_INVALIDA"}');

-- ══ 11. vincular ══

SELECT pg_temp.capture('11: an auth user with another email is refused', 'vin_otro',
  $$SELECT public.invitacion_acceso_vincular((SELECT id FROM t_ci_inv WHERE cedula = '99800010'),
     'cf000000-0000-4000-8000-0000000000b2', true)$$,
  '{"ok":false,"codigo":"AUTH_NO_COINCIDE"}');
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('cf000000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'cf-ana@example.test', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
SELECT pg_temp.capture('11: vincular links, grants miembro and records the spouse', 'vin_ok',
  $$SELECT public.invitacion_acceso_vincular((SELECT id FROM t_ci_inv WHERE cedula = '99800010'),
     'cf000000-0000-4000-8000-0000000000b3', true)$$,
  '{"ok":true,"conyuge_registrado":true}');
SELECT pg_temp.assert_rows('11: auth_id set and role miembro granted',
  $$SELECT 1 FROM public.usuarios u JOIN public.usuario_roles ur ON ur.usuario_id = u.id
     JOIN public.roles_sistema r ON r.id = ur.rol_id
     WHERE u.cedula = '99800010' AND u.auth_id = 'cf000000-0000-4000-8000-0000000000b3' AND r.nombre_interno = 'miembro'$$, 1);
SELECT pg_temp.assert_rows('11: invitation aceptada, token dropped, auth_user_id kept',
  $$SELECT 1 FROM public.invitaciones_acceso WHERE id = (SELECT id FROM t_ci_inv WHERE cedula = '99800010')
     AND estado = 'aceptada' AND token_hash IS NULL AND aceptada_en IS NOT NULL
     AND auth_user_id = 'cf000000-0000-4000-8000-0000000000b3'$$, 1);
SELECT pg_temp.assert_rows('11: one conyuge relation M1 → ficha',
  $$SELECT 1 FROM public.relaciones_usuarios r JOIN public.usuarios u ON u.id = r.usuario2_id
     WHERE r.usuario1_id = 'cf000000-0000-4000-8000-000000000041' AND u.cedula = '99800010' AND r.tipo_relacion = 'conyuge'$$, 1);
SELECT pg_temp.capture('11: a second vincular is refused', 'vin_twice',
  $$SELECT public.invitacion_acceso_vincular((SELECT id FROM t_ci_inv WHERE cedula = '99800010'),
     'cf000000-0000-4000-8000-0000000000b3', true)$$,
  '{"ok":false,"codigo":"INVITACION_INVALIDA"}');

-- ══ 12. ficha_tiene_invitacion_abierta ══

SELECT pg_temp.assert_rows('12: an accepted invitation is not open; a blocked one still guards the ficha',
  $$SELECT 1 WHERE NOT public.ficha_tiene_invitacion_abierta((SELECT id FROM public.usuarios WHERE cedula = '99800010'))
                 AND public.ficha_tiene_invitacion_abierta((SELECT id FROM public.usuarios WHERE cedula = '99800011'))
                 AND NOT public.ficha_tiene_invitacion_abierta('cf000000-0000-4000-8000-000000000051')$$, 1);

-- ══ 13. no_aprobado cancels ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf000000-0000-4000-8000-0000000000a4');
SELECT pg_temp.capture('13: M4 enrolls with a new ficha', 'ok_m4',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090',
     '{"modo":"ficha_nueva","cedula":"99800012","nombre":"Cira","apellido":"Paz","email":"cf-cira@example.test","fecha_nacimiento":"1985-07-08","genero":"Femenino"}') -> 'ok'$$,
  'true');
RESET ROLE;
SELECT pg_temp.assert_rows('13: the new ficha has an open invitation',
  $$SELECT 1 WHERE public.ficha_tiene_invitacion_abierta((SELECT id FROM public.usuarios WHERE cedula = '99800012'))$$, 1);
SELECT pg_temp.run('13: the invitation was sent',
  $$UPDATE public.invitaciones_acceso SET estado = 'enviada', token_hash = repeat('d4', 32), token_expira_en = now() + interval '7 days'
     WHERE usuario_id = (SELECT id FROM public.usuarios WHERE cedula = '99800012')$$);
UPDATE public.taller_inscripciones SET estado = 'no_aprobado', motivo_no_aprobado = 'ZZ CI'
 WHERE persona_principal_id = 'cf000000-0000-4000-8000-000000000044';
SELECT pg_temp.assert_rows('13: cancelada and token dropped; the ficha stays',
  $$SELECT 1 FROM public.invitaciones_acceso ia JOIN public.usuarios u ON u.id = ia.usuario_id
     WHERE u.cedula = '99800012' AND ia.estado = 'cancelada' AND ia.token_hash IS NULL$$, 1);
SELECT pg_temp.assert_rows('13: no open invitation remains',
  $$SELECT 1 WHERE NOT public.ficha_tiene_invitacion_abierta((SELECT id FROM public.usuarios WHERE cedula = '99800012'))$$, 1);

-- ══ 14. authenticated is kept out ══

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf000000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_sqlstate_msg('14: authenticated cannot read invitaciones_acceso',
  $$SELECT count(*) FROM public.invitaciones_acceso$$, '42501', 'permission denied for table invitaciones_acceso');
SELECT pg_temp.assert_sqlstate_msg('14: authenticated cannot call consultar',
  $$SELECT public.invitacion_acceso_consultar(repeat('0', 64))$$, '42501', 'permission denied for function invitacion_acceso_consultar');
SELECT pg_temp.assert_sqlstate_msg('14: authenticated cannot call ficha_tiene_invitacion_abierta',
  $$SELECT public.ficha_tiene_invitacion_abierta('cf000000-0000-4000-8000-000000000051')$$, '42501', 'permission denied for function ficha_tiene_invitacion_abierta');

-- ══ 15. Old modes keep their shape ══

SELECT pg_temp.as_persona('cf000000-0000-4000-8000-0000000000a2');
SELECT pg_temp.capture('15: an individual enrollment still returns pareja_origen null', 'ind',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000092', NULL) - 'inscripcion_id'$$,
  '{"ok":true,"estado":"pendiente","pareja_origen":null}');
SELECT pg_temp.assert_sqlstate_msg('15: an unknown modo still raises MODO_INVALIDO',
  $$SELECT public.talleres_inscribirme('cf000000-0000-4000-8000-000000000090', '{"modo":"otro"}')$$,
  '22023', 'MODO_INVALIDO');
RESET ROLE;
RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;

SELECT pg_temp.report();

ROLLBACK;
