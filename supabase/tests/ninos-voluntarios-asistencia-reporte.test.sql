-- V4 (odd/tasks/ninos-asistencia-voluntarios.md) — volunteer attendance report
-- (20261012120000_ninos_voluntarios_reporte.sql).
--
-- Covers:
--   a. Gate: a random user gets 'sin_autoridad'; NULL, reversed and > 366-day ranges 'rango_invalido'.
--   b. Per service (turno 9:00): expected, Presente, Avisó, Faltó, sin marcar
--      and extras per fecha, area and equipo; future dates are not counted;
--      a volunteer without a turno and nobody marked is never counted.
--   c. Per volunteer: totals and the streak of consecutive Faltó (an unmarked
--      or Avisó service ends it), ordered by streak and misses.
--   d. Without the turno filter, the 11:00 volunteer's unmarked services count.
--   e. Scope: an area coordinator sees only their area.
--   f. Privileges: anon cannot execute it.
--   g. V6 (20261012170000_ninos_voluntarios_reporte_coordinador.sql): a
--      sub-area coordinator sees only their own team; a random user is still
--      refused; the full-scope viewer (b–d) is unchanged.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD_SUB (Coordinador of team A),
-- 3 CONFIG (dream_team.direct on R), 5 RANDOM, 6 COORD_X (coordinate on area
-- X). Volunteers 10..18 have no account.
-- Tree: R → W → A, B; R → X → XA. Rooms: W and X in campus 1.
-- Turnos T9 and T11 (campus 1, Sunday). Dates relative to 'dom', the last
-- Sunday up to ninos_hoy(): D-14, D-7, D0.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_nr_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_nr_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_nr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9820000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9821' WHEN 'us' THEN '9822' WHEN 'ca' THEN '9823'
                       WHEN 'eq' THEN '9824' WHEN 'ro' THEN '9825' WHEN 'sa' THEN '9826'
                       WHEN 'tu' THEN '9827' WHEN 'se' THEN '9828' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.dom() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT v::date FROM t_nr_ctx WHERE k = 'dom';
$$;

-- plpgsql helpers: their bodies are not resolved until called, so the RED
-- run (function missing) still reaches the final SELECT.

-- The report from D-14 to D+14 for campus 1, optionally only turno T9.
CREATE OR REPLACE FUNCTION pg_temp.rep(p_solo_t9 boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.ninos_reporte_voluntarios(pg_temp.dom() - 14, pg_temp.dom() + 14, pg_temp.id('ca', 1),
           CASE WHEN p_solo_t9 THEN pg_temp.id('tu', 1) END);
END;
$$;

-- 'offset:equipo:esperados/presentes/avisos/faltas/sin_marcar/extras' per service row.
CREATE OR REPLACE FUNCTION pg_temp.servicios(p_solo_t9 boolean) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT string_agg(((s ->> 'fecha')::date - pg_temp.dom()) || ':' || (s ->> 'equipo') || ':'
                            || concat_ws('/', s ->> 'esperados', s ->> 'presentes', s ->> 'avisos', s ->> 'faltas',
                                         s ->> 'sin_marcar', s ->> 'extras'), ',' ORDER BY ord)
            FROM jsonb_array_elements(pg_temp.rep(p_solo_t9) -> 'servicios') WITH ORDINALITY AS x(s, ord));
END;
$$;

-- 'apellido:esperados/presentes/avisos/faltas/sin_marcar/extras/faltas_seguidas' per volunteer, report order.
CREATE OR REPLACE FUNCTION pg_temp.voluntarios(p_solo_t9 boolean) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT string_agg(split_part(v ->> 'nombre', ' ', 3) || ':'
                            || concat_ws('/', v ->> 'esperados', v ->> 'presentes', v ->> 'avisos', v ->> 'faltas',
                                         v ->> 'sin_marcar', v ->> 'extras', v ->> 'faltas_seguidas'), ',' ORDER BY ord)
            FROM jsonb_array_elements(pg_temp.rep(p_solo_t9) -> 'voluntarios') WITH ORDINALITY AS x(v, ord));
END;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_nr_ctx (k, v) VALUES ('dom', (public.ninos_hoy() - extract(dow FROM public.ninos_hoy())::int)::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'nr-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 3, 5, 6]) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Nr', 'U' || n, 'nr-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM unnest(ARRAY[1, 3, 5, 6]) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Nr', 'V' || n, 'Soltero', 'Femenino' FROM generate_series(10, 18) AS n;

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Nr Campus 1', 'ZZNR1');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), true FROM generate_series(10, 18) AS n;

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden)
VALUES (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'Domingo 9:00', 0, '09:00', 1),
       (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'Domingo 11:00', 0, '11:00', 2);

-- (n, parent, label): 1 R, 2 W, 3 A, 4 B, 7 X, 8 XA.
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), 'ninos', CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'ZZ Nr Ninos'), (2, 1, 'ZZ Nr Waumba'), (3, 2, 'ZZ Nr A'), (4, 2, 'ZZ Nr B'),
               (7, 1, 'ZZ Nr Upstreet'), (8, 7, 'ZZ Nr XA')) AS v(n, p, label);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo)
SELECT pg_temp.id('ro', n), pg_temp.id('eq', e), label, true
  FROM (VALUES (1, 3, 'Voluntario'), (2, 3, 'Coordinador'), (3, 4, 'Voluntario'), (6, 8, 'Voluntario')) AS v(n, e, label);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden)
SELECT pg_temp.id('sa', n), pg_temp.id('ca', 1), pg_temp.id('eq', e), area, 'ZZ Nr S' || n, 20, g, g, n
  FROM (VALUES (1, 2, 'waumba', NULL::int), (2, 7, 'upstreet', 1)) AS v(n, e, area, g);

-- Servicio n belongs to person n: (n, equipo, rol).
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r),
       'activo'::public.dream_team_estado, timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM (VALUES (1, 3, 2), (10, 3, 1), (11, 3, 1), (12, 3, 1), (13, 3, 1), (16, 3, 1), (17, 4, 3), (18, 8, 6)) AS v(n, e, r);

-- Weekly: 10, 11, 12, 17, 18 at T9; 13 at T11; 16 has no turno.
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla)
SELECT pg_temp.id('se', s), pg_temp.id('tu', t), 'semanal', NULL
  FROM (VALUES (10, 1), (11, 1), (12, 1), (13, 2), (17, 1), (18, 1)) AS v(s, t);

-- Marks at T9 (offset from D, servicio, estado, esperado).
INSERT INTO public.dream_team_asistencias (servicio_id, turno_id, fecha, estado, esperado, marcado_por)
SELECT pg_temp.id('se', s), pg_temp.id('tu', 1), pg_temp.dom() + o, e, x, pg_temp.id('us', 3)
  FROM (VALUES (-14, 10, 'ausente', true), (-7, 10, 'ausente', true), (0, 10, 'presente', true),
               (-14, 11, 'presente', true), (-7, 11, 'ausente', true), (0, 11, 'ausente', true),
               (0, 13, 'presente', false),
               (-7, 17, 'ausente', true), (0, 17, 'justificado', true),
               (0, 18, 'ausente', true)) AS v(o, s, e, x);

-- What the servicios would mint, by hand (the role trigger may already have minted some).
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT pg_temp.id('us', n), k, 'dream_team', 'equipo', pg_temp.id('eq', e)::text
  FROM (VALUES (1, 'dream_team.coordinate', 3), (3, 'dream_team.direct', 1), (6, 'dream_team.coordinate', 7)) AS v(n, k, e)
ON CONFLICT DO NOTHING;

GRANT INSERT, SELECT, UPDATE ON t_nr_failures, t_nr_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.dom(), pg_temp.rep(boolean), pg_temp.servicios(boolean), pg_temp.voluntarios(boolean) TO authenticated, anon;

SET LOCAL ROLE authenticated;

-- ── a. gate and range ────────────────────────────────────────────────

SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('a: a random user gets sin_autoridad',
  $q$SELECT pg_temp.rep(true)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('a: a NULL range is rango_invalido',
  $q$SELECT public.ninos_reporte_voluntarios(NULL, DATE '2026-01-01')$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('a: a reversed range is rango_invalido',
  $q$SELECT public.ninos_reporte_voluntarios(DATE '2026-02-01', DATE '2026-01-01')$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('a: more than 366 days is rango_invalido',
  $q$SELECT public.ninos_reporte_voluntarios(DATE '2025-01-01', DATE '2026-01-03')$q$, '22023', 'rango_invalido');

-- ── b. per service ───────────────────────────────────────────────────

SELECT pg_temp.assert_eq('b: per fecha, area and equipo at 9:00; no future dates; no-turno volunteer absent',
  $q$SELECT pg_temp.servicios(true)$q$,
  '-14:ZZ Nr XA:1/0/0/0/1/0,-14:ZZ Nr A:3/1/0/1/1/0,-14:ZZ Nr B:1/0/0/0/1/0,'
  || '-7:ZZ Nr XA:1/0/0/0/1/0,-7:ZZ Nr A:3/0/0/2/1/0,-7:ZZ Nr B:1/0/0/1/0/0,'
  || '0:ZZ Nr XA:1/0/0/1/0/0,0:ZZ Nr A:3/2/0/1/1/1,0:ZZ Nr B:1/0/1/0/0/0');
SELECT pg_temp.assert_eq('b: a row carries area and turno',
  $q$SELECT (s ->> 'area') || '|' || (s ->> 'turno') || '|' || ((s ->> 'turno_id')::uuid = pg_temp.id('tu', 1))
       FROM jsonb_array_elements(pg_temp.rep(true) -> 'servicios') s WHERE s ->> 'equipo' = 'ZZ Nr XA' LIMIT 1$q$,
  'ZZ Nr Upstreet|Domingo 9:00|true');

-- ── c. per volunteer ─────────────────────────────────────────────────

SELECT pg_temp.assert_eq('c: totals and streaks, ordered by streak then misses',
  $q$SELECT pg_temp.voluntarios(true)$q$,
  'V11:3/1/0/2/0/0/2,V18:3/0/0/1/2/0/1,V10:3/1/0/2/0/0/0,V17:3/0/1/1/1/0/0,V12:3/0/0/0/3/0/0,V13:0/1/0/0/0/1/0');

-- ── d. every turno ───────────────────────────────────────────────────

SELECT pg_temp.assert_eq('d: without the turno filter the 11:00 volunteer is expected there',
  $q$SELECT split_part(v ->> 'nombre', ' ', 3) || ':' || concat_ws('/', v ->> 'esperados', v ->> 'presentes', v ->> 'sin_marcar', v ->> 'extras')
       FROM jsonb_array_elements(pg_temp.rep(false) -> 'voluntarios') v WHERE v ->> 'nombre' LIKE '% V13'$q$,
  'V13:3/1/3/1');
SELECT pg_temp.assert_eq('d: the 11:00 service rows appear',
  $q$SELECT count(*)::text FROM jsonb_array_elements(pg_temp.rep(false) -> 'servicios') s WHERE s ->> 'turno' = 'Domingo 11:00'$q$,
  '3');

-- ── e. scope ─────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('e: an area coordinator sees only their area',
  $q$SELECT pg_temp.voluntarios(true)$q$, 'V18:3/0/0/1/2/0/1');

-- ── g. sub-area coordinator (V6) ─────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('g: a sub-area coordinator sees only the volunteers of their team',
  $q$SELECT pg_temp.voluntarios(true)$q$,
  'V11:3/1/0/2/0/0/2,V10:3/1/0/2/0/0/0,V12:3/0/0/0/3/0/0,V13:0/1/0/0/0/1/0');
SELECT pg_temp.assert_eq('g: a sub-area coordinator gets no service rows of other teams',
  $q$SELECT string_agg(DISTINCT s ->> 'equipo', ',') FROM jsonb_array_elements(pg_temp.rep(false) -> 'servicios') s$q$,
  'ZZ Nr A');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('g: a non-coordinator is still refused',
  $q$SELECT pg_temp.rep(true)$q$, '42501', 'sin_autoridad');

-- ── f. privileges ────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_reporte_voluntarios',
  $q$SELECT public.ninos_reporte_voluntarios(DATE '2026-01-01', DATE '2026-01-31')$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_nr_failures;

ROLLBACK;
