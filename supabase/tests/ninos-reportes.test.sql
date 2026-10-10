-- N7 (odd/tasks/ninos-checkin.md) — attendance reports
-- (20261009120000_ninos_reportes.sql), extended by N16
-- (20261010120000_ninos_reportes_mensual.sql).
--
-- Covers:
--   a. Flag ninos_puede_configurar_algun_area: the coordinator yes; the
--      anfitrión and a random user no.
--   b. Authority: the anfitrión and a random user get 'sin_autoridad'; a bad
--      range gets 'rango_invalido'.
--   c. Per room: check-ins, peak present at once and capacity; a room in an
--      area the coordinator does not configure is never read.
--   d. Per day: distinct children.
--   e. New children (first check-in ever in the range) with their parent.
--   f. Stopped coming: >= 2 of the 4 earlier Sundays, none of the last 2.
--   g. anon cannot execute the new functions.
--   N16 — every "children" number is a distinct count computed in SQL:
--   h. Per Sunday: a child in both services counts once in the day and once
--      in its area, and once in each service; check-ins count every row.
--   i. A child moved between rooms within one service counts once; per room
--      rows carry distinct children and check-ins.
--   j. meses: one row per calendar month of the range (empty months too),
--      partial months flagged; a month total is not the sum of its Sundays.
--   k. totales: distinct children over the whole range, per service and per
--      area, service days, average per service day, new children/families.
--   l. New children: estado volvio (a later fecha, any room, no upper date
--      bound) / no_volvio / pendiente (nobody came after the first visit),
--      visitas, ultima_fecha and the family state (any child returned).
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION, 2 COORDINADOR, 3 RANDOM;
-- 5..8 children, 10 parent of 7; 11..18 N16 children (15 and 16 siblings).
-- Tree: R → W → A ("Anfitriones"); X (another area). Rooms S1 (upstreet,
-- cap 2), S3 (waumba) and S4 (upstreet) in W; S2 in X. Services T1 and T2 are
-- the first two Sunday turnos of Barquisimeto. N7 Sundays 2099-01-04 …
-- 2099-02-08 (reference Sunday 2099-02-08); N16 Sundays 2099-03-01 …
-- 2099-04-12, the last fecha of every check-in.

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
  SELECT format('f9700000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9701' WHEN 'us' THEN '9702' WHEN 'eq' THEN '9704'
                       WHEN 'ro' THEN '9705' WHEN 'sa' THEN '9706' WHEN 'vi' THEN '9707' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_nr_ctx WHERE k = p_k;
$$;

-- The report for the coordinator's default call (2099-01-04 … 2099-02-10).
CREATE OR REPLACE FUNCTION pg_temp.rep(p_desde date DEFAULT DATE '2099-01-04') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.ninos_reporte_asistencia(p_desde, DATE '2099-02-10', NULL, NULL);
$$;

-- Any range, every campus and service (N16 cases).
CREATE OR REPLACE FUNCTION pg_temp.rep2(p_desde date, p_hasta date) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.ninos_reporte_asistencia(p_desde, p_hasta, NULL, NULL);
$$;

-- One period as 'children/check-ins|T1:children/check-ins,…|area:children/check-ins,…',
-- services and areas in the order the report returns them.
CREATE OR REPLACE FUNCTION pg_temp.fmt(p jsonb) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT (p ->> 'ninos') || '/' || (p ->> 'checkins')
      || '|' || coalesce((SELECT string_agg(CASE x.e ->> 'turno_id' WHEN pg_temp.ctx('turno') THEN 'T1'
                                                                   WHEN pg_temp.ctx('turno2') THEN 'T2' ELSE '?' END
                                            || ':' || (x.e ->> 'ninos') || '/' || (x.e ->> 'checkins'), ',' ORDER BY x.i)
                            FROM jsonb_array_elements(p -> 'turnos') WITH ORDINALITY AS x(e, i)), '-')
      || '|' || coalesce((SELECT string_agg((x.e ->> 'area') || ':' || (x.e ->> 'ninos') || '/' || (x.e ->> 'checkins'), ',' ORDER BY x.i)
                            FROM jsonb_array_elements(p -> 'areas') WITH ORDINALITY AS x(e, i)), '-');
$$;

CREATE OR REPLACE FUNCTION pg_temp.dia_de(r jsonb, f date) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT e FROM jsonb_array_elements(r -> 'dias') e WHERE e ->> 'fecha' = f::text;
$$;

CREATE OR REPLACE FUNCTION pg_temp.mes_de(r jsonb, m date) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT e FROM jsonb_array_elements(r -> 'meses') e WHERE e ->> 'mes' = m::text;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_nr_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo ORDER BY t.hora LIMIT 1;
INSERT INTO t_nr_ctx (k, v)
SELECT 'turno2', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo ORDER BY t.hora OFFSET 1 LIMIT 1;
INSERT INTO t_nr_ctx (k, v)
SELECT 'campus', t.campus_id::text FROM public.dream_team_turnos t WHERE t.id = pg_temp.ctx('turno')::uuid;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'nr-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 3) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Nr', 'U' || n, 'nr-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 3) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento)
SELECT pg_temp.id('us', n), 'ZZ Nino', 'N' || n, 'No especificado', 'Femenino', DATE '2092-01-01'
  FROM generate_series(5, 8) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento)
SELECT pg_temp.id('us', n), 'ZZ Nino', 'N' || n, 'No especificado', 'Femenino', DATE '2092-01-01'
  FROM generate_series(11, 18) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 10), 'ZZ Padre', 'P10', 'Casado', 'Masculino');
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion)
VALUES (pg_temp.id('us', 7), pg_temp.id('us', 10), 'padre');

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Nr R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Nr W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 5), 'ninos', NULL, 'ZZ Nr X', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 3) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 2), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Nr S1', 2, 1, 1, 1),
  (pg_temp.id('sa', 2), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 5), 'upstreet', 'ZZ Nr S2', 20, 2, 2, 2);
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 3), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Nr S3', 20, 24, 35, NULL, NULL, 3),
  (pg_temp.id('sa', 4), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Nr S4', 20, NULL, NULL, 3, 3, 4);
INSERT INTO public.ninos_fichas (usuario_id, grado)
SELECT pg_temp.id('us', n), 1 FROM generate_series(5, 8) AS n;

-- Check-ins: (child, room, Sunday, entry, exit). Times are UTC.
INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_at, salida_at)
SELECT pg_temp.id('us', x.n), pg_temp.id('sa', x.s), pg_temp.ctx('turno')::uuid, pg_temp.ctx('campus')::uuid,
       x.f, pg_temp.id('vi', x.v), '1234', x.f + x.ent, x.f + x.sal
  FROM (VALUES
    (5, 1, DATE '2099-01-04', 1, TIME '13:00', TIME '15:00'),
    (6, 1, DATE '2099-01-04', 2, TIME '13:05', TIME '15:00'),
    (5, 1, DATE '2099-01-11', 3, TIME '13:00', NULL),
    (6, 1, DATE '2099-01-11', 4, TIME '13:00', NULL),
    (6, 1, DATE '2099-02-08', 5, TIME '13:00', TIME '13:30'),
    (7, 1, DATE '2099-02-08', 6, TIME '13:40', NULL),
    (8, 2, DATE '2099-02-08', 7, TIME '13:00', NULL)
  ) AS x(n, s, f, v, ent, sal);

-- N16 check-ins: (child, room, service 1 = T1 | 2 = T2, Sunday, visita, entry,
-- exit). 11 and 13 come to both services on 2099-03-01 (13 in a Waumba room,
-- then an UpStreet one); 15 and 16 are siblings of one visit and only 15
-- returns, in S2 (another area); 18 comes on the last fecha of all.
INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_at, salida_at)
SELECT pg_temp.id('us', x.n), pg_temp.id('sa', x.s), pg_temp.ctx(CASE x.t WHEN 1 THEN 'turno' ELSE 'turno2' END)::uuid,
       pg_temp.ctx('campus')::uuid, x.f, pg_temp.id('vi', x.v), '1234', x.f + x.ent, x.f + x.sal
  FROM (VALUES
    (11, 1, 1, DATE '2099-03-01', 11, TIME '13:00', TIME '14:30'),
    (11, 1, 2, DATE '2099-03-01', 12, TIME '15:00', NULL),
    (12, 3, 1, DATE '2099-03-01', 13, TIME '13:00', NULL),
    (13, 3, 1, DATE '2099-03-01', 14, TIME '13:00', TIME '14:30'),
    (13, 4, 2, DATE '2099-03-01', 15, TIME '15:00', NULL),
    (15, 3, 1, DATE '2099-03-01', 16, TIME '13:05', NULL),
    (16, 3, 1, DATE '2099-03-01', 16, TIME '13:05', NULL),
    (12, 3, 1, DATE '2099-03-08', 17, TIME '13:00', NULL),
    (14, 1, 1, DATE '2099-03-08', 18, TIME '13:00', TIME '13:20'),
    (11, 1, 1, DATE '2099-03-15', 20, TIME '13:00', NULL),
    (15, 2, 1, DATE '2099-03-15', 21, TIME '13:00', NULL),
    (12, 3, 1, DATE '2099-04-05', 22, TIME '13:00', NULL),
    (17, 3, 1, DATE '2099-04-05', 23, TIME '13:00', NULL),
    (18, 3, 1, DATE '2099-04-12', 24, TIME '13:00', NULL)
  ) AS x(n, s, t, f, v, ent, sal);

-- Case i: child 14 leaves S1 and enters S4 within the same service. Today
-- UNIQUE (nino_id, fecha, turno_id) forbids that second row, so the
-- constraint is dropped inside this rolled-back transaction: the case proves
-- the report itself counts distinct children (a move done as check-out plus
-- check-in must not double count).
ALTER TABLE public.ninos_checkins DROP CONSTRAINT ninos_checkins_un_turno;
INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_at, salida_at)
VALUES (pg_temp.id('us', 14), pg_temp.id('sa', 4), pg_temp.ctx('turno')::uuid, pg_temp.ctx('campus')::uuid,
        DATE '2099-03-08', pg_temp.id('vi', 19), '1235', DATE '2099-03-08' + TIME '13:25', NULL);

GRANT INSERT, SELECT, UPDATE ON t_nr_failures, t_nr_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text), pg_temp.rep(date), pg_temp.rep2(date, date), pg_temp.fmt(jsonb),
  pg_temp.dia_de(jsonb, date), pg_temp.mes_de(jsonb, date) TO authenticated, anon;

SET LOCAL ROLE authenticated;

-- ── a. flag ──────────────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('a: the coordinator may see reports',
  $q$SELECT public.ninos_puede_configurar_algun_area()::text$q$, 'true');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: the anfitrión may not',
  $q$SELECT public.ninos_puede_configurar_algun_area()::text$q$, 'false');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('a: a random user may not',
  $q$SELECT public.ninos_puede_configurar_algun_area()::text$q$, 'false');

-- ── b. authority and range ───────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('b: the anfitrión gets sin_autoridad',
  $q$SELECT pg_temp.rep()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('b: a random user gets sin_autoridad',
  $q$SELECT pg_temp.rep()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('b: hasta before desde is rango_invalido',
  $q$SELECT public.ninos_reporte_asistencia(DATE '2099-02-10', DATE '2099-01-04')$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('b: more than 366 days is rango_invalido',
  $q$SELECT public.ninos_reporte_asistencia(DATE '2097-01-04', DATE '2099-01-04')$q$, '22023', 'rango_invalido');

-- ── c. per room ──────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('c: per room fecha:ninos:pico:capacidad',
  $q$SELECT string_agg((e ->> 'fecha') || ':' || (e ->> 'ninos') || ':' || (e ->> 'pico') || ':' || (e ->> 'capacidad'), ',')
       FROM jsonb_array_elements(pg_temp.rep() -> 'salones') e$q$,
  '2099-01-04:2:2:2,2099-01-11:2:2:2,2099-02-08:2:1:2');
SELECT pg_temp.assert_eq('c: the room of another area is never read',
  $q$SELECT count(*)::text FROM jsonb_array_elements(pg_temp.rep() -> 'salones') e WHERE e ->> 'salon' = 'ZZ Nr S2'$q$, '0');

-- ── d. per day ───────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('d: distinct children per day',
  $q$SELECT string_agg((e ->> 'fecha') || ':' || (e ->> 'ninos'), ',') FROM jsonb_array_elements(pg_temp.rep() -> 'dias') e$q$,
  '2099-01-04:2,2099-01-11:2,2099-02-08:2');

-- ── e. new children ──────────────────────────────────────────────────

SELECT pg_temp.assert_eq('e: only the first check-in ever counts as new, with the parent',
  $q$SELECT string_agg((e ->> 'nombre') || ':' || (e -> 'padres' ->> 0), ',')
       FROM jsonb_array_elements(pg_temp.rep(DATE '2099-02-01') -> 'nuevos') e$q$,
  'ZZ Nino N7:ZZ Padre P10');
SELECT pg_temp.assert_eq('e: over the whole range every child of S1 is new',
  $q$SELECT jsonb_array_length(pg_temp.rep() -> 'nuevos')::text$q$, '3');

-- ── f. stopped coming ────────────────────────────────────────────────

SELECT pg_temp.assert_eq('f: reference Sunday and who stopped coming',
  $q$SELECT (pg_temp.rep() ->> 'domingo_referencia') || '|' ||
            (SELECT string_agg((e ->> 'nombre') || ':' || (e ->> 'veces') || ':' || (e ->> 'ultima_fecha'), ',')
               FROM jsonb_array_elements(pg_temp.rep() -> 'ausentes') e)$q$,
  '2099-02-08|ZZ Nino N5:2:2099-01-11');

-- ── h. distinct children per Sunday, service and area (N16) ─────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('h: a child in both services counts once in the Sunday and in its area, once per service',
  $q$SELECT pg_temp.fmt(pg_temp.dia_de(pg_temp.rep2(DATE '2099-02-15', DATE '2099-04-12'), DATE '2099-03-01'))$q$,
  '5/7|T1:5/5,T2:2/2|upstreet:2/3,waumba:4/4');

-- ── i. moved between rooms within one service (N16) ─────────────────

SELECT pg_temp.assert_eq('i: a child moved between rooms within one service counts once',
  $q$SELECT pg_temp.fmt(pg_temp.dia_de(pg_temp.rep2(DATE '2099-02-15', DATE '2099-04-12'), DATE '2099-03-08'))$q$,
  '2/3|T1:2/3|upstreet:1/2,waumba:1/1');
SELECT pg_temp.assert_eq('i: per room rows carry distinct children and check-ins',
  $q$SELECT string_agg((s.e ->> 'salon') || ':' || (s.e ->> 'ninos') || ':' || (s.e ->> 'checkins'), ',' ORDER BY s.i)
       FROM jsonb_array_elements(pg_temp.rep2(DATE '2099-03-08', DATE '2099-03-08') -> 'salones') WITH ORDINALITY AS s(e, i)$q$,
  'ZZ Nr S1:1:1,ZZ Nr S3:1:1,ZZ Nr S4:1:1');

-- ── j. months (N16) ──────────────────────────────────────────────────

SELECT pg_temp.assert_eq('j: one row per calendar month, empty months kept, partial months flagged',
  $q$SELECT string_agg(concat_ws('|', m.e ->> 'mes', m.e ->> 'desde', m.e ->> 'hasta', m.e ->> 'parcial',
                                 m.e ->> 'ninos', m.e ->> 'checkins', m.e ->> 'dias', coalesce(m.e ->> 'promedio', '-'),
                                 m.e ->> 'nuevos', m.e ->> 'familias_nuevas'), ',' ORDER BY m.i)
       FROM jsonb_array_elements(pg_temp.rep2(DATE '2099-02-15', DATE '2099-04-12') -> 'meses') WITH ORDINALITY AS m(e, i)$q$,
  '2099-02-01|2099-02-15|2099-02-28|true|0|0|0|-|0|0,'
  '2099-03-01|2099-03-01|2099-03-31|false|6|11|3|2.7|6|5,'
  '2099-04-01|2099-04-01|2099-04-12|true|3|3|2|1.5|2|2');
SELECT pg_temp.assert_eq('j: a month total is not the sum of its Sundays when children repeat',
  $q$SELECT (pg_temp.mes_de(r.r, DATE '2099-03-01') ->> 'ninos') || ' of ' ||
            (SELECT sum((d ->> 'ninos')::int) FROM jsonb_array_elements(r.r -> 'dias') d WHERE d ->> 'fecha' LIKE '2099-03-%')
       FROM (SELECT pg_temp.rep2(DATE '2099-02-15', DATE '2099-04-12') AS r) r$q$,
  '6 of 8');
SELECT pg_temp.assert_eq('j: per service and per area figures of a month are distinct too',
  $q$SELECT pg_temp.fmt(pg_temp.mes_de(pg_temp.rep2(DATE '2099-02-15', DATE '2099-04-12'), DATE '2099-03-01'))$q$,
  '6/11|T1:6/9,T2:2/2|upstreet:3/6,waumba:4/5');

-- ── k. whole range (N16) ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('k: whole range distinct children, per service and per area',
  $q$SELECT pg_temp.fmt(pg_temp.rep2(DATE '2099-02-15', DATE '2099-04-12') -> 'totales')$q$,
  '8/14|T1:8/12,T2:2/2|upstreet:3/6,waumba:6/8');
SELECT pg_temp.assert_eq('k: whole range service days, average per service day, new children and families',
  $q$SELECT concat_ws('|', t.t ->> 'dias', t.t ->> 'promedio', t.t ->> 'nuevos', t.t ->> 'familias_nuevas')
       FROM (SELECT pg_temp.rep2(DATE '2099-02-15', DATE '2099-04-12') -> 'totales' AS t) t$q$,
  '5|2.2|8|7');

-- ── l. return states of new children (N16) ──────────────────────────

SELECT pg_temp.assert_eq('l: estado, visitas, ultima_fecha and family state of each new child',
  $q$SELECT string_agg(concat_ws(':', replace(n.e ->> 'nombre', 'ZZ Nino ', ''), n.e ->> 'estado', n.e ->> 'visitas',
                                 n.e ->> 'ultima_fecha', n.e ->> 'estado_familia'), ',' ORDER BY n.i)
       FROM jsonb_array_elements(pg_temp.rep2(DATE '2099-03-01', DATE '2099-04-12') -> 'nuevos') WITH ORDINALITY AS n(e, i)$q$,
  'N11:volvio:2:2099-03-15:volvio,N12:volvio:3:2099-04-05:volvio,N13:no_volvio:1:2099-03-01:no_volvio,'
  'N15:volvio:2:2099-03-15:volvio,N16:no_volvio:1:2099-03-01:volvio,N14:no_volvio:1:2099-03-08:no_volvio,'
  'N17:no_volvio:1:2099-04-05:no_volvio,N18:pendiente:1:2099-04-12:pendiente');
SELECT pg_temp.assert_eq('l: a return after hasta still counts (no upper date bound)',
  $q$SELECT string_agg(concat_ws(':', replace(n.e ->> 'nombre', 'ZZ Nino ', ''), n.e ->> 'estado', n.e ->> 'visitas'), ',' ORDER BY n.i)
       FROM jsonb_array_elements(pg_temp.rep2(DATE '2099-03-01', DATE '2099-03-01') -> 'nuevos') WITH ORDINALITY AS n(e, i)$q$,
  'N11:volvio:2,N12:volvio:3,N13:no_volvio:1,N15:volvio:2,N16:no_volvio:1');
SELECT pg_temp.assert_eq('l: the N7 range keeps its new children and gains their states',
  $q$SELECT string_agg(concat_ws(':', replace(n.e ->> 'nombre', 'ZZ Nino ', ''), n.e ->> 'estado'), ',' ORDER BY n.i)
       FROM jsonb_array_elements(pg_temp.rep() -> 'nuevos') WITH ORDINALITY AS n(e, i)$q$,
  'N5:volvio,N6:volvio,N7:no_volvio');

-- ── g. anon ──────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('g: anon cannot execute ninos_reporte_asistencia',
  $q$SELECT public.ninos_reporte_asistencia(DATE '2099-01-04', DATE '2099-02-10')$q$, '42501');
SELECT pg_temp.assert_raises('g: anon cannot execute ninos_puede_configurar_algun_area',
  $q$SELECT public.ninos_puede_configurar_algun_area()$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_nr_failures;

ROLLBACK;
