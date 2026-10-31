-- Estudiantes C3 sessions and history (20261031100000_estudiantes_sesiones.sql).
--
-- Covers:
--   s. estudiantes_grupo_sesiones: a Transit group lists the dates of the
--      turnos that serve its ámbito (weekly and dated), not the other turnos
--      of the campus; an opened meeting carries its counts; The Living Room
--      lists its weekly day and any meeting opened on another day, with no
--      turno; p_dias bounds the window; another leader, another campus and
--      a person without role are refused; unknown group.
--   h. estudiantes_grupo_historial: the last n meetings with marks, oldest
--      first, and each member's mark at each (null when unmarked); n bounds
--      the count; refused like the sessions.
--   l. Privileges: authenticated executes both, anon neither.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases).
--
-- Identities (usuario n = auth n): 1 LIDER (Transit › Chicas, leads G1),
-- 2 LIDER_TLR (TLR › Chicas, leads G5), 3 NADIE (campus 1, no role),
-- 4 LIDER_B (Transit › Chicas, leads G2), 5 DIR_OTRO (dream_team.direct on
-- Transit, campus 2). People without account: 20 Ana and 21 Bea (G1),
-- 26 Tomás (G5).
-- Turnos of campus 1: 1 Domingo 9 and 4 a dated turno on dom − 3, both
-- listed by Transit; 2 Domingo 11 and 3 Sábado, not listed (so not served).
-- dom = last Sunday (today when today is Sunday).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_es_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_es_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_es_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(v_actual, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate OR (p_message IS NOT NULL AND SQLERRM <> p_message) THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.exec(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('e5a30000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'a001' WHEN 'us' THEN 'a002' WHEN 'ca' THEN 'a003'
                       WHEN 'eq' THEN 'a004' WHEN 'ro' THEN 'a005' WHEN 'se' THEN 'a006'
                       WHEN 'tu' THEN 'a007' WHEN 'gr' THEN 'a008' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.dom(p_dias int DEFAULT 0) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (SELECT v FROM t_es_ctx WHERE k = 'dom')::date - p_dias;
$$;

-- Sessions of group p_g between dom − p_desde and dom: 'offset:turno,…' (offset in days before dom, '-' without turno).
CREATE OR REPLACE FUNCTION pg_temp.sesiones(p_g int, p_desde int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg((pg_temp.dom() - s.fecha) || ':' || coalesce(s.turno, '-'), ',' ORDER BY n), '')
            FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', p_g)) WITH ORDINALITY AS s(fecha, turno_id, turno, hora,
                   reunion_id, lugar, presentes, ausentes, visitantes, marcados, n)
           WHERE s.fecha BETWEEN pg_temp.dom(p_desde) AND pg_temp.dom());
END;
$$;

INSERT INTO t_es_ctx (k, v) VALUES
  ('dom', ((now() AT TIME ZONE 'America/Caracas')::date
           - extract(dow FROM (now() AT TIME ZONE 'America/Caracas')::date)::int)::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'es-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Es', 'U' || n, 'es-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero) VALUES
  (pg_temp.id('us', 20), 'Zzes Ana', 'Uno', 'No especificado', 'Femenino'),
  (pg_temp.id('us', 21), 'Zzes Bea', 'Uno', 'No especificado', 'Femenino'),
  (pg_temp.id('us', 26), 'Zzes Tomas', 'Cinco', 'No especificado', 'Masculino');

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Es Campus 1', 'ZZES1'),
  (pg_temp.id('ca', 2), 'ZZ Es Campus 2', 'ZZES2');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n = 5 THEN 2 ELSE 1 END), true
  FROM unnest(ARRAY[1, 2, 3, 4, 5, 20, 21, 26]) AS n
ON CONFLICT DO NOTHING;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Es Experiencia'), (2, 1, 'estudiantes', 'ZZ Es Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Es Transit'), (5, 2, 'the_living_room', 'ZZ Es TLR'),
               (6, 3, 'estudiantes', 'Grupos de Chicas'), (10, 5, 'the_living_room', 'Grupos de Chicas')) AS v(n, p, experiencia, label);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 6), 'lider', 'lider', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 10), 'lider', 'lider', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('se', 1), pg_temp.id('us', 1), pg_temp.id('eq', 6), pg_temp.id('ro', 1), 'activo', timestamptz '2020-01-01 12:00+00', 'admin_asignacion'),
  (pg_temp.id('se', 2), pg_temp.id('us', 2), pg_temp.id('eq', 10), pg_temp.id('ro', 2), 'activo', timestamptz '2020-01-01 12:00+00', 'admin_asignacion'),
  (pg_temp.id('se', 4), pg_temp.id('us', 4), pg_temp.id('eq', 6), pg_temp.id('ro', 1), 'activo', timestamptz '2020-01-01 12:00+00', 'admin_asignacion');
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 5), 'dream_team.direct', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Es Domingo 9', 0, '09:00', 1, true),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'ZZ Es Domingo 11', 0, '11:00', 2, true),
  (pg_temp.id('tu', 3), pg_temp.id('ca', 1), 'ZZ Es Sabado', 6, '17:00', 3, true);
SELECT pg_temp.exec('fixture: dated turno',
  $q$INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo, tipo)
     VALUES (pg_temp.id('tu', 4), pg_temp.id('ca', 1), 'ZZ Es Evento', 0, '18:00', 4, true, 'fechas')$q$);
SELECT pg_temp.exec('fixture: its date',
  $q$INSERT INTO public.dream_team_turno_fechas (turno_id, fecha, hora) VALUES (pg_temp.id('tu', 4), pg_temp.dom(3), '19:30')$q$);
INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES
  (pg_temp.id('eq', 3), pg_temp.id('tu', 1)), (pg_temp.id('eq', 3), pg_temp.id('tu', 4));

INSERT INTO public.estudiantes_escala (campus_id, numero, etiqueta, ambito_id)
SELECT pg_temp.id('ca', 1), n, n || 'º', pg_temp.id('eq', 3) FROM generate_series(1, 3) AS n;
INSERT INTO public.estudiantes_grupos (id, campus_id, subarea_id, nombre, anio, dia_semana) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Es G1', 1, NULL),
  (pg_temp.id('gr', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'ZZ Es G2', 2, NULL),
  (pg_temp.id('gr', 5), pg_temp.id('ca', 1), pg_temp.id('eq', 10), 'ZZ Es G5', NULL, 4);
INSERT INTO public.estudiantes_grupo_lideres (grupo_id, servicio_id) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('se', 1)), (pg_temp.id('gr', 2), pg_temp.id('se', 4)), (pg_temp.id('gr', 5), pg_temp.id('se', 2));
INSERT INTO public.estudiantes_grupo_miembros (grupo_id, persona_id, estado) VALUES
  (pg_temp.id('gr', 1), pg_temp.id('us', 20), 'miembro'),
  (pg_temp.id('gr', 1), pg_temp.id('us', 21), 'miembro'),
  (pg_temp.id('gr', 5), pg_temp.id('us', 26), 'miembro');

GRANT INSERT, SELECT ON t_es_failures, t_es_ctx TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.exec(text, text), pg_temp.id(text, int),
  pg_temp.as_persona(int), pg_temp.dom(int), pg_temp.sesiones(int, int)
  TO authenticated;

SET LOCAL ROLE authenticated;

-- ── s. sessions ──────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('s: Transit lists the weekly and dated turnos that serve the ámbito, newest first',
  $q$SELECT pg_temp.sesiones(1, 7)$q$, '0:ZZ Es Domingo 9,3:ZZ Es Evento,7:ZZ Es Domingo 9');
SELECT pg_temp.assert_eq('s: turnos the ámbito does not list never appear',
  $q$SELECT count(*)::text FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', 1)) s
      WHERE s.turno IN ('ZZ Es Domingo 11', 'ZZ Es Sabado')$q$, '0');
SELECT pg_temp.assert_eq('s: the dated turno takes the hour of its date',
  $q$SELECT s.hora::text FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', 1)) s WHERE s.turno = 'ZZ Es Evento'$q$, '19:30:00');
SELECT pg_temp.assert_eq('s: no meeting before the first mark',
  $q$SELECT coalesce(s.reunion_id::text, 'null') || '|' || s.marcados FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', 1)) s
      WHERE s.fecha = pg_temp.dom() AND s.turno_id = pg_temp.id('tu', 1)$q$, 'null|0');
SELECT pg_temp.exec('fixture: Ana presente and Bea ausente on dom',
  $q$SELECT public.estudiantes_marcar(pg_temp.id('gr', 1), pg_temp.dom(), pg_temp.id('tu', 1), pg_temp.id('us', 20), 'presente'),
            public.estudiantes_marcar(pg_temp.id('gr', 1), pg_temp.dom(), pg_temp.id('tu', 1), pg_temp.id('us', 21), 'ausente')$q$);
SELECT pg_temp.assert_eq('s: an opened meeting carries its counts',
  $q$SELECT (s.reunion_id IS NOT NULL) || '|' || s.presentes || '/' || s.ausentes || '/' || s.visitantes || '/' || s.marcados
       FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', 1)) s
      WHERE s.fecha = pg_temp.dom() AND s.turno_id = pg_temp.id('tu', 1)$q$, 'true|1/1/0/2');
SELECT pg_temp.assert_eq('s: p_dias bounds the window to today',
  $q$SELECT count(*)::text FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', 1), 1) s
      WHERE s.fecha < (now() AT TIME ZONE 'America/Caracas')::date$q$, '0');
SELECT pg_temp.assert_raises('s: another leader''s group is refused',
  $q$SELECT count(*) FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', 2))$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('s: The Living Room lists its weekly day without turno',
  $q$SELECT pg_temp.sesiones(5, 10)$q$, '3:-,10:-');
SELECT pg_temp.exec('fixture: a Living Room meeting on another day',
  $q$SELECT public.estudiantes_reunion_guardar(pg_temp.id('gr', 5), pg_temp.dom(1), NULL, 'Casa de Tomás')$q$);
SELECT pg_temp.assert_eq('s: and any meeting opened on another day, with its lugar',
  $q$SELECT pg_temp.sesiones(5, 10) || '|' || (SELECT s.lugar FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', 5)) s
                                                WHERE s.fecha = pg_temp.dom(1))$q$, '1:-,3:-,10:-|Casa de Tomás');

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('s: a person without role is refused',
  $q$SELECT count(*) FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', 1))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('s: a director of another campus is refused',
  $q$SELECT count(*) FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', 1))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('s: an unknown group',
  $q$SELECT count(*) FROM public.estudiantes_grupo_sesiones(pg_temp.id('gr', 99))$q$, '22023', 'grupo_invalido');

-- ── h. history ───────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.exec('fixture: Ana presente on dom − 7',
  $q$SELECT public.estudiantes_marcar(pg_temp.id('gr', 1), pg_temp.dom(7), pg_temp.id('tu', 1), pg_temp.id('us', 20), 'presente')$q$);
SELECT pg_temp.exec('fixture: an opened meeting without marks on dom − 3',
  $q$SELECT public.estudiantes_reunion_guardar(pg_temp.id('gr', 1), pg_temp.dom(3), pg_temp.id('tu', 4))$q$);
SELECT pg_temp.assert_eq('h: the meetings with marks, oldest first',
  $q$SELECT string_agg((pg_temp.dom() - (r ->> 'fecha')::date)::text, ',')
       FROM jsonb_array_elements(public.estudiantes_grupo_historial(pg_temp.id('gr', 1)) -> 'reuniones') r$q$, '7,0');
SELECT pg_temp.assert_eq('h: each member''s mark at each meeting, null when unmarked',
  $q$SELECT string_agg(CASE (p ->> 'persona_id')::uuid WHEN pg_temp.id('us', 20) THEN 'Ana' ELSE 'Bea' END || ':' || (p -> 'estados')::text, ' '
                       ORDER BY CASE (p ->> 'persona_id')::uuid WHEN pg_temp.id('us', 20) THEN 1 ELSE 2 END)
       FROM jsonb_array_elements(public.estudiantes_grupo_historial(pg_temp.id('gr', 1)) -> 'personas') p$q$,
  'Ana:["presente", "presente"] Bea:[null, "ausente"]');
SELECT pg_temp.assert_eq('h: n bounds the meetings',
  $q$SELECT jsonb_array_length(public.estudiantes_grupo_historial(pg_temp.id('gr', 1), 1) -> 'reuniones')::text
       || '|' || (SELECT pg_temp.dom() - (r ->> 'fecha')::date
                    FROM jsonb_array_elements(public.estudiantes_grupo_historial(pg_temp.id('gr', 1), 1) -> 'reuniones') r)$q$, '1|0');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('h: a group without marks has empty meetings and members without marks',
  $q$SELECT (public.estudiantes_grupo_historial(pg_temp.id('gr', 5)) -> 'reuniones')::text
       || '|' || jsonb_array_length(public.estudiantes_grupo_historial(pg_temp.id('gr', 5)) -> 'personas')$q$, '[]|1');
SELECT pg_temp.assert_raises('h: another leader''s group is refused',
  $q$SELECT public.estudiantes_grupo_historial(pg_temp.id('gr', 1))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('h: a director of another campus is refused',
  $q$SELECT public.estudiantes_grupo_historial(pg_temp.id('gr', 1))$q$, '42501', 'sin_autoridad');

RESET ROLE;

-- ── l. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: authenticated executes both, anon neither',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('anon', p.oid, 'EXECUTE'), ',' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('estudiantes_grupo_sesiones', 'estudiantes_grupo_historial')$q$,
  'estudiantes_grupo_historial:true:false,estudiantes_grupo_sesiones:true:false');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_es_failures);
END;
$$;
