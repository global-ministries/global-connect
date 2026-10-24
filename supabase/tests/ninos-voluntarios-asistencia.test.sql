-- V1 (odd/tasks/ninos-asistencia-voluntarios.md) — volunteer attendance
-- (20261010130000_ninos_voluntarios_asistencia.sql).
--
-- Covers:
--   a. Flag ninos_puede_marcar_voluntarios_algun_area: the sub-area
--      coordinator, the Atención al Voluntario coordinator and the configurer
--      yes; the anfitrión and a random user no.
--   b. ninos_voluntarios_turnos: the services of campus 1 for whoever marks
--      there; none for a random user.
--   c. Roster scope: anfitrión and random user get 'sin_autoridad'; the
--      sub-area coordinator sees only their team; Atención al Voluntario the
--      whole area; the configurer every area of the campus.
--   d. Roster: weekly expected every Sunday; biweekly A/B only on its weeks;
--      assigned to 11:00 not expected at 9:00; fecha_inicio after the date not
--      expected; inactive servicio, another campus and another principal
--      campus absent; a volunteer with no turno flagged sin_turno.
--   e. Roster dates: NULL or wrong weekday 'fecha_invalida', unknown turno
--      'turno_invalido'; editable only inside the marking window.
--   f. Marking by the team coordinator: stored with marcado_por, idempotent,
--      changed, extras stored with esperado false, cleared (row deleted); a
--      sibling team is refused, also inside a batch.
--   g. Marking by other roles and rejections: Atención al Voluntario,
--      solo_sin_marcar keeps existing marks; inactive / other campus
--      servicios, bad estado, more than 300 ids, future, more than 14 days
--      back and wrong weekday rejected; anfitrión and random user refused.
--   h. Privileges: anon executes none of the new functions; authenticated
--      cannot execute the internal helpers nor read the table.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none). Sections only read the
-- fixtures and their own marks, so each one can also run alone after the
-- fixtures (large payloads may fail on the staging MCP).
--
-- Identities (usuario n = auth n): 1 COORD_SUB (Coordinador of team A),
-- 2 AV (Coordinador of Atención al Voluntario under W), 3 CONFIG
-- (dream_team.direct on R), 4 ANFITRION, 5 RANDOM. Volunteers 10..20 have no
-- account.
-- Tree: R → W ("ZZ Nv Waumba") → A ("ZZ Nv Maternal"), B ("ZZ Nv Produccion"),
-- AV ("Atención al Voluntario"), H ("Anfitriones"); R → X ("ZZ Nv Upstreet")
-- → XA; Y (campus 2 area). Rooms: W and X in campus 1, Y in campus 2.
-- Turnos: T9 and T11 (campus 1), T9B (campus 2), all Sunday.
-- Roster Sundays S0 2099-01-04, S1 2099-01-11, S2 2099-01-18; marking uses
-- the last Sunday up to ninos_hoy() ('dom').

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_nv_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_nv_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_nv_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9810000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9811' WHEN 'us' THEN '9812' WHEN 'ca' THEN '9813'
                       WHEN 'eq' THEN '9814' WHEN 'ro' THEN '9815' WHEN 'sa' THEN '9816'
                       WHEN 'tu' THEN '9817' WHEN 'se' THEN '9818' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_nv_ctx WHERE k = p_k;
$$;

-- plpgsql helpers: their bodies are not resolved until called, so the RED
-- run (functions missing) still reaches the final SELECT.

-- The roster rows of the synthetic volunteers (apellido V…) as
-- 'apellido:esperado:sin_turno:estado', sorted.
CREATE OR REPLACE FUNCTION pg_temp.plan(p_turno int, p_fecha date) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT string_agg((v ->> 'apellido') || ':' || (v ->> 'esperado') || ':' || (v ->> 'sin_turno') || ':'
                            || coalesce(v ->> 'estado', '-'), ',' ORDER BY v ->> 'apellido')
            FROM jsonb_array_elements(public.ninos_voluntarios_planilla(pg_temp.id('tu', p_turno), p_fecha) -> 'voluntarios') v
           WHERE v ->> 'apellido' LIKE 'V%');
END;
$$;

-- Every apellido in the caller's roster of T9 on S0, sorted.
CREATE OR REPLACE FUNCTION pg_temp.quienes() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT string_agg(v ->> 'apellido', ',' ORDER BY v ->> 'apellido')
            FROM jsonb_array_elements(public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), DATE '2099-01-04') -> 'voluntarios') v);
END;
$$;

-- Marks the servicios of persons p_ns on turno p_turno at p_fecha; returns 'cambiados'.
CREATE OR REPLACE FUNCTION pg_temp.marcar(p_turno int, p_fecha date, p_ns int[], p_estado text, p_solo boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.ninos_voluntarios_marcar(pg_temp.id('tu', p_turno), p_fecha,
           (SELECT array_agg(pg_temp.id('se', n)) FROM unnest(p_ns) AS n), p_estado, p_solo) ->> 'cambiados';
END;
$$;

-- 'estado:esperado:marcado_por n' of person p_n's mark on T9 at 'dom' (read as postgres).
CREATE OR REPLACE FUNCTION pg_temp.marca(p_n int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT a.estado || ':' || a.esperado || ':' ||
                 coalesce((SELECT k::text FROM generate_series(1, 5) k WHERE pg_temp.id('us', k) = a.marcado_por), '?')
            FROM public.dream_team_asistencias a
           WHERE a.servicio_id = pg_temp.id('se', p_n) AND a.turno_id = pg_temp.id('tu', 1)
             AND a.fecha = pg_temp.ctx('dom')::date);
END;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_nv_ctx (k, v) VALUES ('dom', (public.ninos_hoy() - extract(dow FROM public.ninos_hoy())::int)::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'nv-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Nv', 'U' || n, 'nv-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 5) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Nv', 'V' || n, 'Soltero', 'Femenino' FROM generate_series(10, 20) AS n;

INSERT INTO public.campus (id, nombre, codigo)
SELECT pg_temp.id('ca', n), 'ZZ Nv Campus ' || n, 'ZZNV' || n FROM generate_series(1, 2) AS n;
-- Volunteers 19 and 20 have campus 2 as principal campus; 10..18 campus 1.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n IN (19, 20) THEN 2 ELSE 1 END), true
  FROM generate_series(10, 20) AS n;

-- (n, campus, nombre, hora, orden): T9 and T11 in campus 1, T9B in campus 2.
INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden)
SELECT pg_temp.id('tu', n), pg_temp.id('ca', c), nombre, 0, hora::time, orden
  FROM (VALUES (1, 1, 'Domingo 9:00', '09:00', 1), (2, 1, 'Domingo 11:00', '11:00', 2),
               (3, 2, 'Domingo 9:00', '09:00', 1)) AS v(n, c, nombre, hora, orden);

-- (n, parent, label): 1 R, 2 W, 3 A, 4 B, 5 AV, 6 H, 7 X, 8 XA, 9 Y.
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), 'ninos', CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'ZZ Nv Ninos'), (2, 1, 'ZZ Nv Waumba'), (3, 2, 'ZZ Nv Maternal'), (4, 2, 'ZZ Nv Produccion'),
               (5, 2, 'Atención al Voluntario'), (6, 2, 'Anfitriones'), (7, 1, 'ZZ Nv Upstreet'),
               (8, 7, 'ZZ Nv Lideres X'), (9, 0, 'ZZ Nv Otra')) AS v(n, p, label);

-- (n, equipo, label): Voluntario of A, B, H, XA and Y; Coordinador of A and AV.
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo)
SELECT pg_temp.id('ro', n), pg_temp.id('eq', e), label, true
  FROM (VALUES (1, 3, 'Voluntario'), (2, 3, 'Coordinador'), (3, 4, 'Voluntario'), (4, 5, 'Coordinador'),
               (5, 6, 'Voluntario'), (6, 8, 'Voluntario'), (7, 9, 'Voluntario')) AS v(n, e, label);

-- (n, campus, area equipo, area, grade): rooms of W and X in campus 1, of Y in campus 2.
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden)
SELECT pg_temp.id('sa', n), pg_temp.id('ca', c), pg_temp.id('eq', e), area, 'ZZ Nv S' || n, 20, g, g, n
  FROM (VALUES (1, 1, 2, 'waumba', NULL::int), (2, 1, 7, 'upstreet', 1), (3, 2, 9, 'waumba', NULL)) AS v(n, c, e, area, g);

-- Servicio n belongs to person n: (n, equipo, rol). 15 is paused, 14 started on S1, the rest long ago.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r),
       (CASE WHEN n = 15 THEN 'en_pausa' ELSE 'activo' END)::public.dream_team_estado,
       CASE WHEN n = 14 THEN timestamptz '2099-01-11 12:00+00' ELSE timestamptz '2020-01-01 12:00+00' END, 'admin_asignacion'
  FROM (VALUES (1, 3, 2), (2, 5, 4), (4, 6, 5), (10, 3, 1), (11, 3, 1), (12, 3, 1), (13, 3, 1), (14, 3, 1),
               (15, 3, 1), (16, 3, 1), (17, 4, 3), (18, 8, 6), (19, 9, 7), (20, 3, 1)) AS v(n, e, r);

-- (servicio, turno, anchor): 10 weekly T9; 11 biweekly T9 from S0; 12 biweekly T9 from S1; 13 weekly
-- T11; 14 weekly T9 (started S1); 15 weekly T9 (paused); 17, 18 weekly T9; 19 weekly T9B (campus 2).
-- 16 and 20 have no turno.
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla)
SELECT pg_temp.id('se', s), pg_temp.id('tu', t), CASE WHEN a IS NULL THEN 'semanal' ELSE 'quincenal' END, a
  FROM (VALUES (10, 1, NULL::date), (11, 1, DATE '2099-01-04'), (12, 1, DATE '2099-01-11'), (13, 2, NULL),
               (14, 1, NULL), (15, 1, NULL), (17, 1, NULL), (18, 1, NULL), (19, 3, NULL)) AS v(s, t, a);

-- What the servicios would mint, by hand: coordinate on A (1) and on AV (2), direct on R (3).
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 5) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT pg_temp.id('us', n), k, 'dream_team', 'equipo', pg_temp.id('eq', e)::text
  FROM (VALUES (1, 'dream_team.coordinate', 3), (2, 'dream_team.coordinate', 5), (3, 'dream_team.direct', 1),
               (4, 'dream_team.serve', 6)) AS v(n, k, e);

GRANT INSERT, SELECT, UPDATE ON t_nv_failures, t_nv_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text), pg_temp.plan(int, date), pg_temp.quienes(),
  pg_temp.marcar(int, date, int[], text, boolean) TO authenticated, anon;

SET LOCAL ROLE authenticated;

-- ── a. flag ──────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: the sub-area coordinator may mark',
  $q$SELECT public.ninos_puede_marcar_voluntarios_algun_area()::text$q$, 'true');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('a: the Atención al Voluntario coordinator may mark',
  $q$SELECT public.ninos_puede_marcar_voluntarios_algun_area()::text$q$, 'true');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('a: the configurer may mark',
  $q$SELECT public.ninos_puede_marcar_voluntarios_algun_area()::text$q$, 'true');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('a: the anfitrión may not',
  $q$SELECT public.ninos_puede_marcar_voluntarios_algun_area()::text$q$, 'false');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('a: a random user may not',
  $q$SELECT public.ninos_puede_marcar_voluntarios_algun_area()::text$q$, 'false');

-- ── b. services ──────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b: the sub-area coordinator gets the services of campus 1',
  $q$SELECT string_agg(campus || ':' || nombre || ':' || dia_semana, ',' ORDER BY orden) FROM public.ninos_voluntarios_turnos()$q$,
  'ZZ Nv Campus 1:Domingo 9:00:0,ZZ Nv Campus 1:Domingo 11:00:0');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('b: a random user gets none',
  $q$SELECT count(*)::text FROM public.ninos_voluntarios_turnos()$q$, '0');

-- ── c. roster scope ──────────────────────────────────────────────────

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('c: the anfitrión gets sin_autoridad',
  $q$SELECT pg_temp.quienes()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('c: a random user gets sin_autoridad',
  $q$SELECT pg_temp.quienes()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: the sub-area coordinator sees only their team',
  $q$SELECT pg_temp.quienes()$q$, 'U1,V10,V11,V12,V13,V14,V16');
SELECT pg_temp.assert_eq('c: the sub-area coordinator gets one area',
  $q$SELECT string_agg(a ->> 'nombre', ',') FROM jsonb_array_elements(
       public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), DATE '2099-01-04') -> 'areas') a$q$, 'ZZ Nv Waumba');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c: Atención al Voluntario sees the whole area, not another one',
  $q$SELECT pg_temp.quienes()$q$, 'U1,U2,U4,V10,V11,V12,V13,V14,V16,V17');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('c: the configurer sees every area of the campus',
  $q$SELECT pg_temp.quienes()$q$, 'U1,U2,U4,V10,V11,V12,V13,V14,V16,V17,V18');
SELECT pg_temp.assert_eq('c: the configurer gets both areas',
  $q$SELECT string_agg(a ->> 'nombre', ',') FROM jsonb_array_elements(
       public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), DATE '2099-01-04') -> 'areas') a$q$, 'ZZ Nv Upstreet,ZZ Nv Waumba');
SELECT pg_temp.assert_eq('c: a row carries area, equipo, rol and names',
  $q$SELECT (v ->> 'nombre') || '|' || (v ->> 'area') || '|' || (v ->> 'equipo') || '|' || (v ->> 'rol') || '|'
            || ((v ->> 'equipo_id')::uuid = pg_temp.id('eq', 8)) || '|' || ((v ->> 'area_id')::uuid = pg_temp.id('eq', 7))
       FROM jsonb_array_elements(public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), DATE '2099-01-04') -> 'voluntarios') v
      WHERE v ->> 'apellido' = 'V18'$q$, 'ZZ Nv|ZZ Nv Upstreet|ZZ Nv Lideres X|Voluntario|true|true');

-- ── d. roster semantics (configurer) ─────────────────────────────────

SELECT pg_temp.assert_eq('d: S0 at 9:00 (weekly, biweekly A, not B, not 11:00, not started, sin turno)',
  $q$SELECT pg_temp.plan(1, DATE '2099-01-04')$q$,
  'V10:true:false:-,V11:true:false:-,V12:false:false:-,V13:false:false:-,V14:false:false:-,V16:false:true:-,V17:true:false:-,V18:true:false:-');
SELECT pg_temp.assert_eq('d: S1 at 9:00 (biweekly B, started that day)',
  $q$SELECT pg_temp.plan(1, DATE '2099-01-11')$q$,
  'V10:true:false:-,V11:false:false:-,V12:true:false:-,V13:false:false:-,V14:true:false:-,V16:false:true:-,V17:true:false:-,V18:true:false:-');
SELECT pg_temp.assert_eq('d: S2 at 9:00 (biweekly A again)',
  $q$SELECT pg_temp.plan(1, DATE '2099-01-18')$q$,
  'V10:true:false:-,V11:true:false:-,V12:false:false:-,V13:false:false:-,V14:true:false:-,V16:false:true:-,V17:true:false:-,V18:true:false:-');
SELECT pg_temp.assert_eq('d: S0 at 11:00 (only the 11:00 volunteer)',
  $q$SELECT pg_temp.plan(2, DATE '2099-01-04')$q$,
  'V10:false:false:-,V11:false:false:-,V12:false:false:-,V13:true:false:-,V14:false:false:-,V16:false:true:-,V17:false:false:-,V18:false:false:-');

-- ── e. roster dates ──────────────────────────────────────────────────

SELECT pg_temp.assert_raises('e: a date that is not the turno weekday is fecha_invalida',
  $q$SELECT public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), DATE '2099-01-05')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('e: a NULL date is fecha_invalida',
  $q$SELECT public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), NULL)$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('e: an unknown turno is turno_invalido',
  $q$SELECT public.ninos_voluntarios_planilla(pg_temp.id('au', 1), DATE '2099-01-04')$q$, '22023', 'turno_invalido');
SELECT pg_temp.assert_eq('e: a future Sunday is read-only',
  $q$SELECT public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), DATE '2099-01-04') ->> 'editable'$q$, 'false');
SELECT pg_temp.assert_eq('e: the last Sunday is editable',
  $q$SELECT public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), pg_temp.ctx('dom')::date) ->> 'editable'$q$, 'true');

-- ── f. marking: the team coordinator ─────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('f: the sub-area coordinator marks their volunteer',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[10], 'presente')$q$, '1');
RESET ROLE;
SELECT pg_temp.assert_eq('f: the mark is stored as expected, by the coordinator',
  $q$SELECT pg_temp.marca(10)$q$, 'presente:true:1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('f: marking the same again changes nothing',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[10], 'presente')$q$, '0');
SELECT pg_temp.assert_eq('f: an extra (assigned to 11:00) and a volunteer without turno can be marked',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[13, 16], 'justificado')$q$, '2');
SELECT pg_temp.assert_raises('f: a sibling team volunteer is sin_autoridad',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[17], 'presente')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('f: a batch with one sibling volunteer is refused whole',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[10, 17], 'ausente')$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('f: one row, still presente; extras stored with esperado false',
  $q$SELECT (SELECT count(*) FROM public.dream_team_asistencias WHERE servicio_id = pg_temp.id('se', 10))::text
            || '|' || pg_temp.marca(10) || '|' || pg_temp.marca(13) || '|' || pg_temp.marca(16)$q$,
  '1|presente:true:1|justificado:false:1|justificado:false:1');
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('f: changing the estado updates the mark',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[10], 'ausente')$q$, '1');
SELECT pg_temp.assert_eq('f: clearing deletes the mark',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[10], NULL)$q$, '1');
RESET ROLE;
SELECT pg_temp.assert_eq('f: the cleared mark has no row',
  $q$SELECT count(*)::text FROM public.dream_team_asistencias WHERE servicio_id = pg_temp.id('se', 10)$q$, '0');
SET LOCAL ROLE authenticated;

-- ── g. marking: other roles and rejections ───────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('g: Atención al Voluntario marks a sibling team',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[17], 'presente')$q$, '1');
SELECT pg_temp.assert_raises('g: Atención al Voluntario cannot mark another area',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[18], 'presente')$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('g: solo_sin_marcar marks only the unmarked ones',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[17, 18], 'ausente', true)$q$, '1');
SELECT pg_temp.assert_eq('g: the roster shows the marks',
  $q$SELECT string_agg((v ->> 'apellido') || ':' || coalesce(v ->> 'estado', '-'), ',' ORDER BY v ->> 'apellido')
       FROM jsonb_array_elements(public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), pg_temp.ctx('dom')::date) -> 'voluntarios') v
      WHERE v ->> 'apellido' IN ('V11', 'V17', 'V18')$q$,
  'V11:-,V17:presente,V18:ausente');
SELECT pg_temp.assert_raises('g: an inactive servicio is servicio_invalido',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[15], 'presente')$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('g: a servicio of another campus is servicio_invalido',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[19], 'presente')$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('g: a volunteer whose principal campus is another one is servicio_invalido',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[20], 'presente')$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('g: a bad estado is estado_invalido',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[10], 'tarde')$q$, '22023', 'estado_invalido');
SELECT pg_temp.assert_raises('g: more than 300 ids is demasiados_servicios',
  $q$SELECT public.ninos_voluntarios_marcar(pg_temp.id('tu', 1), pg_temp.ctx('dom')::date,
       (SELECT array_agg(gen_random_uuid()) FROM generate_series(1, 301)), 'presente')$q$, '22023', 'demasiados_servicios');
SELECT pg_temp.assert_raises('g: a future Sunday is fecha_invalida',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date + 7, ARRAY[10], 'presente')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('g: more than 14 days back is fecha_invalida',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date - 21, ARRAY[10], 'presente')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('g: a day that is not the turno weekday is fecha_invalida',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date - 1, ARRAY[10], 'presente')$q$, '22023', 'fecha_invalida');

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('g: the anfitrión cannot mark',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[10], 'presente')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('g: a random user cannot mark',
  $q$SELECT pg_temp.marcar(1, pg_temp.ctx('dom')::date, ARRAY[10], 'presente')$q$, '42501', 'sin_autoridad');

-- ── h. privileges ────────────────────────────────────────────────────

SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('h: authenticated cannot read the table',
  $q$SELECT count(*) FROM public.dream_team_asistencias$q$, '42501');
SELECT pg_temp.assert_raises('h: authenticated cannot execute ninos_puede_marcar_voluntarios',
  $q$SELECT public.ninos_puede_marcar_voluntarios(pg_temp.id('eq', 3))$q$, '42501');
SELECT pg_temp.assert_raises('h: authenticated cannot execute ninos_voluntarios_equipos',
  $q$SELECT count(*) FROM public.ninos_voluntarios_equipos(NULL)$q$, '42501');
SELECT pg_temp.assert_raises('h: authenticated cannot execute ninos_voluntarios_marcables',
  $q$SELECT count(*) FROM public.ninos_voluntarios_marcables(NULL)$q$, '42501');
SELECT pg_temp.assert_raises('h: authenticated cannot execute ninos_voluntarios_del_turno',
  $q$SELECT count(*) FROM public.ninos_voluntarios_del_turno(pg_temp.id('tu', 1), DATE '2099-01-04')$q$, '42501');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_puede_marcar_voluntarios_algun_area',
  $q$SELECT public.ninos_puede_marcar_voluntarios_algun_area()$q$, '42501');
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_voluntarios_turnos',
  $q$SELECT count(*) FROM public.ninos_voluntarios_turnos()$q$, '42501');
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_voluntarios_planilla',
  $q$SELECT public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), DATE '2099-01-04')$q$, '42501');
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_voluntarios_marcar',
  $q$SELECT public.ninos_voluntarios_marcar(pg_temp.id('tu', 1), DATE '2099-01-04', ARRAY[pg_temp.id('se', 10)], 'presente')$q$, '42501');
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_puede_marcar_voluntarios',
  $q$SELECT public.ninos_puede_marcar_voluntarios(pg_temp.id('eq', 3))$q$, '42501');
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_voluntarios_equipos',
  $q$SELECT count(*) FROM public.ninos_voluntarios_equipos(NULL)$q$, '42501');
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_voluntarios_marcables',
  $q$SELECT count(*) FROM public.ninos_voluntarios_marcables(NULL)$q$, '42501');
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_voluntarios_del_turno',
  $q$SELECT count(*) FROM public.ninos_voluntarios_del_turno(pg_temp.id('tu', 1), DATE '2099-01-04')$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_nv_failures;

ROLLBACK;
