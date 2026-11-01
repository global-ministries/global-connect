-- Estudiantes C5 volunteer attendance (20261101130000_estudiantes_voluntarios_asistencia.sql).
--
-- Covers:
--   a. estudiantes_puede_marcar_voluntarios: a sub-área coordinator, the
--      Atención al Voluntario coordinator of Transit, the Estudiantes
--      director, a director of another campus, the TLR coordinator, a pastor
--      and the system admin yes; a plain volunteer and the Niños director no.
--   b. estudiantes_voluntarios_turnos: only the turnos an ámbito of the caller
--      takes part in (Transit: Domingo 9:00; The Living Room: its dated turno
--      with the planned dates up to today, newest first); none for another
--      campus or without authority.
--   c. Roster scope: the sub-área coordinator sees only their team, Atención
--      al Voluntario the Transit subtree, the director / pastor / admin the
--      same; another principal campus is absent; The Living Room is not on
--      the Transit Sunday; on the dated turno only the chosen volunteer of
--      the date is expected; another campus and no authority are refused.
--   d. Dates: a weekly turno only on its weekday; a dated turno only on a
--      planned date (a non-calendar date is refused, also NULL); editable
--      only today or up to 14 days back; unknown turno refused.
--   e. Marking: stored with marcado_por, idempotent; out-of-scope servicios
--      refused (also inside a batch, leaving the mark as it was); not in the
--      roster, bad estado, future, more than 14 days back and non-calendar
--      dates refused; solo_sin_marcar keeps existing marks; clearing deletes
--      the row; an extra is stored with esperado false; another campus and
--      the TLR coordinator on Transit refused; a pastor marks.
--   f. Frozen roster: a past planned date keeps who was expected after the
--      date's volunteers change; a date before the freeze start stays live.
--   g. Report: per volunteer on the dated turno (expected, extra, Avisó) and
--      on the Sunday; only the caller's equipos; range and authority errors.
--   h. Niños unchanged: its roster, marking, report and services ignore the
--      Estudiantes volunteers and marks on the same turno and date, still
--      refuse the dated turno, and the scopes do not cross.
--   i. Privileges: authenticated executes the five public functions, anon
--      none; the helpers and the roster tables are closed.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back. Needs ninos_hoy() >= 2026-10-28 (the planned date
-- D1 = today - 3 must not be before the freeze start, 2026-10-25).
--
-- Identities (usuario n = auth n): 1 COORD_LOG (coordinate on Transit ›
-- Logística), 2 AV (Coordinador of Transit › Atención al Voluntario), 3
-- DIR_EST (direct on Dirección de Estudiantes, campus 1), 4 DIR_EST_2 (same
-- grant, campus 2), 5 PASTOR (campus 1), 6 ADMIN (no campus), 7 NADIE (serve
-- on Logística), 8 COORD_TLR (coordinate on The Living Room), 9 DIR_NINOS
-- (direct on the Niños root). All in campus 1 but 4 (campus 2) and 6.
-- Volunteers without account: 20 V20 Logística weekly T1; 21 V21 Logística
-- no turno; 22 V22 Grupos de Chicas weekly T1, starts 2099; 23 V23
-- Logística, principal campus 2; 30 V30 TLR Grupos de Chicos on T3, chosen
-- for D1; 31 V31 TLR Producción on T3; 32 V32 TLR Producción no turno; 40
-- V40 Niños Maternal weekly T1.
-- Tree: 1 Experiencia › 2 Estudiantes › 3 Transit (5 Grupos de Chicas, 6
-- Logística, 7 Atención al Voluntario) | 4 Living Room (8 Grupos de Chicos,
-- 9 Producción); 10 Niños › 11 Waumba (room in campus 1) › 12 Maternal.
-- Turnos: T1 Domingo 9:00 and T2 Domingo 11:00 (campus 1, weekly; Transit
-- lists T1), T3 ZZ Ev TLR (campus 1, dated; The Living Room lists it; D1 =
-- today - 3, D2 = today + 7, D3 = 2026-10-11: outside the marking window
-- and before the freeze start), T4 Domingo 9:00 (campus 2).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ev_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ev_ctx (k text PRIMARY KEY, v date) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ev_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('e5a60000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'a001' WHEN 'us' THEN 'a002' WHEN 'ca' THEN 'a003'
                       WHEN 'eq' THEN 'a004' WHEN 'ro' THEN 'a005' WHEN 'se' THEN 'a006'
                       WHEN 'tu' THEN 'a007' WHEN 'sa' THEN 'a008' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- assert_eq as persona p_n (one call per row keeps the order).
CREATE OR REPLACE FUNCTION pg_temp.como(p_n int, p_case text, p_sql text, p_expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_persona(p_n);
  PERFORM pg_temp.assert_eq(p_case, p_sql, p_expected);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.d(p_k text) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT v FROM t_ev_ctx WHERE k = p_k;
$$;

-- plpgsql helpers: their bodies are not resolved until called, so the RED
-- run (functions missing) still reaches the final DO block.

-- The Estudiantes roster rows of the synthetic volunteers (apellido V…) as
-- 'apellido:esperado:sin_turno:estado', sorted; '' when none.
CREATE OR REPLACE FUNCTION pg_temp.plan(p_turno int, p_fecha date) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg((v ->> 'apellido') || ':' || (v ->> 'esperado') || ':' || (v ->> 'sin_turno') || ':'
                                     || coalesce(v ->> 'estado', '-'), ',' ORDER BY v ->> 'apellido'), '')
            FROM jsonb_array_elements(public.estudiantes_voluntarios_planilla(pg_temp.id('tu', p_turno), p_fecha) -> 'voluntarios') v
           WHERE v ->> 'apellido' LIKE 'V%');
END;
$$;

-- The ámbitos ('areas') of the Estudiantes roster, sorted.
CREATE OR REPLACE FUNCTION pg_temp.areas(p_turno int, p_fecha date) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(a ->> 'nombre', ',' ORDER BY a ->> 'nombre'), '')
            FROM jsonb_array_elements(public.estudiantes_voluntarios_planilla(pg_temp.id('tu', p_turno), p_fecha) -> 'areas') a);
END;
$$;

-- The same for the Niños roster.
CREATE OR REPLACE FUNCTION pg_temp.nplan(p_turno int, p_fecha date) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg((v ->> 'apellido') || ':' || (v ->> 'esperado') || ':' || (v ->> 'sin_turno') || ':'
                                     || coalesce(v ->> 'estado', '-'), ',' ORDER BY v ->> 'apellido'), '')
            FROM jsonb_array_elements(public.ninos_voluntarios_planilla(pg_temp.id('tu', p_turno), p_fecha) -> 'voluntarios') v
           WHERE v ->> 'apellido' LIKE 'V%');
END;
$$;

-- Marks the servicios of persons p_ns; returns 'cambiados'.
CREATE OR REPLACE FUNCTION pg_temp.marcar(p_turno int, p_fecha date, p_ns int[], p_estado text, p_solo boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.estudiantes_voluntarios_marcar(pg_temp.id('tu', p_turno), p_fecha,
           (SELECT array_agg(pg_temp.id('se', n)) FROM unnest(p_ns) AS n), p_estado, p_solo) ->> 'cambiados';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.nmarcar(p_turno int, p_fecha date, p_ns int[], p_estado text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.ninos_voluntarios_marcar(pg_temp.id('tu', p_turno), p_fecha,
           (SELECT array_agg(pg_temp.id('se', n)) FROM unnest(p_ns) AS n), p_estado) ->> 'cambiados';
END;
$$;

-- 'estado:esperado:marcado_por n' of person p_n's mark (read with definer rights); '-' when none.
CREATE OR REPLACE FUNCTION pg_temp.marca(p_n int, p_turno int, p_fecha date) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN coalesce((SELECT a.estado || ':' || a.esperado || ':' ||
                          coalesce((SELECT k::text FROM generate_series(1, 10) k WHERE pg_temp.id('us', k) = a.marcado_por), '?')
                     FROM public.dream_team_asistencias a
                    WHERE a.servicio_id = pg_temp.id('se', p_n) AND a.turno_id = pg_temp.id('tu', p_turno)
                      AND a.fecha = p_fecha), '-');
END;
$$;

-- Whether (turno, fecha) has a frozen Estudiantes roster (read with definer rights).
CREATE OR REPLACE FUNCTION pg_temp.congelada(p_turno int, p_fecha date) RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.estudiantes_voluntarios_rosters r
                  WHERE r.turno_id = pg_temp.id('tu', p_turno) AND r.fecha = p_fecha)::text;
END;
$$;

-- The caller's services in the ZZ Ev campuses: 'campus:nombre:tipo:fechas' joined by '|'.
CREATE OR REPLACE FUNCTION pg_temp.turnos() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(t.campus || ':' || t.nombre || ':' || t.tipo || ':' || array_to_string(t.fechas, ','),
                                     '|' ORDER BY t.campus, t.orden), '')
            FROM public.estudiantes_voluntarios_turnos() t
           WHERE t.campus LIKE 'ZZ Ev %');
END;
$$;

-- Report per volunteer: 'V30:esperados/presentes/avisos/faltas/sin_marcar/extras', sorted.
CREATE OR REPLACE FUNCTION pg_temp.reporte(p_desde date, p_hasta date, p_turno int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(replace(v ->> 'nombre', 'ZZ Ev ', '') || ':' || (v ->> 'esperados') || '/' || (v ->> 'presentes')
                                     || '/' || (v ->> 'avisos') || '/' || (v ->> 'faltas') || '/' || (v ->> 'sin_marcar')
                                     || '/' || (v ->> 'extras'), ',' ORDER BY v ->> 'nombre'), '')
            FROM jsonb_array_elements(public.estudiantes_reporte_voluntarios(p_desde, p_hasta, pg_temp.id('ca', 1),
                                        CASE WHEN p_turno IS NULL THEN NULL ELSE pg_temp.id('tu', p_turno) END) -> 'voluntarios') v
           WHERE v ->> 'nombre' LIKE 'ZZ Ev V%');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.nreporte(p_desde date, p_hasta date, p_turno int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(replace(v ->> 'nombre', 'ZZ Ev ', '') || ':' || (v ->> 'esperados') || '/' || (v ->> 'presentes')
                                     || '/' || (v ->> 'avisos') || '/' || (v ->> 'faltas') || '/' || (v ->> 'sin_marcar')
                                     || '/' || (v ->> 'extras'), ',' ORDER BY v ->> 'nombre'), '')
            FROM jsonb_array_elements(public.ninos_reporte_voluntarios(p_desde, p_hasta, pg_temp.id('ca', 1),
                                        pg_temp.id('tu', p_turno)) -> 'voluntarios') v
           WHERE v ->> 'nombre' LIKE 'ZZ Ev V%');
END;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_ev_ctx (k, v) VALUES
  ('hoy', public.ninos_hoy()),
  ('dom', public.ninos_hoy() - extract(dow FROM public.ninos_hoy())::int),
  ('d1', public.ninos_hoy() - 3),
  ('d2', public.ninos_hoy() + 7),
  ('d3', DATE '2026-10-11'),
  ('nocal', public.ninos_hoy() - 2);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ev-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 10) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ev', 'U' || n, 'ev-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 10) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Ev', 'V' || n, 'Soltero', 'Femenino'
  FROM unnest(ARRAY[20, 21, 22, 23, 30, 31, 32, 40]) AS n;

INSERT INTO public.campus (id, nombre, codigo)
SELECT pg_temp.id('ca', n), 'ZZ Ev Campus ' || n, 'ZZEV' || n FROM generate_series(1, 2) AS n;
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', CASE WHEN n IN (4, 23) THEN 2 ELSE 1 END), true
  FROM unnest(ARRAY[1, 2, 3, 4, 5, 7, 8, 9, 10, 20, 21, 22, 23, 30, 31, 32, 40]) AS n;
INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', v.n), rs.id
  FROM (VALUES (5, 'pastor'), (6, 'admin')) AS v(n, rol)
  JOIN public.roles_sistema rs ON rs.nombre_interno = v.rol;

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo, tipo)
SELECT pg_temp.id('tu', n), pg_temp.id('ca', c), nombre, 0, hora::time, orden, true, tipo
  FROM (VALUES (1, 1, 'Domingo 9:00', '09:00', 1, 'semanal'), (2, 1, 'Domingo 11:00', '11:00', 2, 'semanal'),
               (3, 1, 'ZZ Ev TLR', '19:00', 3, 'fechas'), (4, 2, 'Domingo 9:00', '09:00', 1, 'semanal'))
       AS v(n, c, nombre, hora, orden, tipo);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), experiencia, CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'experiencia', 'ZZ Ev Experiencia'), (2, 1, 'estudiantes', 'ZZ Ev Estudiantes'),
               (3, 2, 'estudiantes', 'ZZ Ev Transit'), (4, 2, 'the_living_room', 'ZZ Ev Living Room'),
               (5, 3, 'estudiantes', 'Grupos de Chicas'), (6, 3, 'estudiantes', 'Logística'),
               (7, 3, 'estudiantes', 'Atención al Voluntario'), (8, 4, 'the_living_room', 'Grupos de Chicos'),
               (9, 4, 'the_living_room', 'Producción'), (10, 0, 'ninos', 'ZZ Ev Ninos'),
               (11, 10, 'ninos', 'ZZ Ev Waumba'), (12, 11, 'ninos', 'ZZ Ev Maternal')) AS v(n, p, experiencia, label);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo)
SELECT pg_temp.id('ro', n), pg_temp.id('eq', e), label, nivel, true
  FROM (VALUES (1, 5, 'lider', 'lider'), (2, 6, 'voluntario', 'voluntario'), (3, 7, 'Coordinador', 'coordinador'),
               (4, 8, 'voluntario', 'voluntario'), (5, 9, 'voluntario', 'voluntario'),
               (6, 12, 'Voluntario', 'voluntario'), (7, 5, 'director de grupo', 'coordinador')) AS v(n, e, label, nivel);
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden)
VALUES (pg_temp.id('sa', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 11), 'waumba', 'ZZ Ev S1', 20, NULL, NULL, 1);

-- Listings first (they prune assignments): Transit serves T1, The Living Room T3.
INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES
  (pg_temp.id('eq', 3), pg_temp.id('tu', 1)),
  (pg_temp.id('eq', 4), pg_temp.id('tu', 3));

-- Servicio n belongs to person n: (n, equipo, rol). 22 starts in 2099.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r), 'activo',
       CASE WHEN n = 22 THEN timestamptz '2099-01-01 12:00+00' ELSE timestamptz '2020-01-01 12:00+00' END, 'admin_asignacion'
  FROM (VALUES (2, 7, 3), (20, 6, 2), (21, 6, 2), (22, 5, 1), (23, 6, 2), (30, 8, 4), (31, 9, 5), (32, 9, 5),
               (40, 12, 6), (10, 5, 7)) AS v(n, e, r);

INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla)
SELECT pg_temp.id('se', s), pg_temp.id('tu', t), 'semanal', NULL
  FROM (VALUES (20, 1), (22, 1), (30, 3), (31, 3), (40, 1)) AS v(s, t);

INSERT INTO public.dream_team_turno_fechas (turno_id, fecha)
SELECT pg_temp.id('tu', 3), pg_temp.d(k) FROM unnest(ARRAY['d1', 'd2', 'd3']) AS k;
INSERT INTO public.dream_team_turno_fecha_servidores (turno_fecha_id, turno_id, servicio_id)
SELECT f.id, f.turno_id, pg_temp.id('se', 30)
  FROM public.dream_team_turno_fechas f
 WHERE f.turno_id = pg_temp.id('tu', 3) AND f.fecha = pg_temp.d('d1');

-- What the servicios would mint, by hand.
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 10) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT pg_temp.id('us', n), k, 'dream_team', 'equipo', pg_temp.id('eq', e)::text
  FROM (VALUES (1, 'dream_team.coordinate', 6), (3, 'dream_team.direct', 2), (4, 'dream_team.direct', 2),
               (7, 'dream_team.serve', 6), (8, 'dream_team.coordinate', 4), (9, 'dream_team.direct', 10)) AS v(n, k, e);

GRANT INSERT, SELECT ON t_ev_failures, t_ev_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.id(text, int), pg_temp.as_persona(int), pg_temp.como(int, text, text, text), pg_temp.d(text),
  pg_temp.plan(int, date), pg_temp.areas(int, date), pg_temp.nplan(int, date),
  pg_temp.marcar(int, date, int[], text, boolean), pg_temp.nmarcar(int, date, int[], text),
  pg_temp.marca(int, int, date), pg_temp.congelada(int, date), pg_temp.turnos(),
  pg_temp.reporte(date, date, int), pg_temp.nreporte(date, date, int)
  TO authenticated, anon;

SET LOCAL ROLE authenticated;

-- ── a. flag ──────────────────────────────────────────────────────────

SELECT pg_temp.como(n, 'a: persona ' || n || ' may mark volunteers',
         $q$SELECT public.estudiantes_puede_marcar_voluntarios()::text$q$, 'true')
  FROM unnest(ARRAY[1, 2, 3, 4, 5, 6, 8]) AS n;
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('a: a plain volunteer may not',
  $q$SELECT public.estudiantes_puede_marcar_voluntarios()::text$q$, 'false');
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_eq('a: the Niños director may not',
  $q$SELECT public.estudiantes_puede_marcar_voluntarios()::text$q$, 'false');

-- ── b. services ──────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b: the Logística coordinator gets the Transit Sunday only',
  $q$SELECT pg_temp.turnos()$q$, 'ZZ Ev Campus 1:Domingo 9:00:semanal:');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('b: the TLR coordinator gets the dated turno with its past dates, newest first',
  $q$SELECT pg_temp.turnos()$q$, 'ZZ Ev Campus 1:ZZ Ev TLR:fechas:' || pg_temp.d('d1') || ',' || pg_temp.d('d3'));
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('b: the Estudiantes director gets both',
  $q$SELECT pg_temp.turnos()$q$,
  'ZZ Ev Campus 1:Domingo 9:00:semanal:|ZZ Ev Campus 1:ZZ Ev TLR:fechas:' || pg_temp.d('d1') || ',' || pg_temp.d('d3'));
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('b: a director of campus 2 gets nothing of campus 1', $q$SELECT pg_temp.turnos()$q$, '');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_eq('b: a plain volunteer gets none', $q$SELECT pg_temp.turnos()$q$, '');

-- ── c. roster scope ──────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: the Logística coordinator sees only their team',
  $q$SELECT pg_temp.plan(1, pg_temp.d('dom'))$q$, 'V20:true:false:-,V21:false:true:-');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('c: Atención al Voluntario sees the Transit subtree; another principal campus is absent',
  $q$SELECT pg_temp.plan(1, pg_temp.d('dom'))$q$, 'V20:true:false:-,V21:false:true:-,V22:false:false:-');
SELECT pg_temp.como(n, 'c: persona ' || n || ' sees Transit on the Sunday, without The Living Room',
         $q$SELECT pg_temp.plan(1, pg_temp.d('dom')) || '|' || pg_temp.areas(1, pg_temp.d('dom'))$q$,
         'V20:true:false:-,V21:false:true:-,V22:false:false:-|ZZ Ev Transit')
  FROM unnest(ARRAY[3, 5, 6]) AS n;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('c: on the dated turno only the chosen volunteer of the date is expected',
  $q$SELECT pg_temp.plan(3, pg_temp.d('d1')) || '|' || pg_temp.areas(3, pg_temp.d('d1'))$q$,
  'V30:true:false:-,V31:false:false:-,V32:false:true:-|ZZ Ev Living Room');
SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('c: the TLR coordinator sees The Living Room only',
  $q$SELECT pg_temp.plan(3, pg_temp.d('d1'))$q$, 'V30:true:false:-,V31:false:false:-,V32:false:true:-');
SELECT pg_temp.assert_eq('c: the TLR coordinator has nobody on the Transit Sunday',
  $q$SELECT pg_temp.plan(1, pg_temp.d('dom'))$q$, '');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: the Logística coordinator has nobody on the dated turno',
  $q$SELECT pg_temp.plan(3, pg_temp.d('d1'))$q$, '');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('c: a director of campus 2 cannot open campus 1',
  $q$SELECT pg_temp.plan(1, pg_temp.d('dom'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('c: the pastor of campus 1 cannot open campus 2',
  $q$SELECT pg_temp.plan(4, pg_temp.d('dom'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('c: a plain volunteer gets sin_autoridad',
  $q$SELECT pg_temp.plan(1, pg_temp.d('dom'))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_raises('c: the Niños director gets sin_autoridad',
  $q$SELECT pg_temp.plan(1, pg_temp.d('dom'))$q$, '42501', 'sin_autoridad');

-- ── d. dates ─────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_raises('d: a date off the TLR calendar is refused',
  $q$SELECT pg_temp.plan(3, pg_temp.d('nocal'))$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('d: a NULL date is refused',
  $q$SELECT pg_temp.plan(3, NULL)$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_eq('d: a planned date today - 3 is editable, of tipo fechas',
  $q$SELECT (p ->> 'editable') || ':' || (p ->> 'tipo')
       FROM public.estudiantes_voluntarios_planilla(pg_temp.id('tu', 3), pg_temp.d('d1')) AS p$q$, 'true:fechas');
SELECT pg_temp.assert_eq('d: a future planned date and one outside the window are read-only',
  $q$SELECT (public.estudiantes_voluntarios_planilla(pg_temp.id('tu', 3), pg_temp.d('d2')) ->> 'editable') || ':'
            || (public.estudiantes_voluntarios_planilla(pg_temp.id('tu', 3), pg_temp.d('d3')) ->> 'editable')$q$, 'false:false');
SELECT pg_temp.assert_raises('d: an unknown turno is refused',
  $q$SELECT pg_temp.plan(99, pg_temp.d('d1'))$q$, '22023', 'turno_invalido');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('d: a weekly turno off its weekday is refused',
  $q$SELECT pg_temp.plan(1, pg_temp.d('dom') + 1)$q$, '22023', 'fecha_invalida');

-- ── e. marking ───────────────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('e: the Logística coordinator marks their volunteer',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[20], 'presente') || '|' || pg_temp.marca(20, 1, pg_temp.d('dom'))$q$,
  '1|presente:true:1');
SELECT pg_temp.assert_eq('e: marking the same estado again changes nothing',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[20], 'presente')$q$, '0');
SELECT pg_temp.assert_raises('e: a volunteer of another team is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[22], 'presente')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e: also inside a batch',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[20, 22], 'ausente')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('e: a refused batch leaves the mark as it was',
  $q$SELECT pg_temp.marca(20, 1, pg_temp.d('dom'))$q$, 'presente:true:1');
SELECT pg_temp.assert_raises('e: a volunteer not in the roster of the turno is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[30], 'presente')$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('e: a volunteer of another principal campus is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[23], 'presente')$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_raises('e: an unknown estado is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[20], 'tarde')$q$, '22023', 'estado_invalido');
SELECT pg_temp.assert_raises('e: a future Sunday is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom') + 7, ARRAY[20], 'presente')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('e: a Sunday more than 14 days back is refused',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom') - 21, ARRAY[20], 'presente')$q$, '22023', 'fecha_invalida');

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('e: "the rest as Faltó" keeps the existing mark',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[20, 21], 'ausente', true) || '|' || pg_temp.marca(20, 1, pg_temp.d('dom'))
            || '|' || pg_temp.marca(21, 1, pg_temp.d('dom'))$q$, '1|presente:true:1|ausente:false:2');
SELECT pg_temp.assert_eq('e: clearing deletes the mark',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[22], 'presente') || '|' || pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[22], NULL)
            || '|' || pg_temp.marca(22, 1, pg_temp.d('dom'))$q$, '1|1|-');

SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('e: a director of campus 2 cannot mark campus 1',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[20], 'ausente')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('e: a plain volunteer cannot mark',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[20], 'ausente')$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('e: the TLR coordinator marks the chosen volunteer on a planned date',
  $q$SELECT pg_temp.marcar(3, pg_temp.d('d1'), ARRAY[30], 'presente') || '|' || pg_temp.marca(30, 3, pg_temp.d('d1'))$q$,
  '1|presente:true:8');
SELECT pg_temp.assert_eq('e: a volunteer not chosen for the date is an extra',
  $q$SELECT pg_temp.marcar(3, pg_temp.d('d1'), ARRAY[31], 'presente') || '|' || pg_temp.marca(31, 3, pg_temp.d('d1'))$q$,
  '1|presente:false:8');
SELECT pg_temp.assert_raises('e: a date off the TLR calendar is refused',
  $q$SELECT pg_temp.marcar(3, pg_temp.d('nocal'), ARRAY[30], 'presente')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('e: a future planned date is refused',
  $q$SELECT pg_temp.marcar(3, pg_temp.d('d2'), ARRAY[30], 'presente')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('e: a planned date more than 14 days back is refused',
  $q$SELECT pg_temp.marcar(3, pg_temp.d('d3'), ARRAY[30], 'presente')$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('e: the TLR coordinator cannot mark Transit',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[20], 'ausente')$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('e: the pastor of the campus marks',
  $q$SELECT pg_temp.marcar(3, pg_temp.d('d1'), ARRAY[32], 'justificado') || '|' || pg_temp.marca(32, 3, pg_temp.d('d1'))$q$,
  '1|justificado:false:5');

-- ── f. frozen roster ─────────────────────────────────────────────────

SELECT pg_temp.assert_eq('f: opening a past planned date froze it',
  $q$SELECT pg_temp.congelada(3, pg_temp.d('d1'))$q$, 'true');

RESET ROLE;
-- The coordinator changes who serves on D1 (V30 out, V31 in) and on D3 (V31 in).
DELETE FROM public.dream_team_turno_fecha_servidores s
 USING public.dream_team_turno_fechas f
 WHERE f.id = s.turno_fecha_id AND f.turno_id = pg_temp.id('tu', 3) AND f.fecha = pg_temp.d('d1');
INSERT INTO public.dream_team_turno_fecha_servidores (turno_fecha_id, turno_id, servicio_id)
SELECT f.id, f.turno_id, pg_temp.id('se', 31)
  FROM public.dream_team_turno_fechas f
 WHERE f.turno_id = pg_temp.id('tu', 3) AND f.fecha IN (pg_temp.d('d1'), pg_temp.d('d3'));
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(8);
SELECT pg_temp.assert_eq('f: the frozen date keeps who was expected that day',
  $q$SELECT pg_temp.plan(3, pg_temp.d('d1'))$q$, 'V30:true:false:presente,V31:false:false:presente,V32:false:true:justificado');
SELECT pg_temp.assert_eq('f: a date before the freeze start follows the current choice',
  $q$SELECT pg_temp.plan(3, pg_temp.d('d3')) || '|' || pg_temp.congelada(3, pg_temp.d('d3'))$q$,
  'V30:false:false:-,V31:true:false:-,V32:false:true:-|false');

-- ── g. report ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('g: the dated turno per volunteer: expected, extra and Avisó',
  $q$SELECT pg_temp.reporte(pg_temp.d('hoy') - 14, pg_temp.d('hoy'), 3)$q$, 'V30:1/1/0/0/0/0,V31:0/1/0/0/0/1,V32:0/0/1/0/0/0');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('g: the Sunday per volunteer, only the caller''s team',
  $q$SELECT pg_temp.reporte(pg_temp.d('dom'), pg_temp.d('hoy'), 1)$q$, 'V20:1/1/0/0/0/0,V21:0/0/0/1/0/0');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('g: the director''s services cover Transit and The Living Room, never Niños',
  $q$SELECT string_agg(DISTINCT s ->> 'area', ',' ORDER BY s ->> 'area')
       FROM jsonb_array_elements(public.estudiantes_reporte_voluntarios(pg_temp.d('hoy') - 14, pg_temp.d('hoy'),
                                   pg_temp.id('ca', 1)) -> 'servicios') s$q$, 'ZZ Ev Living Room,ZZ Ev Transit');
SELECT pg_temp.assert_raises('g: more than 366 days is refused',
  $q$SELECT pg_temp.reporte(pg_temp.d('hoy') - 400, pg_temp.d('hoy'), NULL)$q$, '22023', 'rango_invalido');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('g: a plain volunteer gets sin_autoridad',
  $q$SELECT pg_temp.reporte(pg_temp.d('hoy') - 14, pg_temp.d('hoy'), NULL)$q$, '42501', 'sin_autoridad');

-- ── h. Niños unchanged ───────────────────────────────────────────────

SELECT pg_temp.as_persona(9);
SELECT pg_temp.assert_eq('h: the Niños roster of the same Sunday has only Niños volunteers',
  $q$SELECT pg_temp.nplan(1, pg_temp.d('dom'))$q$, 'V40:true:false:-');
SELECT pg_temp.assert_eq('h: the Niños areas are unchanged',
  $q$SELECT string_agg(a ->> 'nombre', ',')
       FROM jsonb_array_elements(public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), pg_temp.d('dom')) -> 'areas') a$q$,
  'ZZ Ev Waumba');
SELECT pg_temp.assert_eq('h: Niños marks its volunteer',
  $q$SELECT pg_temp.nmarcar(1, pg_temp.d('dom'), ARRAY[40], 'presente') || '|' || pg_temp.nplan(1, pg_temp.d('dom'))$q$,
  '1|V40:true:false:presente');
SELECT pg_temp.assert_raises('h: Niños cannot mark an Estudiantes volunteer',
  $q$SELECT pg_temp.nmarcar(1, pg_temp.d('dom'), ARRAY[20], 'ausente')$q$, '22023', 'servicio_invalido');
SELECT pg_temp.assert_eq('h: the Niños report counts only Niños volunteers',
  $q$SELECT pg_temp.nreporte(pg_temp.d('dom'), pg_temp.d('hoy'), 1)$q$, 'V40:1/1/0/0/0/0');
SELECT pg_temp.assert_eq('h: the Niños services are the weekly ones, without the dated turno',
  $q$SELECT string_agg(nombre, ',' ORDER BY orden) FROM public.ninos_voluntarios_turnos() WHERE campus = 'ZZ Ev Campus 1'$q$,
  'Domingo 9:00,Domingo 11:00');
SELECT pg_temp.assert_raises('h: Niños still refuses the dated turno',
  $q$SELECT pg_temp.nplan(3, pg_temp.d('d1'))$q$, '22023', 'turno_invalido');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('h: the Estudiantes roster ignores the Niños volunteer and mark',
  $q$SELECT pg_temp.plan(1, pg_temp.d('dom'))$q$, 'V20:true:false:presente,V21:false:true:ausente,V22:false:false:-');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('h: an Estudiantes coordinator cannot mark Niños',
  $q$SELECT public.ninos_puede_marcar_voluntarios_algun_area()::text$q$, 'false');
SELECT pg_temp.as_persona(10);
SELECT pg_temp.assert_eq('j: a director de grupo without grants may mark volunteers',
  $q$SELECT public.estudiantes_puede_marcar_voluntarios()::text$q$, 'true');
SELECT pg_temp.assert_eq('j: the director de grupo sees only the volunteers of their sub-área',
  $q$SELECT pg_temp.plan(1, pg_temp.d('dom'))$q$, 'V22:false:false:-');
SELECT pg_temp.assert_eq('j: the director de grupo marks a volunteer of their sub-área',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[22], 'presente') || '|' || pg_temp.marca(22, 1, pg_temp.d('dom'))$q$,
  '1|presente:false:10');
SELECT pg_temp.assert_raises('j: the director de grupo cannot mark another team',
  $q$SELECT pg_temp.marcar(1, pg_temp.d('dom'), ARRAY[20], 'ausente')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('j: a refused mark leaves the other team unchanged',
  $q$SELECT pg_temp.marca(20, 1, pg_temp.d('dom'))$q$, 'presente:true:1');
SELECT pg_temp.assert_eq('j: the director de grupo has nothing on The Living Room',
  $q$SELECT pg_temp.plan(3, pg_temp.d('d1'))$q$, '');

RESET ROLE;

-- ── i. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('i: authenticated executes the five public functions, anon none',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       || ':' || has_function_privilege('anon', p.oid, 'EXECUTE'), ',' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('estudiantes_puede_marcar_voluntarios', 'estudiantes_voluntarios_turnos',
                                                   'estudiantes_voluntarios_planilla', 'estudiantes_voluntarios_marcar',
                                                   'estudiantes_reporte_voluntarios')$q$,
  'estudiantes_puede_marcar_voluntarios:true:false,estudiantes_reporte_voluntarios:true:false,'
  || 'estudiantes_voluntarios_marcar:true:false,estudiantes_voluntarios_planilla:true:false,'
  || 'estudiantes_voluntarios_turnos:true:false');
SELECT pg_temp.assert_eq('i: the helpers are closed to authenticated and anon',
  $q$SELECT count(*)::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('estudiantes_voluntarios_congelado_desde', 'estudiantes_voluntarios_equipos',
                          'estudiantes_voluntarios_marcables', 'estudiantes_voluntarios_participa',
                          'estudiantes_voluntarios_del_turno_vivo', 'estudiantes_voluntarios_congelar',
                          'estudiantes_voluntarios_del_turno', 'estudiantes_voluntarios_congelar_pendientes')
        AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')$q$, '8');
SELECT pg_temp.assert_eq('i: the roster tables are closed to authenticated and anon',
  $q$SELECT (has_table_privilege('authenticated', 'public.estudiantes_voluntarios_rosters', 'SELECT')
             OR has_table_privilege('anon', 'public.estudiantes_voluntarios_rosters', 'SELECT')
             OR has_table_privilege('authenticated', 'public.estudiantes_voluntarios_roster_servicios', 'SELECT')
             OR has_table_privilege('anon', 'public.estudiantes_voluntarios_roster_servicios', 'SELECT'))::text$q$, 'false');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_ev_failures);
END;
$$;
