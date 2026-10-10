-- N7 (odd/tasks/ninos-checkin.md) — attendance reports
-- (20261009120000_ninos_reportes.sql).
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
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION, 2 COORDINADOR, 3 RANDOM;
-- 5..8 children, 10 parent of 7.
-- Tree: R → W → A ("Anfitriones"); X (another area). Rooms S1 in W (cap 2),
-- S2 in X. Sundays 2099-01-04 … 2099-02-08; reference Sunday 2099-02-08.

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

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_nr_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo ORDER BY t.hora LIMIT 1;
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

GRANT INSERT, SELECT, UPDATE ON t_nr_failures, t_nr_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text), pg_temp.rep(date) TO authenticated, anon;

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
