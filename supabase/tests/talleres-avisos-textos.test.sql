-- R4a (odd/tasks/talleres-rediseno.md, S10; L12, L13) — RED→GREEN for
-- 20261113140000_talleres_avisos_textos.sql: editable subject and message
-- of the talleres notices, per-clase class reminder, render rules, save
-- validation, read/write permissions and «Restaurar».
-- Run against STAGING inside BEGIN…ROLLBACK after 20261113140000 — nothing
-- here is kept; fixture ids live under cf4e0000-..., emails end in
-- @example.test. One taller per dream_team_equipo.
--
-- H = talleres_hoy(), captured once into zz_4e.h.
-- Nodes: ROOT cf4e…01 > UNO …02, DOS …03.
-- Talleres: T_uno …10 (UNO; plantilla C1 «Sígueme» …b1, C2 «Intimidad con
--   Dios» …b2), T_dos …11 (DOS).
-- Edición E0 …90 (T_uno, en_curso, lugar «Salón 2», start_time 19:00,
--   cohorte …c0 started tomorrow), grupo G0 …40 (no leaders: no
--   facilitadores). Its sesiones come from generate_taller_sesiones (C1
--   tomorrow, C2 moved to tomorrow too).
-- Persons (auth a<n>): COORD 21/a1 coordinator.write+read at UNO; DIR
--   22/a2 director.write+read at UNO; LECT 23/a3 coordinator.read at UNO;
--   OTRO 24/a4 coordinator.write+read at DOS; LEAD 25/a5 lead.read at UNO;
--   members P1 26/a6 «Pía», P2 27/a7 «Rosa María», P3 28/a8, P4 29/a9.
--
-- Covered: 1 grants and table privileges; 2 render rules; 3 sesiones
--   remember their plantilla clase; 4 without custom text the reminder is
--   today's exact text; 5 who may save (non-staff, other node, reader,
--   anon); 6 save validation (unknown variable, variable of another kind,
--   optional variable in the subject, unclosed brace, lengths, clase
--   rules, fixed kind) and a rejected save changes nothing; 7 per-clase
--   beats general, variables filled, lines with empty data dropped, queued
--   notices not re-rendered; 8 who may read (table + panel); 9 another
--   kind keeps its exact default text; 10 «Restaurar» returns to the
--   default.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

SELECT set_config('zz_4e.h', public.talleres_hoy()::text, true);

CREATE TEMP TABLE t_4e_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_4e_cases (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_4e (key text PRIMARY KEY, j jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT, UPDATE ON t_4e_failures, t_4e_cases, t_4e TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.h() RETURNS date LANGUAGE sql AS $$
  SELECT current_setting('zz_4e.h')::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_4e_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Expects SQLSTATE and, when given, the exact message.
CREATE OR REPLACE FUNCTION pg_temp.assert_error(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_4e_cases VALUES (p_case);
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
  INSERT INTO t_4e_cases VALUES (p_case);
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
  INSERT INTO t_4e_cases VALUES (p_case);
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
  INSERT INTO t_4e_cases VALUES (p_case);
  BEGIN
    EXECUTE p_sql INTO v;
    INSERT INTO t_4e (key, j) VALUES (p_key, v) ON CONFLICT (key) DO UPDATE SET j = EXCLUDED.j;
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
  INSERT INTO t_4e_cases VALUES (p_case);
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
  SELECT count(*) INTO v_total FROM t_4e_cases;
  SELECT count(*), string_agg(case_name, E'\n') INTO v_n, v_msg FROM t_4e_failures;
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

-- The save call used by the validation cases (COORD, T_uno).
CREATE OR REPLACE FUNCTION pg_temp.guardar(p_tipo text, p_clase uuid, p_asunto text, p_mensaje text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.talleres_aviso_texto_guardar('cf4e0000-0000-4000-8000-000000000010', p_tipo, p_clase, p_asunto, p_mensaje);
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ── fixtures ────────────────────────────────────────────────────────

INSERT INTO public.dream_team_equipos (id, experiencia, label, parent_equipo_id, activo) VALUES
  ('cf4e0000-0000-4000-8000-000000000001', 'talleres_crecimiento', 'ZZ 4E Raiz', NULL, true),
  ('cf4e0000-0000-4000-8000-000000000002', 'talleres_crecimiento', 'ZZ 4E Uno', 'cf4e0000-0000-4000-8000-000000000001', true),
  ('cf4e0000-0000-4000-8000-000000000003', 'talleres_crecimiento', 'ZZ 4E Dos', 'cf4e0000-0000-4000-8000-000000000001', true);

INSERT INTO public.talleres (id, slug, nombre, dream_team_equipo_id, tipo, vinculo, regimen, cadencia_dias, cierre_inscripcion_offset_dias) VALUES
  ('cf4e0000-0000-4000-8000-000000000010', 'zz-4e-uno', 'ZZ 4E Uno', 'cf4e0000-0000-4000-8000-000000000002', 'individual', NULL, 'cadencia', 7, -3),
  ('cf4e0000-0000-4000-8000-000000000011', 'zz-4e-dos', 'ZZ 4E Dos', 'cf4e0000-0000-4000-8000-000000000003', 'individual', NULL, 'cadencia', 7, -3);

INSERT INTO public.taller_plantilla_clases (id, taller_id, numero, tema, activo) VALUES
  ('cf4e0000-0000-4000-8000-0000000000b1', 'cf4e0000-0000-4000-8000-000000000010', 1, 'Sígueme', true),
  ('cf4e0000-0000-4000-8000-0000000000b2', 'cf4e0000-0000-4000-8000-000000000010', 2, 'Intimidad con Dios', true);

INSERT INTO public.operating_core_events (id, kind, estado, title, start_date, visibility_scope, metadata) VALUES
  ('cf4e0000-0000-4000-8000-000000000080', 'workshop', 'active', 'ZZ 4E Evento 0', CURRENT_DATE, 'talleres_crecimiento', '{}'::jsonb);

INSERT INTO public.taller_ediciones (
  id, operating_core_event_id, taller_id, tipo, link_type, modalidad_inscripcion, estado,
  nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot, modalidad_inscripcion_snapshot,
  fecha_inicio, cierre_inscripcion, fecha_fin, lugar, recurrence_rule
) VALUES (
  'cf4e0000-0000-4000-8000-000000000090', 'cf4e0000-0000-4000-8000-000000000080', 'cf4e0000-0000-4000-8000-000000000010',
  'individual', NULL, 'permanente_custom', 'en_curso', 'ZZ 4E Uno · Noviembre', 2, 90, 'permanente_custom',
  pg_temp.h() - 6, pg_temp.h() - 8, pg_temp.h() + 30, 'Salón 2', '{"start_time":"19:00"}'::jsonb
);

INSERT INTO public.talleres_crecimiento_cohortes (id, taller_id, dream_team_equipo_id, edicion, started_at) VALUES
  ('cf4e0000-0000-4000-8000-0000000000c0', 'cf4e0000-0000-4000-8000-000000000090', 'cf4e0000-0000-4000-8000-000000000002',
   'ZZ 4E Cohorte 0', (pg_temp.h() + 1)::timestamptz);

INSERT INTO public.taller_grupos (id, cohorte_id, nombre, capacidad, estado) VALUES
  ('cf4e0000-0000-4000-8000-000000000040', 'cf4e0000-0000-4000-8000-0000000000c0', 'ZZ 4E Domingo', 10, 'activo');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT ('cf4e0000-0000-4000-8000-0000000000' || a)::uuid, 'authenticated', 'authenticated', 'cf4e-' || a || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9']) AS a
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, telefono, estado_civil, genero) VALUES
  ('cf4e0000-0000-4000-8000-000000000021', 'cf4e0000-0000-4000-8000-0000000000a1', 'Neida', 'ZZ4E Coord', 'cf4e-a1@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf4e0000-0000-4000-8000-000000000022', 'cf4e0000-0000-4000-8000-0000000000a2', 'Dario', 'ZZ4E Dir', 'cf4e-a2@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf4e0000-0000-4000-8000-000000000023', 'cf4e0000-0000-4000-8000-0000000000a3', 'Lucia', 'ZZ4E Lectura', 'cf4e-a3@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf4e0000-0000-4000-8000-000000000024', 'cf4e0000-0000-4000-8000-0000000000a4', 'Otto', 'ZZ4E Otro', 'cf4e-a4@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf4e0000-0000-4000-8000-000000000025', 'cf4e0000-0000-4000-8000-0000000000a5', 'Leo', 'ZZ4E Lider', 'cf4e-a5@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf4e0000-0000-4000-8000-000000000026', 'cf4e0000-0000-4000-8000-0000000000a6', 'Pía', 'ZZ4E Uno', 'cf4e-a6@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf4e0000-0000-4000-8000-000000000027', 'cf4e0000-0000-4000-8000-0000000000a7', 'Rosa María', 'ZZ4E Dos', 'cf4e-a7@example.test', NULL, 'Soltero', 'Femenino'),
  ('cf4e0000-0000-4000-8000-000000000028', 'cf4e0000-0000-4000-8000-0000000000a8', 'Tomás', 'ZZ4E Tres', 'cf4e-a8@example.test', NULL, 'Soltero', 'Masculino'),
  ('cf4e0000-0000-4000-8000-000000000029', 'cf4e0000-0000-4000-8000-0000000000a9', 'Vera', 'ZZ4E Cuatro', 'cf4e-a9@example.test', NULL, 'Soltero', 'Femenino');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  ('cf4e0000-0000-4000-8000-000000000021', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'cf4e0000-0000-4000-8000-000000000002'),
  ('cf4e0000-0000-4000-8000-000000000021', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'cf4e0000-0000-4000-8000-000000000002'),
  ('cf4e0000-0000-4000-8000-000000000022', 'talleres_crecimiento.director.write', 'talleres_crecimiento', 'taller', 'cf4e0000-0000-4000-8000-000000000002'),
  ('cf4e0000-0000-4000-8000-000000000022', 'talleres_crecimiento.director.read', 'talleres_crecimiento', 'taller', 'cf4e0000-0000-4000-8000-000000000002'),
  ('cf4e0000-0000-4000-8000-000000000023', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'cf4e0000-0000-4000-8000-000000000002'),
  ('cf4e0000-0000-4000-8000-000000000024', 'talleres_crecimiento.coordinator.write', 'talleres_crecimiento', 'taller', 'cf4e0000-0000-4000-8000-000000000003'),
  ('cf4e0000-0000-4000-8000-000000000024', 'talleres_crecimiento.coordinator.read', 'talleres_crecimiento', 'taller', 'cf4e0000-0000-4000-8000-000000000003'),
  ('cf4e0000-0000-4000-8000-000000000025', 'talleres_crecimiento.lead.read', 'talleres_crecimiento', 'taller', 'cf4e0000-0000-4000-8000-000000000002');

-- ── 1. grants ───────────────────────────────────────────────────────

SELECT pg_temp.check('1: the texts table is only SELECT for authenticated, nothing for anon',
  $chk$has_table_privilege('authenticated', 'public.taller_aviso_textos', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.taller_aviso_textos', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.taller_aviso_textos', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.taller_aviso_textos', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.taller_aviso_textos', 'SELECT')$chk$);
SELECT pg_temp.check('1: RLS is on',
  $chk$(SELECT relrowsecurity FROM pg_class WHERE oid = 'public.taller_aviso_textos'::regclass)$chk$);
SELECT pg_temp.check('1: save, restore and variables are callable by authenticated, not by anon',
  $chk$has_function_privilege('authenticated', 'public.talleres_aviso_texto_guardar(uuid, text, uuid, text, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.talleres_aviso_texto_restaurar(uuid, text, uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.talleres_aviso_variables()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.talleres_aviso_texto_guardar(uuid, text, uuid, text, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.talleres_aviso_texto_restaurar(uuid, text, uuid)', 'EXECUTE')$chk$);
SELECT pg_temp.check('1: the writer stays internal',
  $chk$NOT has_function_privilege('authenticated', 'public.talleres_aviso_emitir(text, text, uuid, uuid, uuid, text, text, text, text, jsonb, text, text, text)', 'EXECUTE')$chk$);
SELECT pg_temp.check('1: the variables list has the 7 editable kinds and no «Cambio de fecha»',
  $chk$(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.talleres_aviso_variables()) k)
     = ARRAY['certificado_listo', 'grupo_asignado', 'inscripcion_aprobada', 'inscripcion_rechazada',
             'inscripcion_recibida', 'lugar_disponible', 'recordatorio_clase']$chk$);

-- ── 2. render rules ─────────────────────────────────────────────────

SELECT pg_temp.capture('2: variables are filled, a line with an empty one is dropped, no double period after «p. m.»', 'render',
  $$SELECT to_jsonb(public.talleres_aviso_texto_render(
      E'Hola {nombre}.\nLugar: {lugar}\n\nNos vemos a las {hora}.\nIndicaciones: {indicaciones}',
      '{"nombre":"Ana","lugar":null,"hora":"7:00 p. m.","indicaciones":"  "}'::jsonb))$$,
  to_jsonb(E'Hola Ana.\n\nNos vemos a las 7:00 p. m.'::text));
SELECT pg_temp.capture('2: a value is never scanned again for {var}', 'render_inyeccion',
  $$SELECT to_jsonb(public.talleres_aviso_texto_render('{a} y {b}', '{"a":"{b}","b":"x"}'::jsonb))$$,
  to_jsonb('{b} y x'::text));
SELECT pg_temp.capture('2: blank lines left by dropped lines collapse to one', 'render_blancos',
  $$SELECT to_jsonb(public.talleres_aviso_texto_render(E'A\n\n{x}\n\nB\n\n{x}', '{}'::jsonb))$$,
  to_jsonb(E'A\n\nB'::text));

-- ── 3. sesiones remember their plantilla clase ──────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a2');
SELECT pg_temp.run('3: the director generates G0''s sesiones from the plantilla',
  $$SELECT public.generate_taller_sesiones('cf4e0000-0000-4000-8000-000000000040')$$);
RESET ROLE;
SELECT pg_temp.assert_rows('3: each sesión keeps the plantilla clase it came from',
  $$SELECT 1 FROM public.taller_sesiones WHERE grupo_id = 'cf4e0000-0000-4000-8000-000000000040'
     AND ((numero = 1 AND tema = 'Sígueme' AND plantilla_clase_id = 'cf4e0000-0000-4000-8000-0000000000b1'
           AND fecha_programada = pg_temp.h() + 1)
       OR (numero = 2 AND tema = 'Intimidad con Dios' AND plantilla_clase_id = 'cf4e0000-0000-4000-8000-0000000000b2'))$$, 2);
SELECT pg_temp.run('3: clase 2 is moved to tomorrow too (both reminders go out together)',
  $$UPDATE public.taller_sesiones SET fecha_programada = pg_temp.h() + 1
     WHERE grupo_id = 'cf4e0000-0000-4000-8000-000000000040' AND numero = 2$$);

-- ── 4. no custom text: today's exact text ───────────────────────────

SELECT pg_temp.run('4: P1 approved in G0, queue tomorrow''s reminders',
  $$INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, grupo_id) VALUES
      ('cf4e0000-0000-4000-8000-000000000051', 'cf4e0000-0000-4000-8000-000000000090', 'cf4e0000-0000-4000-8000-0000000000c0',
       'cf4e0000-0000-4000-8000-000000000026', 'aprobado', 'cf4e0000-0000-4000-8000-000000000040');
    SELECT public.talleres_avisos_recordatorios_encolar(now())$$);
SELECT pg_temp.assert_rows('4: P1''s reminder of clase 1 is today''s text, in the app and in the email',
  $$SELECT 1 FROM public.avisos_persona a JOIN public.taller_avisos_envios e ON e.clave = a.clave
     WHERE a.persona_id = 'cf4e0000-0000-4000-8000-000000000026' AND a.tipo = 'recordatorio_clase'
       AND a.datos ->> 'sesion_id' = (SELECT id::text FROM public.taller_sesiones
                                       WHERE grupo_id = 'cf4e0000-0000-4000-8000-000000000040' AND numero = 1)
       AND a.cuerpo = 'Clase 1: Sígueme de ZZ 4E Uno · ' || public.talleres_aviso_fecha(pg_temp.h() + 1) || ' · 7:00 p. m. · Salón 2.'
       AND e.datos ->> 'cuerpo' = a.cuerpo
       AND e.asunto = 'Mañana es tu clase de ZZ 4E Uno'$$, 1);
SELECT pg_temp.assert_rows('4: the stored data carries no variables nor plantilla_clase_id',
  $$SELECT 1 FROM public.taller_avisos_envios e
     WHERE e.persona_id = 'cf4e0000-0000-4000-8000-000000000026'
       AND (e.datos ? 'variables' OR e.datos ? 'plantilla_clase_id')$$, 0);

-- ── 5. who may save ─────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_error('5: a leader (lead.read) cannot save',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, 'Mañana: {taller}', 'Hola {nombre}')$$, '42501', 'sin_permisos_para_este_taller');
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a4');
SELECT pg_temp.assert_error('5: a coordinator of another node cannot save',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, 'Mañana: {taller}', 'Hola {nombre}')$$, '42501', 'sin_permisos_para_este_taller');
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_error('5: a reader (coordinator.read only) cannot save',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, 'Mañana: {taller}', 'Hola {nombre}')$$, '42501', 'sin_permisos_para_este_taller');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_error('5: anon cannot save',
  $$SELECT public.talleres_aviso_texto_guardar('cf4e0000-0000-4000-8000-000000000010', 'recordatorio_clase', NULL, 'x', 'y')$$, '42501');
SELECT pg_temp.assert_error('5: anon cannot read the texts',
  $$SELECT 1 FROM public.taller_aviso_textos$$, '42501');
RESET ROLE;
SELECT pg_temp.assert_rows('5: nothing was saved', $$SELECT 1 FROM public.taller_aviso_textos
  WHERE taller_id = 'cf4e0000-0000-4000-8000-000000000010'$$, 0);

-- ── 6. save and validation ──────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('6: the coordinator saves the general class reminder', 'general',
  $$SELECT jsonb_build_object('asunto', r ->> 'asunto', 'clase_id', r -> 'clase_id', 'updated_by', r ->> 'updated_by')
      FROM pg_temp.guardar('recordatorio_clase', NULL, '  Clase {numero} de {taller}   mañana ',
        E'Hola {nombre}, mañana es la clase {numero}: {clase}.\r\n{fecha} · {hora}.\nFacilita {facilitadores}.\nIndicaciones: {indicaciones}\n') r$$,
  jsonb_build_object('asunto', 'Clase {numero} de {taller} mañana', 'clase_id', NULL,
                     'updated_by', 'cf4e0000-0000-4000-8000-000000000021'));
SELECT pg_temp.capture('6: and the text of clase 1', 'clase1',
  $$SELECT to_jsonb(r ->> 'clase_id')
      FROM pg_temp.guardar('recordatorio_clase', 'cf4e0000-0000-4000-8000-0000000000b1', 'Mañana empieza {taller}',
        E'Primer paso: {clase}.\n\nNos vemos en {lugar}.') r$$,
  to_jsonb('cf4e0000-0000-4000-8000-0000000000b1'::text));
SELECT pg_temp.capture('6: saving the same (taller, tipo, clase) again updates the row', 'clase1_otra',
  $$SELECT to_jsonb(r ->> 'clase_id')
      FROM pg_temp.guardar('recordatorio_clase', 'cf4e0000-0000-4000-8000-0000000000b1', 'Mañana empieza {taller}',
        E'Primer paso: {clase}.\n\nNos vemos en {lugar}.') r$$,
  to_jsonb('cf4e0000-0000-4000-8000-0000000000b1'::text));
SELECT pg_temp.assert_error('6: an unknown variable is rejected',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, 'Mañana', 'Tu facilitadora: {facilitadora}')$$,
  '22023', 'VARIABLE_DESCONOCIDA: {facilitadora}');
SELECT pg_temp.assert_error('6: every unknown variable is named once, in order',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, 'Hola {x}', 'Hola {y} {x} {nombre}')$$,
  '22023', 'VARIABLE_DESCONOCIDA: {x}, {y}');
SELECT pg_temp.assert_error('6: a variable of another kind is unknown here ({grupo} in «Aprobada»)',
  $$SELECT pg_temp.guardar('inscripcion_aprobada', NULL, 'Aprobada', 'Tu grupo: {grupo}')$$,
  '22023', 'VARIABLE_DESCONOCIDA: {grupo}');
SELECT pg_temp.assert_error('6: a variable that may be empty is not allowed in the subject',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, 'Mañana {fecha}', 'Hola')$$,
  '22023', 'VARIABLE_NO_PERMITIDA_EN_ASUNTO: {fecha}');
SELECT pg_temp.assert_error('6: an unclosed brace is rejected',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, 'Mañana', 'Hola {nombre')$$, '22023', 'LLAVE_SIN_CERRAR');
SELECT pg_temp.assert_error('6: an empty subject is rejected',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, '   ', 'Hola')$$, '22023', 'ASUNTO_VACIO');
SELECT pg_temp.assert_error('6: a subject over 200 characters is rejected',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, repeat('a', 201), 'Hola')$$, '22023', 'ASUNTO_DEMASIADO_LARGO');
SELECT pg_temp.assert_error('6: an empty message is rejected',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, 'Mañana', E' \n ')$$, '22023', 'MENSAJE_VACIO');
SELECT pg_temp.assert_error('6: a message over 1000 characters is rejected',
  $$SELECT pg_temp.guardar('recordatorio_clase', NULL, 'Mañana', repeat('a', 1001))$$, '22023', 'MENSAJE_DEMASIADO_LARGO');
SELECT pg_temp.assert_error('6: a clase is only for the class reminder',
  $$SELECT pg_temp.guardar('inscripcion_aprobada', 'cf4e0000-0000-4000-8000-0000000000b1', 'Aprobada', 'Hola')$$,
  '22023', 'CLASE_SOLO_EN_RECORDATORIO');
SELECT pg_temp.assert_error('6: a clase of another taller (or none) is rejected',
  $$SELECT pg_temp.guardar('recordatorio_clase', 'cf4e0000-0000-4000-8000-0000000000ff', 'Mañana', 'Hola')$$,
  '22023', 'CLASE_INVALIDA');
SELECT pg_temp.assert_error('6: «Cambio de fecha» is not editable',
  $$SELECT pg_temp.guardar('taller_cambio_fecha', NULL, 'Cambio', 'Hola')$$, '22023', 'AVISO_NO_EDITABLE');
RESET ROLE;
SELECT pg_temp.assert_rows('6: only the two valid saves are stored, the rejected ones changed nothing',
  $$SELECT 1 FROM public.taller_aviso_textos WHERE taller_id = 'cf4e0000-0000-4000-8000-000000000010'
     AND tipo = 'recordatorio_clase'
     AND ((clase_id IS NULL AND asunto = 'Clase {numero} de {taller} mañana'
           AND mensaje = E'Hola {nombre}, mañana es la clase {numero}: {clase}.\n{fecha} · {hora}.\nFacilita {facilitadores}.\nIndicaciones: {indicaciones}')
       OR (clase_id = 'cf4e0000-0000-4000-8000-0000000000b1' AND asunto = 'Mañana empieza {taller}'))$$, 2);
SELECT pg_temp.assert_rows('6: and nothing else for that taller', $$SELECT 1 FROM public.taller_aviso_textos
  WHERE taller_id = 'cf4e0000-0000-4000-8000-000000000010'$$, 2);

-- ── 7. per-clase beats general; data filled; empty lines dropped ────

SELECT pg_temp.run('7: P2 approved in G0, queue tomorrow''s reminders again',
  $$INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, grupo_id) VALUES
      ('cf4e0000-0000-4000-8000-000000000052', 'cf4e0000-0000-4000-8000-000000000090', 'cf4e0000-0000-4000-8000-0000000000c0',
       'cf4e0000-0000-4000-8000-000000000027', 'aprobado', 'cf4e0000-0000-4000-8000-000000000040');
    SELECT public.talleres_avisos_recordatorios_encolar(now())$$);
SELECT pg_temp.assert_rows('7: clase 1 uses its own text (app + email, subject too)',
  $$SELECT 1 FROM public.avisos_persona a JOIN public.taller_avisos_envios e ON e.clave = a.clave
     WHERE a.persona_id = 'cf4e0000-0000-4000-8000-000000000027' AND a.tipo = 'recordatorio_clase'
       AND a.datos ->> 'sesion_id' = (SELECT id::text FROM public.taller_sesiones
                                       WHERE grupo_id = 'cf4e0000-0000-4000-8000-000000000040' AND numero = 1)
       AND a.titulo = 'Mañana es tu clase'
       AND a.cuerpo = E'Primer paso: Sígueme.\n\nNos vemos en Salón 2.'
       AND e.datos ->> 'cuerpo' = a.cuerpo
       AND e.asunto = 'Mañana empieza ZZ 4E Uno'$$, 1);
SELECT pg_temp.assert_rows('7: clase 2 (no text of its own) uses the general text: nombre, numero, clase, fecha, hora filled; Facilita and Indicaciones lines dropped',
  $$SELECT 1 FROM public.avisos_persona a JOIN public.taller_avisos_envios e ON e.clave = a.clave
     WHERE a.persona_id = 'cf4e0000-0000-4000-8000-000000000027' AND a.tipo = 'recordatorio_clase'
       AND a.datos ->> 'sesion_id' = (SELECT id::text FROM public.taller_sesiones
                                       WHERE grupo_id = 'cf4e0000-0000-4000-8000-000000000040' AND numero = 2)
       AND a.cuerpo = E'Hola Rosa, mañana es la clase 2: Intimidad con Dios.\n'
                      || public.talleres_aviso_fecha(pg_temp.h() + 1) || ' · 7:00 p. m.'
       AND e.datos ->> 'cuerpo' = a.cuerpo
       AND e.asunto = 'Clase 2 de ZZ 4E Uno mañana'$$, 1);
SELECT pg_temp.assert_rows('7: P1''s queued reminders were not re-rendered (still today''s text)',
  $$SELECT 1 FROM public.avisos_persona a JOIN public.taller_avisos_envios e ON e.clave = a.clave
     WHERE a.persona_id = 'cf4e0000-0000-4000-8000-000000000026' AND a.tipo = 'recordatorio_clase'
       AND a.cuerpo LIKE 'Clase _: % de ZZ 4E Uno · %Salón 2.' AND e.asunto = 'Mañana es tu clase de ZZ 4E Uno'$$, 2);

-- ── 8. who may read ─────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_rows('8: the coordinator reads both texts', $$SELECT 1 FROM public.taller_aviso_textos
  WHERE taller_id = 'cf4e0000-0000-4000-8000-000000000010'$$, 2);
SELECT pg_temp.capture('8: the panel lists them with who edited them', 'panel',
  $$SELECT jsonb_build_object('n', jsonb_array_length(p -> 'textos'),
             'por', (SELECT array_agg(DISTINCT t ->> 'editado_por') FROM jsonb_array_elements(p -> 'textos') t))
      FROM public.talleres_avisos_panel('cf4e0000-0000-4000-8000-000000000010') p$$,
  jsonb_build_object('n', 2, 'por', jsonb_build_array('Neida ZZ4E Coord')));
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a3');
SELECT pg_temp.assert_rows('8: a reader of the taller sees the texts («Ver texto»)', $$SELECT 1 FROM public.taller_aviso_textos
  WHERE taller_id = 'cf4e0000-0000-4000-8000-000000000010'$$, 2);
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_rows('8: a leader (lead.read) sees none', $$SELECT 1 FROM public.taller_aviso_textos$$, 0);
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a4');
SELECT pg_temp.assert_rows('8: a coordinator of another node sees none', $$SELECT 1 FROM public.taller_aviso_textos
  WHERE taller_id = 'cf4e0000-0000-4000-8000-000000000010'$$, 0);
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a6');
SELECT pg_temp.assert_rows('8: a member sees none', $$SELECT 1 FROM public.taller_aviso_textos$$, 0);
RESET ROLE;

-- ── 9. another kind keeps its exact default ─────────────────────────

SELECT pg_temp.run('9: P3 asks for E0 and is not approved',
  $$INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado) VALUES
      ('cf4e0000-0000-4000-8000-000000000053', 'cf4e0000-0000-4000-8000-000000000090', 'cf4e0000-0000-4000-8000-0000000000c0',
       'cf4e0000-0000-4000-8000-000000000028', 'pendiente');
    UPDATE public.taller_inscripciones SET estado = 'no_aprobado', motivo_no_aprobado = 'Prueba' WHERE id = 'cf4e0000-0000-4000-8000-000000000053'$$);
SELECT pg_temp.assert_rows('9: «No aprobada» is today''s exact text and subject',
  $$SELECT 1 FROM public.avisos_persona a JOIN public.taller_avisos_envios e ON e.clave = a.clave
     WHERE a.persona_id = 'cf4e0000-0000-4000-8000-000000000028' AND a.tipo = 'inscripcion_rechazada'
       AND a.cuerpo = 'No pudimos aprobar tu inscripción en ZZ 4E Uno. Si tienes dudas, habla con la coordinación del taller.'
       AND e.asunto = 'Tu inscripción en ZZ 4E Uno no fue aprobada'$$, 1);

-- ── 10. «Restaurar» ─────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a5');
SELECT pg_temp.assert_error('10: a leader cannot restore',
  $$SELECT public.talleres_aviso_texto_restaurar('cf4e0000-0000-4000-8000-000000000010', 'recordatorio_clase', NULL)$$,
  '42501', 'sin_permisos_para_este_taller');
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.capture('10: the coordinator restores the text of clase 1', 'rest_clase',
  $$SELECT to_jsonb(public.talleres_aviso_texto_restaurar('cf4e0000-0000-4000-8000-000000000010', 'recordatorio_clase',
      'cf4e0000-0000-4000-8000-0000000000b1'))$$, 'true');
SELECT pg_temp.capture('10: and the general text', 'rest_general',
  $$SELECT to_jsonb(public.talleres_aviso_texto_restaurar('cf4e0000-0000-4000-8000-000000000010', 'recordatorio_clase', NULL))$$, 'true');
SELECT pg_temp.capture('10: restoring again deletes nothing', 'rest_otra',
  $$SELECT to_jsonb(public.talleres_aviso_texto_restaurar('cf4e0000-0000-4000-8000-000000000010', 'recordatorio_clase', NULL))$$, 'false');
RESET ROLE;
SELECT pg_temp.run('10: P4 approved in G0, queue tomorrow''s reminders again',
  $$INSERT INTO public.taller_inscripciones (id, taller_id, cohorte_id, persona_principal_id, estado, grupo_id) VALUES
      ('cf4e0000-0000-4000-8000-000000000054', 'cf4e0000-0000-4000-8000-000000000090', 'cf4e0000-0000-4000-8000-0000000000c0',
       'cf4e0000-0000-4000-8000-000000000029', 'aprobado', 'cf4e0000-0000-4000-8000-000000000040');
    SELECT public.talleres_avisos_recordatorios_encolar(now())$$);
SELECT pg_temp.assert_rows('10: after restoring, both reminders are today''s exact text again',
  $$SELECT 1 FROM public.avisos_persona a JOIN public.taller_avisos_envios e ON e.clave = a.clave
     WHERE a.persona_id = 'cf4e0000-0000-4000-8000-000000000029' AND a.tipo = 'recordatorio_clase'
       AND a.cuerpo IN ('Clase 1: Sígueme de ZZ 4E Uno · ' || public.talleres_aviso_fecha(pg_temp.h() + 1) || ' · 7:00 p. m. · Salón 2.',
                        'Clase 2: Intimidad con Dios de ZZ 4E Uno · ' || public.talleres_aviso_fecha(pg_temp.h() + 1) || ' · 7:00 p. m. · Salón 2.')
       AND e.asunto = 'Mañana es tu clase de ZZ 4E Uno'$$, 2);

-- ── 11. extra probes (S10): anon, cross-taller clase, other node, caps ──
INSERT INTO public.taller_plantilla_clases (id, taller_id, numero, tema, activo)
VALUES ('cf4e0000-0000-4000-8000-0000000000b9', 'cf4e0000-0000-4000-8000-000000000011', 1, 'Otra', true);
SELECT pg_temp.check('11: anon cannot run render, variables or puede',
  $chk$NOT has_function_privilege('anon','public.talleres_aviso_texto_render(text, jsonb)','EXECUTE')
   AND NOT has_function_privilege('anon','public.talleres_aviso_variables()','EXECUTE')
   AND NOT has_function_privilege('anon','public.talleres_aviso_textos_puede(uuid, boolean)','EXECUTE')$chk$);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a1');
SELECT pg_temp.assert_error('11: a real clase of another taller is rejected',
  $$SELECT pg_temp.guardar('recordatorio_clase','cf4e0000-0000-4000-8000-0000000000b9','Mañana','Hola')$$,
  '22023','CLASE_INVALIDA');
SELECT pg_temp.run('11: coordinator saves a long certificado text',
  $$SELECT pg_temp.guardar('certificado_listo', NULL, 'Listo {taller}', repeat('{edicion} ', 100))$$);
SELECT pg_temp.as_persona('cf4e0000-0000-4000-8000-0000000000a4');
SELECT pg_temp.assert_error('11: another node cannot restore it',
  $$SELECT public.talleres_aviso_texto_restaurar('cf4e0000-0000-4000-8000-000000000010','certificado_listo',NULL)$$,
  '42501','sin_permisos_para_este_taller');
RESET ROLE;
SELECT pg_temp.assert_rows('11: still stored', $$SELECT 1 FROM public.taller_aviso_textos
  WHERE taller_id='cf4e0000-0000-4000-8000-000000000010' AND tipo='certificado_listo'$$, 1);
SELECT pg_temp.run('11: emit with a long render',
  $$SELECT public.talleres_aviso_emitir('certificado_listo','zz4e:trunc','cf4e0000-0000-4000-8000-000000000026',
     'cf4e0000-0000-4000-8000-000000000010','cf4e0000-0000-4000-8000-000000000090','T','def','/x','asunto def',
     jsonb_build_object('variables', jsonb_build_object('edicion', repeat('x',50))))$$);
SELECT pg_temp.assert_rows('11: rendered message capped at 1000 with …, subject rendered',
  $$SELECT 1 FROM public.avisos_persona a JOIN public.taller_avisos_envios e ON e.clave=a.clave
     WHERE a.clave='zz4e:trunc' AND length(a.cuerpo)=1000 AND right(a.cuerpo,1)='…'
       AND e.asunto='Listo ZZ 4E Uno'$$, 1);

SELECT pg_temp.report();

ROLLBACK;
