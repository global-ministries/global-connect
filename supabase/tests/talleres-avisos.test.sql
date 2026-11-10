-- T7 (odd/tasks/talleres-reserva-publica.md, S6 S11 S13 S14) — RED→GREEN for
-- 20261110230000_talleres_avisos.sql: the automatic notices (in-app row +
-- email outbox), the class reminder, «Avísame» and the notices center.
-- Run against STAGING inside BEGIN…ROLLBACK after 20261110230000 — nothing
-- here is kept; fixture ids live under cf7a0000-..., emails end in
-- @example.test, phones are already normalized.
--
-- H = talleres_hoy(), captured once into zz_7a.h.
-- Nodes: ROOT cf7a…01 > UNO …02, DOS …03, PAR …04.
-- Talleres: T_uno …10 (individual), T_dos …11 (individual, notices switched
--   off in section 8), T_par …12 (pareja matrimonio).
-- Ediciones (event cf7a…8<n>, cohorte cf7a…c<n>):
--   E0 90 (T_uno) en_curso, grupo G0 …40 (Gina and Hugo lead): sesión 1
--     tomorrow programada, 2 tomorrow cancelada, 3 the day after.
--   E1 91 (T_uno) abierto, grupo G1 …41 capacidad 1 (cupo 1).
--   E2 92 (T_dos) abierto, no grupo.
--   E3 93 (T_par) abierto, no grupo.
-- Persons (auth a<n>): COORD 21/a1 coordinator.write+read at UNO; OTRO 22/a2
--   coordinator.write+read at DOS; LEAD 23/a3 lead.read at UNO; P1 24/a4;
--   P2 25 (no account, no email, phone); P3 26/a6; PA 27/a7 + PB 28/a8 (a
--   couple); GINA 29/a9 and HUGO 2a (leaders of G0).
--
-- Covered (one block per rule): 1 grants; 2 a new inscription writes one
--   recibida per person (in-app + outbox; sin_correo without email); 3
--   idempotency; 4 aprobada / rechazada with motivo; 5 grupo asignado; 6
--   owner-only read stays; 7 reminder selection (only aprobadas, tomorrow,
--   programada, once); 8 a switched-off notice writes nothing, and its
--   switch's authority; 9 «Avísame» notifies everyone once; 10 certificado;
--   11 outbox lease, result and daily cap; 12 cleanup; 13 notices center.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

SELECT set_config('zz_7a.h', public.talleres_hoy()::text, true);

CREATE TEMP TABLE t_7a_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_7a_cases (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_7a (key text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT, UPDATE ON t_7a_failures, t_7a_cases, t_7a TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.h() RETURNS date LANGUAGE sql AS $$
  SELECT current_setting('zz_7a.h')::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_7a_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Expects SQLSTATE and, when given, the exact message.
CREATE OR REPLACE FUNCTION pg_temp.assert_error(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_7a_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.fail(p_case, 'expected ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got no exception');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE IS DISTINCT FROM p_sqlstate OR (p_message IS NOT NULL AND SQLERRM IS DISTINCT FROM p_message) THEN
        PERFORM pg_temp.fail(p_case, 'expected ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
      END IF;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rows(p_case text, p_sql text, p_expected int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_n int;
BEGIN
  INSERT INTO t_7a_cases VALUES (p_case);
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
  INSERT INTO t_7a_cases VALUES (p_case);
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
  INSERT INTO t_7a_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v;
    INSERT INTO t_7a (key, j) VALUES (p_key, v) ON CONFLICT (key) DO UPDATE SET j = EXCLUDED.j;
    IF p_expected IS NOT NULL AND v IS DISTINCT FROM p_expected THEN
      PERFORM pg_temp.fail(p_case, 'expected ' || p_expected::text || ', got ' || coalesce(v::text, 'NULL'));
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.fail(p_case, 'expected no error, got ' || SQLSTATE || ' ' || SQLERRM);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.check(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v boolean;
BEGIN
  INSERT INTO t_7a_cases VALUES (p_case);
  BEGIN
    EXECUTE 'SELECT (' || p_sql || ')' INTO v;
    IF v IS NOT TRUE THEN
      PERFORM pg_temp.fail(p_case, 'expected true, got ' || coalesce(v::text, 'NULL'));
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
  SELECT count(*) INTO v_total FROM t_7a_cases;
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_7a_failures;
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
  ('cf7a0000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ 7A Raiz', NULL, true),
  ('cf7a0000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ 7A Uno', 'cf7a0000-0000-4000-8000-000000000001', true),
  ('cf7a0000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ 7A Dos', 'cf7a0000-0000-4000-8000-000000000001', true),
  ('cf7a0000-0000-4000-8000-000000000004', 'talleres_crecimiento', 'ZZ 7A Parejas', 'cf7a0000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('cf7a0000-0000-4000-8000-000000000010', 'zz-7a-uno', 'ZZ 7A Uno', 'cf7a0000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 7, -3),
  ('cf7a0000-0000-4000-8000-000000000011', 'zz-7a-dos', 'ZZ 7A Dos', 'cf7a0000-0000-4000-8000-000000000003', 'individual', NULL, 'cadencia', 7, -3),
  ('cf7a0000-0000-4000-8000-000000000012', 'zz-7a-par', 'ZZ 7A Parejas', 'cf7a0000-0000-4000-8000-000000000004', 'pareja', 'matrimonio', 'cadencia', 7, 0);

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata)
SELECT ('cf7a0000-0000-4000-8000-00000000008' || n)::uuid, 'workshop', 'active', 'ZZ 7A Evento ' || n, CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb
  FROM generate_series(0, 3) AS n;

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin
)
SELECT ('cf7a0000-0000-4000-8000-00000000009' || x.n)::uuid, ('cf7a0000-0000-4000-8000-00000000008' || x.n)::uuid, x.taller::uuid,
       x.tipo, x.link, 'permanente_custom', x.estado, 'ZZ 7A E' || x.n, 3, 90, 'permanente_custom',
       pg_temp.h() + x.inicio, pg_temp.h() + x.cierre, pg_temp.h() + 30
  FROM (VALUES
    (0, 'cf7a0000-0000-4000-8000-000000000010', 'individual', NULL, 'en_curso', -6, -8),
    (1, 'cf7a0000-0000-4000-8000-000000000010', 'individual', NULL, 'abierto', 8, 5),
    (2, 'cf7a0000-0000-4000-8000-000000000011', 'individual', NULL, 'abierto', 8, 5),
    (3, 'cf7a0000-0000-4000-8000-000000000012', 'pareja', 'matrimonio', 'abierto', 8, 5)
  ) AS x(n, taller, tipo, link, estado, inicio, cierre);

UPDATE public.taller_ediciones SET lugar = 'Salón 2'
 WHERE id = 'cf7a0000-0000-4000-8000-000000000090';

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at)
SELECT ('cf7a0000-0000-4000-8000-0000000000c' || n)::uuid, ('cf7a0000-0000-4000-8000-00000000009' || n)::uuid,
       'cf7a0000-0000-4000-8000-000000000002', 'ZZ 7A Cohorte ' || n, (pg_temp.h() - 6)::timestamptz
  FROM generate_series(0, 3) AS n;

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('cf7a0000-0000-4000-8000-000000000040', 'cf7a0000-0000-4000-8000-0000000000c0', 'ZZ 7A Jueves noche', 10, 'activo'),
  ('cf7a0000-0000-4000-8000-000000000041', 'cf7a0000-0000-4000-8000-0000000000c1', 'ZZ 7A Cupo uno', 1, 'activo');

INSERT INTO public.taller_sesiones (id, grupo_id, numero, fecha_programada, estado) VALUES
  ('cf7a0000-0000-4000-8000-0000000000e1', 'cf7a0000-0000-4000-8000-000000000040', 1, pg_temp.h() + 1, 'programada'),
  ('cf7a0000-0000-4000-8000-0000000000e2', 'cf7a0000-0000-4000-8000-000000000040', 2, pg_temp.h() + 1, 'programada'),
  ('cf7a0000-0000-4000-8000-0000000000e3', 'cf7a0000-0000-4000-8000-000000000040', 3, pg_temp.h() + 2, 'programada');
UPDATE public.taller_sesiones SET estado = 'cancelada' WHERE id = 'cf7a0000-0000-4000-8000-0000000000e2';

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('cf7a0000-0000-4000-8000-0000000000' || a)::uuid, 'authenticated', 'authenticated', 'cf7a-' || a || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY['a1', 'a2', 'a3', 'a4', 'a6', 'a7', 'a8', 'a9']) AS a
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  ('cf7a0000-0000-4000-8000-000000000021', 'cf7a0000-0000-4000-8000-0000000000a1', 'Carla', 'ZZ7A Coord', 'cf7a-a1@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf7a0000-0000-4000-8000-000000000022', 'cf7a0000-0000-4000-8000-0000000000a2', 'Otto', 'ZZ7A Otro', 'cf7a-a2@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf7a0000-0000-4000-8000-000000000023', 'cf7a0000-0000-4000-8000-0000000000a3', 'Leo', 'ZZ7A Lider', 'cf7a-a3@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf7a0000-0000-4000-8000-000000000024', 'cf7a0000-0000-4000-8000-0000000000a4', 'Pía', 'ZZ7A Uno', 'cf7a-a4@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf7a0000-0000-4000-8000-000000000025', NULL, 'Quena', 'ZZ7A Dos', NULL, '04141117002', 'Soltero', 'Femenino'),
  ('cf7a0000-0000-4000-8000-000000000026', 'cf7a0000-0000-4000-8000-0000000000a6', 'Rita', 'ZZ7A Tres', 'cf7a-a6@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf7a0000-0000-4000-8000-000000000027', 'cf7a0000-0000-4000-8000-0000000000a7', 'Ana', 'ZZ7A ParA', 'cf7a-a7@example.test', NULL, 'Casado', 'Femenino'),
  ('cf7a0000-0000-4000-8000-000000000028', 'cf7a0000-0000-4000-8000-0000000000a8', 'Beto', 'ZZ7A ParB', 'cf7a-a8@example.test', NULL, 'Casado', 'Masculino'),
  ('cf7a0000-0000-4000-8000-000000000029', 'cf7a0000-0000-4000-8000-0000000000a9', 'Gina María', 'ZZ7A Lider', 'cf7a-a9@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf7a0000-0000-4000-8000-00000000002a', NULL, 'Hugo', 'ZZ7A Lider', NULL, NULL, 'Soltero', 'Masculino');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('cf7a0000-0000-4000-8000-000000000021', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'cf7a0000-0000-4000-8000-000000000002'),
  ('cf7a0000-0000-4000-8000-000000000021', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'cf7a0000-0000-4000-8000-000000000002'),
  ('cf7a0000-0000-4000-8000-000000000022', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'cf7a0000-0000-4000-8000-000000000003'),
  ('cf7a0000-0000-4000-8000-000000000022', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'cf7a0000-0000-4000-8000-000000000003'),
  ('cf7a0000-0000-4000-8000-000000000023', 'talleres_crecimiento.lead.read', 'talleres_crecimiento', 'taller', 'cf7a0000-0000-4000-8000-000000000002');

INSERT INTO public.taller_grupo_asignaciones (id, grupo_id, persona_id, rol, activo) VALUES
  ('cf7a0000-0000-4000-8000-0000000000f1', 'cf7a0000-0000-4000-8000-000000000040', 'cf7a0000-0000-4000-8000-000000000029', 'lider', true),
  ('cf7a0000-0000-4000-8000-0000000000f2', 'cf7a0000-0000-4000-8000-000000000040', 'cf7a0000-0000-4000-8000-00000000002a', 'lider', true);

-- ── 1. grants ───────────────────────────────────────────────────────

SELECT pg_temp.check('1: internal writers and job functions are not callable by authenticated',
  $chk$NOT has_function_privilege('authenticated', 'public.talleres_aviso_emitir(text, text, uuid, uuid, uuid, text, text, text, text, jsonb, text, text, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.talleres_aviso_inscripcion(uuid, text, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.talleres_avisame_notificar(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.talleres_avisos_recordatorios_encolar(timestamptz)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.talleres_avisos_envios_reclamar(integer, integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.talleres_avisos_envios_resultado(uuid, boolean, text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.talleres_avisos_limpiar()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.talleres_avisos_panel(uuid)', 'EXECUTE')$chk$);
SELECT pg_temp.check('1: the job functions are callable by service_role',
  $chk$has_function_privilege('service_role', 'public.talleres_avisos_recordatorios_encolar(timestamptz)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.talleres_avisos_envios_reclamar(integer, integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.talleres_avisos_envios_resultado(uuid, boolean, text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.talleres_avisos_limpiar()', 'EXECUTE')$chk$);
SELECT pg_temp.check('1: the panel and the switch are callable by authenticated',
  $chk$has_function_privilege('authenticated', 'public.talleres_avisos_panel(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.talleres_avisos_config_guardar(uuid, text, boolean)', 'EXECUTE')$chk$);
SELECT pg_temp.check('1: the outbox is not readable by authenticated or anon',
  $chk$NOT has_table_privilege('authenticated', 'public.taller_avisos_envios', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.taller_avisos_envios', 'SELECT')$chk$);
SELECT pg_temp.check('1: avisos_config defaults to {} (everything on)',
  $chk$(SELECT avisos_config = '{}'::jsonb FROM public.talleres WHERE id = 'cf7a0000-0000-4000-8000-000000000010')$chk$);

-- ── 2. a new inscription: one recibida per person ───────────────────

SELECT pg_temp.run('2: insert a pendiente for P1 in E1 and a couple in E3',
  $$INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado) VALUES
      ('cf7a0000-0000-4000-8000-000000000050', 'cf7a0000-0000-4000-8000-000000000091', 'cf7a0000-0000-4000-8000-0000000000c1', 'cf7a0000-0000-4000-8000-000000000024', NULL, NULL, 'pendiente'),
      ('cf7a0000-0000-4000-8000-000000000051', 'cf7a0000-0000-4000-8000-000000000093', 'cf7a0000-0000-4000-8000-0000000000c3', 'cf7a0000-0000-4000-8000-000000000027', 'cf7a0000-0000-4000-8000-000000000028', 'matrimonio', 'pendiente')$$);
SELECT pg_temp.assert_rows('2: P1 has one recibida in the app, linking to Mi recorrido',
  $$SELECT 1 FROM public.avisos_persona WHERE persona_id = 'cf7a0000-0000-4000-8000-000000000024'
     AND tipo = 'inscripcion_recibida' AND titulo = 'Recibimos tu solicitud' AND url = '/talleres/mi-recorrido'
     AND cuerpo LIKE 'Recibimos tu inscripción en ZZ 7A Uno.%'
     AND clave = 'inscripcion_recibida:cf7a0000-0000-4000-8000-000000000050:cf7a0000-0000-4000-8000-000000000024'
     AND datos ->> 'taller' = 'ZZ 7A Uno'$$, 1);
SELECT pg_temp.assert_rows('2: both people of the couple get one recibida each',
  $$SELECT 1 FROM public.avisos_persona WHERE tipo = 'inscripcion_recibida'
     AND persona_id IN ('cf7a0000-0000-4000-8000-000000000027', 'cf7a0000-0000-4000-8000-000000000028')$$, 2);
SELECT pg_temp.assert_rows('2: each recibida has one pendiente email in the outbox with its subject',
  $$SELECT 1 FROM public.taller_avisos_envios WHERE tipo = 'inscripcion_recibida' AND estado = 'pendiente'
     AND edicion_id IN ('cf7a0000-0000-4000-8000-000000000091', 'cf7a0000-0000-4000-8000-000000000093')
     AND email LIKE 'cf7a-%@example.test' AND asunto LIKE 'Recibimos tu solicitud para ZZ 7A %'
     AND datos ->> 'cta' = 'Ver mi inscripción'$$, 3);
SELECT pg_temp.run('2: insert a pendiente for P2 (no email) in E1',
  $$INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado) VALUES
      ('cf7a0000-0000-4000-8000-000000000052', 'cf7a0000-0000-4000-8000-000000000090', 'cf7a0000-0000-4000-8000-0000000000c0', 'cf7a0000-0000-4000-8000-000000000025', 'pendiente')$$);
SELECT pg_temp.assert_rows('2: without an email the outbox row is sin_correo (in-app row still written)',
  $$SELECT 1 FROM public.taller_avisos_envios e JOIN public.avisos_persona a ON a.clave = e.clave
     WHERE e.persona_id = 'cf7a0000-0000-4000-8000-000000000025' AND e.estado = 'sin_correo' AND e.email IS NULL$$, 1);

-- ── 3. idempotency ──────────────────────────────────────────────────

SELECT pg_temp.capture('3: emitting the same recibida again writes nothing', 'otra_vez',
  $$SELECT to_jsonb(public.talleres_aviso_inscripcion('cf7a0000-0000-4000-8000-000000000051', 'recibida'))$$, '0');
SELECT pg_temp.assert_rows('3: still one in-app row and one outbox row per person of the couple',
  $$SELECT 1 FROM public.taller_avisos_envios e
     WHERE e.clave LIKE 'inscripcion_recibida:cf7a0000-0000-4000-8000-000000000051:%'$$, 2);
SELECT pg_temp.assert_rows('3: the in-app rows of the couple did not grow',
  $$SELECT 1 FROM public.avisos_persona WHERE clave LIKE 'inscripcion_recibida:cf7a0000-0000-4000-8000-000000000051:%'$$, 2);

-- ── 4. aprobada / rechazada ─────────────────────────────────────────

SELECT pg_temp.run('4: approve the couple',
  $$UPDATE public.taller_inscripciones SET estado = 'aprobado' WHERE id = 'cf7a0000-0000-4000-8000-000000000051'$$);
SELECT pg_temp.assert_rows('4: each partner gets one aprobada',
  $$SELECT 1 FROM public.avisos_persona WHERE tipo = 'inscripcion_aprobada' AND titulo = 'Aprobamos tu inscripción'
     AND cuerpo LIKE 'Tienes tu lugar en ZZ 7A Parejas. Empieza el %'
     AND persona_id IN ('cf7a0000-0000-4000-8000-000000000027', 'cf7a0000-0000-4000-8000-000000000028')$$, 2);
SELECT pg_temp.run('4: reject P2 with a motivo',
  $$UPDATE public.taller_inscripciones SET estado = 'no_aprobado', motivo_no_aprobado = 'El grupo es solo para mujeres casadas'
     WHERE id = 'cf7a0000-0000-4000-8000-000000000052'$$);
SELECT pg_temp.assert_rows('4: the rechazada carries the motivo and no link',
  $$SELECT 1 FROM public.avisos_persona WHERE persona_id = 'cf7a0000-0000-4000-8000-000000000025'
     AND tipo = 'inscripcion_rechazada' AND url IS NULL
     AND cuerpo = 'No pudimos aprobar tu inscripción en ZZ 7A Uno. Motivo: El grupo es solo para mujeres casadas. Si tienes dudas, habla con la coordinación del taller.'$$, 1);

-- ── 5. grupo asignado ───────────────────────────────────────────────

SELECT pg_temp.run('5: P3 approved in E0 and put in G0',
  $$INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado) VALUES
      ('cf7a0000-0000-4000-8000-000000000053', 'cf7a0000-0000-4000-8000-000000000090', 'cf7a0000-0000-4000-8000-0000000000c0', 'cf7a0000-0000-4000-8000-000000000026', 'aprobado');
    UPDATE public.taller_inscripciones SET grupo_id = 'cf7a0000-0000-4000-8000-000000000040'
     WHERE id = 'cf7a0000-0000-4000-8000-000000000053'$$);
SELECT pg_temp.assert_rows('5: an inscription inserted as aprobado gets aprobada',
  $$SELECT 1 FROM public.avisos_persona
     WHERE clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000053:cf7a0000-0000-4000-8000-000000000026'$$, 1);
SELECT pg_temp.assert_rows('5: a started edición gives no start date',
  $$SELECT 1 FROM public.avisos_persona
     WHERE clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000053:cf7a0000-0000-4000-8000-000000000026'
       AND cuerpo = 'Tienes tu lugar en ZZ 7A Uno. Pronto te avisamos tu grupo y quién lo facilita.'$$, 1);
SELECT pg_temp.assert_rows('5: and no recibida',
  $$SELECT 1 FROM public.avisos_persona
     WHERE clave LIKE 'inscripcion_recibida:cf7a0000-0000-4000-8000-000000000053:%'$$, 0);
SELECT pg_temp.assert_rows('5: grupo asignado names the grupo, the facilitadores (first names), the next clase and the lugar',
  $$SELECT 1 FROM public.avisos_persona WHERE persona_id = 'cf7a0000-0000-4000-8000-000000000026'
     AND tipo = 'grupo_asignado'
     AND cuerpo LIKE 'Ya tienes grupo en ZZ 7A Uno: ZZ 7A Jueves noche. Facilita Gina y Hugo. Empieza el %Salón 2.'$$, 1);
SELECT pg_temp.run('5: the same grupo again (unassign + reassign) writes nothing new',
  $$UPDATE public.taller_inscripciones SET grupo_id = NULL WHERE id = 'cf7a0000-0000-4000-8000-000000000053';
    UPDATE public.taller_inscripciones SET grupo_id = 'cf7a0000-0000-4000-8000-000000000040' WHERE id = 'cf7a0000-0000-4000-8000-000000000053'$$);
SELECT pg_temp.assert_rows('5: still one grupo asignado',
  $$SELECT 1 FROM public.avisos_persona WHERE persona_id = 'cf7a0000-0000-4000-8000-000000000026' AND tipo = 'grupo_asignado'$$, 1);

-- ── 6. owner-only read stays ────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf7a0000-0000-4000-8000-0000000000a4');
SELECT pg_temp.assert_rows('6: P1 sees only her own notices through mis_avisos',
  $$SELECT 1 FROM public.mis_avisos() WHERE persona_id <> 'cf7a0000-0000-4000-8000-000000000024'$$, 0);
SELECT pg_temp.assert_rows('6: P1 sees her recibida',
  $$SELECT 1 FROM public.mis_avisos() WHERE tipo = 'inscripcion_recibida'$$, 1);
SELECT pg_temp.capture('6: P1 cannot mark Ana''s notice as read', 'marcar_ajeno',
  $$SELECT to_jsonb(public.aviso_marcar_leido((SELECT id FROM public.avisos_persona
      WHERE persona_id = 'cf7a0000-0000-4000-8000-000000000027' LIMIT 1)))$$, 'false');
SELECT pg_temp.assert_error('6: the outbox is not readable by a member',
  $$SELECT 1 FROM public.taller_avisos_envios$$, '42501');
SELECT pg_temp.as_persona('cf7a0000-0000-4000-8000-0000000000a7');
SELECT pg_temp.capture('6: Ana marks her own notice as read', 'marcar_propio',
  $$SELECT to_jsonb(public.aviso_marcar_leido((SELECT id FROM public.mis_avisos() WHERE tipo = 'inscripcion_aprobada' LIMIT 1)))$$, 'true');
RESET ROLE;

-- ── 7. reminder selection ───────────────────────────────────────────

SELECT pg_temp.run('7: G0 also has a pendiente (P1) and a retirado (Ana)',
  $$INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, grupo_id) VALUES
      ('cf7a0000-0000-4000-8000-000000000054', 'cf7a0000-0000-4000-8000-000000000090', 'cf7a0000-0000-4000-8000-0000000000c0', 'cf7a0000-0000-4000-8000-000000000024', 'pendiente', 'cf7a0000-0000-4000-8000-000000000040'),
      ('cf7a0000-0000-4000-8000-000000000055', 'cf7a0000-0000-4000-8000-000000000090', 'cf7a0000-0000-4000-8000-0000000000c0', 'cf7a0000-0000-4000-8000-000000000027', 'aprobado', 'cf7a0000-0000-4000-8000-000000000040');
    UPDATE public.taller_inscripciones SET estado = 'retirado' WHERE id = 'cf7a0000-0000-4000-8000-000000000055'$$);
SELECT pg_temp.run('7: queue tomorrow''s reminders', $$SELECT public.talleres_avisos_recordatorios_encolar(now())$$);
SELECT pg_temp.assert_rows('7: only the aprobada of G0 (P3) is reminded of the programada clase of tomorrow',
  $$SELECT 1 FROM public.avisos_persona WHERE tipo = 'recordatorio_clase'
     AND datos ->> 'sesion_id' LIKE 'cf7a0000-%'$$, 1);
SELECT pg_temp.assert_rows('7: the reminder is P3''s, for sesión 1, keyed by (sesión, persona), expiring after the class day',
  $$SELECT 1 FROM public.avisos_persona WHERE tipo = 'recordatorio_clase' AND persona_id = 'cf7a0000-0000-4000-8000-000000000026'
     AND clave = 'recordatorio_clase:cf7a0000-0000-4000-8000-0000000000e1:cf7a0000-0000-4000-8000-000000000026'
     AND titulo = 'Mañana es tu clase' AND cuerpo LIKE 'Clase 1 de ZZ 7A Uno · %Salón 2. Facilita Gina y Hugo.'
     AND expira_at = ((pg_temp.h() + 2)::timestamp AT TIME ZONE 'America/Caracas')$$, 1);
SELECT pg_temp.assert_rows('7: the reminder email is queued with its subject',
  $$SELECT 1 FROM public.taller_avisos_envios
     WHERE clave = 'recordatorio_clase:cf7a0000-0000-4000-8000-0000000000e1:cf7a0000-0000-4000-8000-000000000026'
       AND asunto = 'Mañana es tu clase de ZZ 7A Uno' AND estado = 'pendiente'$$, 1);
SELECT pg_temp.capture('7: queuing again the same day writes nothing', 'rec_otra_vez',
  $$SELECT to_jsonb(public.talleres_avisos_recordatorios_encolar(now()))$$, '0');
SELECT pg_temp.assert_rows('7: no reminder for the cancelada clase nor for the day after',
  $$SELECT 1 FROM public.avisos_persona WHERE tipo = 'recordatorio_clase'
     AND (clave LIKE 'recordatorio_clase:cf7a0000-0000-4000-8000-0000000000e2:%'
          OR clave LIKE 'recordatorio_clase:cf7a0000-0000-4000-8000-0000000000e3:%')$$, 0);

-- ── 8. a switched-off notice writes nothing ─────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf7a0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_error('8: a coordinator of another node cannot switch T_dos',
  $$SELECT public.talleres_avisos_config_guardar('cf7a0000-0000-4000-8000-000000000011', 'inscripcion_recibida', false)$$, '42501');
SELECT pg_temp.as_persona('cf7a0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_error('8: a leader (lead.read) cannot switch',
  $$SELECT public.talleres_avisos_config_guardar('cf7a0000-0000-4000-8000-000000000010', 'inscripcion_recibida', false)$$, '42501');
SELECT pg_temp.as_persona('cf7a0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.assert_error('8: an unknown notice is refused',
  $$SELECT public.talleres_avisos_config_guardar('cf7a0000-0000-4000-8000-000000000011', 'taller_cambio_fecha', false)$$, '22023');
SELECT pg_temp.capture('8: T_dos''s coordinator switches recibida off', 'apagar',
  $$SELECT public.talleres_avisos_config_guardar('cf7a0000-0000-4000-8000-000000000011', 'inscripcion_recibida', false)$$,
  '{"inscripcion_recibida": false}');
RESET ROLE;
SELECT pg_temp.run('8: insert a pendiente for P3 in E2 (T_dos)',
  $$INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado) VALUES
      ('cf7a0000-0000-4000-8000-000000000056', 'cf7a0000-0000-4000-8000-000000000092', 'cf7a0000-0000-4000-8000-0000000000c2', 'cf7a0000-0000-4000-8000-000000000026', 'pendiente')$$);
SELECT pg_temp.assert_rows('8: no in-app row nor email for a switched-off notice',
  $$SELECT 1 FROM public.taller_avisos_envios WHERE clave LIKE 'inscripcion_recibida:cf7a0000-0000-4000-8000-000000000056:%'
    UNION ALL
    SELECT 1 FROM public.avisos_persona WHERE clave LIKE 'inscripcion_recibida:cf7a0000-0000-4000-8000-000000000056:%'$$, 0);
SELECT pg_temp.run('8: approve it: aprobada is still on',
  $$UPDATE public.taller_inscripciones SET estado = 'aprobado' WHERE id = 'cf7a0000-0000-4000-8000-000000000056'$$);
SELECT pg_temp.assert_rows('8: the other notices of T_dos still go',
  $$SELECT 1 FROM public.avisos_persona WHERE clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000056:cf7a0000-0000-4000-8000-000000000026'$$, 1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf7a0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.capture('8: switching it back on removes the key', 'encender',
  $$SELECT public.talleres_avisos_config_guardar('cf7a0000-0000-4000-8000-000000000011', 'inscripcion_recibida', true)$$, '{}');
RESET ROLE;

-- ── 9. «Avísame»: everyone, once ────────────────────────────────────

-- E1 has cupo 1 and P1's pendiente fills it (section 2).
INSERT INTO public.taller_avisame_lugar (id, edicion_id, nombre, email, usuario_id, ip_hash) VALUES
  ('cf7a0000-0000-4000-8000-0000000000b1', 'cf7a0000-0000-4000-8000-000000000091', 'Rita Tres', 'cf7a-a6@example.test', 'cf7a0000-0000-4000-8000-000000000026', repeat('a', 64)),
  ('cf7a0000-0000-4000-8000-0000000000b2', 'cf7a0000-0000-4000-8000-000000000091', 'Sofía Nueva', 'sofia.7a@example.test', NULL, repeat('b', 64));
SELECT pg_temp.check('9: E1 is full before anyone leaves',
  $chk$(SELECT c.disponibles = 0 FROM public.talleres_cupo_edicion_calculo('cf7a0000-0000-4000-8000-000000000091') c)$chk$);
SELECT pg_temp.run('9: P1 is rejected: a place frees',
  $$UPDATE public.taller_inscripciones SET estado = 'no_aprobado', motivo_no_aprobado = 'Duplicada'
     WHERE id = 'cf7a0000-0000-4000-8000-000000000050'$$);
SELECT pg_temp.assert_rows('9: both waiting people are marked notified',
  $$SELECT 1 FROM public.taller_avisame_lugar WHERE edicion_id = 'cf7a0000-0000-4000-8000-000000000091' AND notificado_en IS NOT NULL$$, 2);
SELECT pg_temp.assert_rows('9: both get an email with the reservation link',
  $$SELECT 1 FROM public.taller_avisos_envios WHERE tipo = 'lugar_disponible' AND estado = 'pendiente'
     AND edicion_id = 'cf7a0000-0000-4000-8000-000000000091' AND datos ->> 'url' = '/talleres/reservar/zz-7a-uno'
     AND asunto = 'Se liberó un lugar en ZZ 7A Uno'
     AND email IN ('cf7a-a6@example.test', 'sofia.7a@example.test')$$, 2);
SELECT pg_temp.assert_rows('9: the known person also gets it in the app',
  $$SELECT 1 FROM public.avisos_persona WHERE tipo = 'lugar_disponible' AND persona_id = 'cf7a0000-0000-4000-8000-000000000026'
     AND url = '/talleres/reservar/zz-7a-uno'$$, 1);
SELECT pg_temp.run('9: someone takes the place and leaves again',
  $$INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado) VALUES
      ('cf7a0000-0000-4000-8000-000000000057', 'cf7a0000-0000-4000-8000-000000000091', 'cf7a0000-0000-4000-8000-0000000000c1', 'cf7a0000-0000-4000-8000-000000000028', 'pendiente');
    UPDATE public.taller_inscripciones SET estado = 'retirado' WHERE id = 'cf7a0000-0000-4000-8000-000000000057'$$);
SELECT pg_temp.assert_rows('9: nobody is notified twice',
  $$SELECT 1 FROM public.taller_avisos_envios WHERE tipo = 'lugar_disponible' AND edicion_id = 'cf7a0000-0000-4000-8000-000000000091'$$, 2);
SELECT pg_temp.capture('9: with a free place and nobody left waiting, nobody is notified', 'avisame_nada',
  $$SELECT to_jsonb(public.talleres_avisame_notificar('cf7a0000-0000-4000-8000-000000000091'))$$, '0');

-- ── 10. certificado listo ───────────────────────────────────────────

SELECT pg_temp.run('10: a certificate for P3',
  $$INSERT INTO public.taller_certificados (id, inscripcion_id, codigo_verificacion, taller_id, persona_id,
      nombre_taller_snapshot, nombre_participante_snapshot, firmantes_snapshot)
    VALUES ('cf7a0000-0000-4000-8000-0000000000d1', 'cf7a0000-0000-4000-8000-000000000053', 'ZZ7ACERT00000001',
      'cf7a0000-0000-4000-8000-000000000090', 'cf7a0000-0000-4000-8000-000000000026', 'ZZ 7A Uno', 'Rita ZZ7A Tres', '[]'::jsonb)$$);
SELECT pg_temp.assert_rows('10: certificado listo links to the certificate',
  $$SELECT 1 FROM public.avisos_persona WHERE persona_id = 'cf7a0000-0000-4000-8000-000000000026'
     AND tipo = 'certificado_listo' AND url = '/talleres/mi-recorrido/certificados/cf7a0000-0000-4000-8000-0000000000d1'
     AND clave = 'certificado_listo:cf7a0000-0000-4000-8000-0000000000d1'$$, 1);

-- ── 11. outbox lease, result, daily cap ─────────────────────────────

SELECT pg_temp.capture('11: with a daily cap of 0 nothing is leased', 'tope0',
  $$SELECT to_jsonb(count(*)) FROM public.talleres_avisos_envios_reclamar(10, 0)$$, '0');
SELECT pg_temp.run('11: lease everything due', $$CREATE TEMP TABLE t_7a_lote ON COMMIT DROP AS
    SELECT * FROM public.talleres_avisos_envios_reclamar(100, 10000)$$);
SELECT pg_temp.check('11: the lease returns the fixture''s pendiente rows only (never sin_correo)',
  $chk$(SELECT count(*) FROM t_7a_lote WHERE clave LIKE '%cf7a0000-%') =
    (SELECT count(*) FROM public.taller_avisos_envios WHERE clave LIKE '%cf7a0000-%' AND estado = 'pendiente')
  AND NOT EXISTS (SELECT 1 FROM t_7a_lote WHERE email IS NULL)$chk$);
SELECT pg_temp.check('11: each leased row counts one attempt',
  $chk$NOT EXISTS (SELECT 1 FROM t_7a_lote WHERE intentos <> 1)$chk$);
SELECT pg_temp.capture('11: a second run right away leases none of them', 'lease2',
  $$SELECT to_jsonb(count(*)) FROM public.talleres_avisos_envios_reclamar(100, 10000) WHERE clave LIKE '%cf7a0000-%'$$, '0');
SELECT pg_temp.run('11: record one sent and one failed',
  $$SELECT public.talleres_avisos_envios_resultado(
      (SELECT id FROM public.taller_avisos_envios WHERE clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000051:cf7a0000-0000-4000-8000-000000000027'), true);
    SELECT public.talleres_avisos_envios_resultado(
      (SELECT id FROM public.taller_avisos_envios WHERE clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000051:cf7a0000-0000-4000-8000-000000000028'), false, 'Resend 500')$$);
SELECT pg_temp.assert_rows('11: sent is enviado with a date',
  $$SELECT 1 FROM public.taller_avisos_envios WHERE clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000051:cf7a0000-0000-4000-8000-000000000027'
     AND estado = 'enviado' AND enviado_en IS NOT NULL$$, 1);
SELECT pg_temp.assert_rows('11: failed goes back to pendiente later, with the error',
  $$SELECT 1 FROM public.taller_avisos_envios WHERE clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000051:cf7a0000-0000-4000-8000-000000000028'
     AND estado = 'pendiente' AND error = 'Resend 500' AND disponible_en > now()$$, 1);
SELECT pg_temp.run('11: the fifth failure is final',
  $$UPDATE public.taller_avisos_envios SET intentos = 5
     WHERE clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000051:cf7a0000-0000-4000-8000-000000000028';
    SELECT public.talleres_avisos_envios_resultado(
      (SELECT id FROM public.taller_avisos_envios WHERE clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000051:cf7a0000-0000-4000-8000-000000000028'), false, 'Rebote')$$);
SELECT pg_temp.assert_rows('11: fallido after five attempts',
  $$SELECT 1 FROM public.taller_avisos_envios WHERE clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000051:cf7a0000-0000-4000-8000-000000000028'
     AND estado = 'fallido'$$, 1);
SELECT pg_temp.assert_error('11: an unknown id is P0002',
  $$SELECT public.talleres_avisos_envios_resultado('cf7a0000-0000-4000-8000-0000000000ff', true)$$, 'P0002');

-- ── 12. cleanup ─────────────────────────────────────────────────────

INSERT INTO public.avisos_persona (id, persona_id, tipo, titulo, cuerpo, datos, expira_at) VALUES
  ('cf7a0000-0000-4000-8000-0000000000c8', 'cf7a0000-0000-4000-8000-000000000024', 'codigo_reserva', 'Tu código', 'Código 123456', '{}'::jsonb, now() - interval '1 minute'),
  ('cf7a0000-0000-4000-8000-0000000000c9', 'cf7a0000-0000-4000-8000-000000000024', 'codigo_reserva', 'Tu código', 'Código 654321', '{}'::jsonb, now() + interval '5 minutes');
INSERT INTO public.reserva_publica_limites (id, ip_hash, accion, created_at) VALUES
  ('cf7a0000-0000-4000-8000-0000000000d8', repeat('c', 64), 'zz_siete', now() - interval '8 days'),
  ('cf7a0000-0000-4000-8000-0000000000d9', repeat('c', 64), 'zz_siete', now() - interval '6 days');
SELECT pg_temp.run('12: clean', $$SELECT public.talleres_avisos_limpiar()$$);
SELECT pg_temp.assert_rows('12: the expired code text is gone, the row stays',
  $$SELECT 1 FROM public.avisos_persona WHERE id = 'cf7a0000-0000-4000-8000-0000000000c8' AND cuerpo IS NULL$$, 1);
SELECT pg_temp.assert_rows('12: a live code keeps its text',
  $$SELECT 1 FROM public.avisos_persona WHERE id = 'cf7a0000-0000-4000-8000-0000000000c9' AND cuerpo = 'Código 654321'$$, 1);
SELECT pg_temp.assert_rows('12: only rate-limit rows older than 7 days are deleted',
  $$SELECT 1 FROM public.reserva_publica_limites WHERE accion = 'zz_siete'$$, 1);

-- ── 13. notices center ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf7a0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_error('13: a leader cannot read the notices center',
  $$SELECT public.talleres_avisos_panel('cf7a0000-0000-4000-8000-000000000010')$$, '42501');
SELECT pg_temp.as_persona('cf7a0000-0000-4000-8000-0000000000a4');
SELECT pg_temp.assert_error('13: a member cannot read it',
  $$SELECT public.talleres_avisos_panel('cf7a0000-0000-4000-8000-000000000010')$$, '42501');
SELECT pg_temp.as_persona('cf7a0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('13: the coordinator reads T_uno''s center', 'panel',
  $$SELECT public.talleres_avisos_panel('cf7a0000-0000-4000-8000-000000000010')$$);
RESET ROLE;
SELECT pg_temp.check('13: config, puede_editar and this month''s counts',
  $chk$(SELECT j -> 'config' = '{}'::jsonb AND (j ->> 'puede_editar')::boolean
          AND (j -> 'mes' ->> 'inscripcion_recibida')::int = 4
          AND (j -> 'mes' ->> 'lugar_disponible')::int = 2
     FROM t_7a WHERE key = 'panel')$chk$);
SELECT pg_temp.check('13: the history lists T_uno''s rows, newest first, with persona and estado',
  $chk$(SELECT jsonb_array_length(j -> 'historial') = (SELECT count(*) FROM public.taller_avisos_envios WHERE taller_id = 'cf7a0000-0000-4000-8000-000000000010')
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(j -> 'historial') h
                       WHERE h ->> 'persona' = 'Quena ZZ7A Dos' AND h ->> 'estado' = 'sin_correo')
     FROM t_7a WHERE key = 'panel')$chk$);
SELECT pg_temp.check('13: a phone only on rows nobody could email (manual WhatsApp)',
  $chk$(SELECT bool_and(CASE WHEN h ->> 'estado' IN ('sin_correo', 'fallido') THEN true ELSE h ->> 'telefono' IS NULL END)
          AND bool_or(h ->> 'telefono' = '04141117002')
     FROM t_7a, jsonb_array_elements(j -> 'historial') h WHERE key = 'panel')$chk$);
SELECT pg_temp.check('13: every notice to a person shows its in-app twin; the email-only «Avísame» does not',
  $chk$(SELECT count(*) = 0 FROM t_7a, jsonb_array_elements(j -> 'historial') h
    WHERE key = 'panel' AND (h ->> 'en_app')::boolean IS NOT TRUE AND h ->> 'tipo' <> 'lugar_disponible')
  AND (SELECT count(*) = 1 FROM t_7a, jsonb_array_elements(j -> 'historial') h
    WHERE key = 'panel' AND h ->> 'tipo' = 'lugar_disponible' AND (h ->> 'en_app')::boolean IS NOT TRUE)$chk$);
SELECT pg_temp.check('13: Ana''s aprobada, read in section 6, joins its outbox row with leido_at',
  $chk$(SELECT ap.leido_at IS NOT NULL FROM public.taller_avisos_envios e
     JOIN public.avisos_persona ap ON ap.persona_id = e.persona_id AND ap.clave = e.clave
    WHERE e.clave = 'inscripcion_aprobada:cf7a0000-0000-4000-8000-000000000051:cf7a0000-0000-4000-8000-000000000027')$chk$);

SELECT pg_temp.report();

ROLLBACK;
