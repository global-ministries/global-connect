-- T2d (odd/tasks/ninos-checkin-pco.md, S9.1, S9.3) — rules at the check-in
-- desk (20261108150000_ninos_mesa_reglas.sql).
--
-- Covers:
--   a. ninos_es_visitante_lote: 0 / 1 / 2 / 3 prior fechas → visitante true
--      until 3 (S9.3: the first 3 visits), the same answer as
--      ninos_es_visitante; the service date and later ones do not count;
--      each child once.
--   b. Its authority and scope: a random user is refused; one child outside
--      the caller's campuses refuses the whole batch; NULL arguments, a NULL
--      id and more than 50 children are 22023.
--   c. ninos_checkin unchanged without p_forzados: the 4-argument call (by
--      position and by name), an explicit NULL and an empty list give the
--      same rows as before and leave forzado_por NULL.
--   d. A forced child is recorded with forzado_por = the caller; its sibling
--      in the same call is not. The server never checks the quota.
--   e. A forced id that is not in the call (or a NULL one) is refused with
--      'forzado_fuera_del_ingreso' and nothing is written.
--   f. Grants: one ninos_checkin and one ninos_es_visitante_lote; anon and
--      PUBLIC run neither; authenticated runs both; empty search_path.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION W, 2 RANDOM.
-- Tree: R → W → Anfitriones. Salón S1 (W, Barquisimeto, 1.º grado).
-- Children K1–K4 (one family, with fichas); K5 has no campus (out of scope).
-- Prior visits before 1 Feb 2099: K1 none, K2 1, K3 2, K4 3 (K4 also on
-- 1 Feb itself and later, which do not count).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_mr_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_mr_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_mr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '')
                                   || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9a00000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9a01' WHEN 'us' THEN '9a02' WHEN 'eq' THEN '9a04'
                       WHEN 'ro' THEN '9a05' WHEN 'sa' THEN '9a06' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_mr_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.k(p_n int) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('k' || p_n)::uuid;
$$;

-- The children of the result as 'K1:0:true,…' (by child number).
CREATE OR REPLACE FUNCTION pg_temp.lote(p_ninos uuid[], p_fecha date) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(k.k || ':' || r.visitas_previas || ':' || r.visitante, ',' ORDER BY k.k)
    FROM public.ninos_es_visitante_lote(p_ninos, p_fecha) r
    JOIN (SELECT 'K' || n AS k, pg_temp.k(n) AS id FROM generate_series(1, 5) n) k ON k.id = r.nino_id;
$$;

-- A check-in result without the code: 'K1:S1:1:20:false,…'.
CREATE OR REPLACE FUNCTION pg_temp.filas(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE format($f$SELECT string_agg(k.k || ':' || CASE WHEN r.salon_id = pg_temp.id('sa', 1) THEN 'S1' ELSE '?' END
                                    || ':' || r.ocupacion || ':' || r.capacidad || ':' || r.sobre_capacidad, ',' ORDER BY k.k)
                     FROM (%s) r
                     JOIN (SELECT 'K' || n AS k, pg_temp.k(n) AS id FROM generate_series(1, 5) n) k ON k.id = r.nino_id$f$, p_sql)
    INTO v;
  RETURN v;
END;
$$;

-- forzado_por of each check-in of a date: 'K1:-,K2:U1' ('-' when none).
CREATE OR REPLACE FUNCTION pg_temp.forzados(p_fecha date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(k.k || ':' || CASE WHEN c.forzado_por IS NULL THEN '-' WHEN c.forzado_por = pg_temp.id('us', 1) THEN 'U1' ELSE c.forzado_por::text END,
                             ',' ORDER BY k.k), 'nada')
    FROM public.ninos_checkins c
    JOIN (SELECT 'K' || n AS k, pg_temp.k(n) AS id FROM generate_series(1, 5) n) k ON k.id = c.nino_id
   WHERE c.fecha = p_fecha;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_mr_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo AND t.tipo = 'semanal' ORDER BY t.hora LIMIT 1;
INSERT INTO t_mr_ctx (k, v)
SELECT 'campus', t.campus_id::text FROM public.dream_team_turnos t WHERE t.id = pg_temp.ctx('turno')::uuid;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'mr-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Mr', 'U' || n, 'mr-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 2) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Mr R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Mr W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 2) n);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Mr S1', 20, 1, 1, -100);

GRANT INSERT, SELECT, UPDATE ON t_mr_failures, t_mr_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text), pg_temp.k(int), pg_temp.lote(uuid[], date), pg_temp.filas(text), pg_temp.forzados(date)
  TO authenticated, anon;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT public.ninos_registrar_familia(jsonb_build_object(
  'padre', jsonb_build_object('nombre', 'ZZ Mr Mamá', 'apellido', 'Prueba', 'telefono', '0414-555-9915', 'genero', 'Femenino'),
  'hijos', jsonb_build_array(
    jsonb_build_object('nombre', 'ZZ Mr Uno', 'apellido', 'Prueba', 'fecha_nacimiento', '2019-05-01', 'genero', 'Femenino', 'grado', 1),
    jsonb_build_object('nombre', 'ZZ Mr Dos', 'apellido', 'Prueba', 'fecha_nacimiento', '2019-06-01', 'genero', 'Masculino', 'grado', 1),
    jsonb_build_object('nombre', 'ZZ Mr Tres', 'apellido', 'Prueba', 'fecha_nacimiento', '2019-07-01', 'genero', 'Femenino', 'grado', 1),
    jsonb_build_object('nombre', 'ZZ Mr Cuatro', 'apellido', 'Prueba', 'fecha_nacimiento', '2019-08-01', 'genero', 'Masculino', 'grado', 1))));
RESET ROLE;
INSERT INTO t_mr_ctx (k, v)
SELECT 'k' || x.n, u.id::text
  FROM (VALUES (1, 'ZZ Mr Uno'), (2, 'ZZ Mr Dos'), (3, 'ZZ Mr Tres'), (4, 'ZZ Mr Cuatro')) x(n, nombre)
  JOIN public.usuarios u ON u.nombre = x.nombre AND u.apellido = 'Prueba';
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 15), 'ZZ Mr Cinco', 'Otra', 'No especificado', 'Masculino');
INSERT INTO t_mr_ctx (k, v) VALUES ('k5', pg_temp.id('us', 15)::text);

-- Prior visits: K2 on 4 Jan, K3 on 4 and 11 Jan,
-- K4 on 4, 11 and 18 Jan, plus 1 Feb (the service) and 8 Feb (later).
INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_por) -- noqa: insert-into
SELECT pg_temp.k(v.n), pg_temp.id('sa', 1), pg_temp.ctx('turno')::uuid, pg_temp.ctx('campus')::uuid, v.f, gen_random_uuid(), '990' || v.n,
       pg_temp.id('us', 1)
  FROM (VALUES (2, DATE '2099-01-04'), (3, DATE '2099-01-04'), (3, DATE '2099-01-11'),
               (4, DATE '2099-01-04'), (4, DATE '2099-01-11'), (4, DATE '2099-01-18'),
               (4, DATE '2099-02-01'), (4, DATE '2099-02-08')) v(n, f);
INSERT INTO t_mr_ctx (k, v) SELECT 'ninos', count(*)::text FROM t_mr_ctx WHERE k ~ '^k[1-5]$';

SELECT pg_temp.assert_eq('fixtures: five children and eight prior check-ins',
  $q$SELECT pg_temp.ctx('ninos') || '|' || (SELECT count(*) FROM public.ninos_checkins WHERE salon_id = pg_temp.id('sa', 1))$q$, '5|8');

SET LOCAL ROLE authenticated;

-- ── b. authority and scope ───────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('b: a random user cannot read visits',
  $q$SELECT pg_temp.lote(ARRAY[pg_temp.k(1)], DATE '2099-02-01')$q$, '42501', 'sin_autoridad');

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('b: one child outside the caller''s campuses refuses the batch',
  $q$SELECT pg_temp.lote(ARRAY[pg_temp.k(1), pg_temp.k(5)], DATE '2099-02-01')$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('b: NULL children', $q$SELECT pg_temp.lote(NULL, DATE '2099-02-01')$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('b: NULL date', $q$SELECT pg_temp.lote(ARRAY[pg_temp.k(1)], NULL)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('b: a NULL id', $q$SELECT pg_temp.lote(ARRAY[pg_temp.k(1), NULL], DATE '2099-02-01')$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('b: more than 50 children',
  $q$SELECT pg_temp.lote(ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 51)), DATE '2099-02-01')$q$, '22023', 'demasiados_ninos');

-- ── a. visitors in a batch ───────────────────────────────────────────

SELECT pg_temp.assert_eq('a: 0, 1, 2 prior fechas are visitors, 3 is a regular',
  $q$SELECT pg_temp.lote(ARRAY[pg_temp.k(4), pg_temp.k(3), pg_temp.k(2), pg_temp.k(1)], DATE '2099-02-01')$q$,
  'K1:0:true,K2:1:true,K3:2:true,K4:3:false');
SELECT pg_temp.assert_eq('a: the same answer as ninos_es_visitante, child by child',
  $q$SELECT string_agg(public.ninos_es_visitante(pg_temp.k(n), DATE '2099-02-01')::text, ',' ORDER BY n) FROM generate_series(1, 4) n$q$,
  'true,true,true,false');
SELECT pg_temp.assert_eq('a: earlier, K4 had fewer prior visits',
  $q$SELECT pg_temp.lote(ARRAY[pg_temp.k(4)], DATE '2099-01-18')$q$, 'K4:2:true');
SELECT pg_temp.assert_eq('a: each child once',
  $q$SELECT pg_temp.lote(ARRAY[pg_temp.k(2), pg_temp.k(2)], DATE '2099-02-01')$q$, 'K2:1:true');
SELECT pg_temp.assert_eq('a: an empty batch returns nothing',
  $q$SELECT count(*)::text FROM public.ninos_es_visitante_lote(ARRAY[]::uuid[], DATE '2099-02-01')$q$, '0');

-- ── c. ninos_checkin without p_forzados ──────────────────────────────

SELECT pg_temp.assert_eq('c: the 4-argument call by position, as before',
  $q$SELECT pg_temp.filas(format('SELECT * FROM public.ninos_checkin(ARRAY[%L::uuid], %L::uuid, DATE %L, ARRAY[%L::uuid])',
       pg_temp.k(1), pg_temp.ctx('turno'), '2099-03-01', pg_temp.id('sa', 1)))$q$,
  'K1:S1:1:20:false');
SELECT pg_temp.assert_eq('c: the 4-argument call by name',
  $q$SELECT pg_temp.filas(format('SELECT * FROM public.ninos_checkin(p_nino_ids => ARRAY[%L::uuid], p_turno_id => %L::uuid, p_fecha => DATE %L, p_salon_ids => ARRAY[%L::uuid])',
       pg_temp.k(1), pg_temp.ctx('turno'), '2099-03-08', pg_temp.id('sa', 1)))$q$,
  'K1:S1:1:20:false');
SELECT pg_temp.assert_eq('c: an explicit NULL list gives the same rows',
  $q$SELECT pg_temp.filas(format('SELECT * FROM public.ninos_checkin(ARRAY[%L::uuid, %L::uuid], %L::uuid, DATE %L, ARRAY[%L::uuid, %L::uuid], NULL)',
       pg_temp.k(1), pg_temp.k(2), pg_temp.ctx('turno'), '2099-03-15', pg_temp.id('sa', 1), pg_temp.id('sa', 1)))$q$,
  'K1:S1:2:20:false,K2:S1:2:20:false');
SELECT pg_temp.assert_eq('c: an empty list gives the same rows',
  $q$SELECT pg_temp.filas(format('SELECT * FROM public.ninos_checkin(ARRAY[%L::uuid], %L::uuid, DATE %L, ARRAY[%L::uuid], ARRAY[]::uuid[])',
       pg_temp.k(1), pg_temp.ctx('turno'), '2099-03-22', pg_temp.id('sa', 1)))$q$,
  'K1:S1:1:20:false');
SELECT pg_temp.assert_eq('c: one code per visit, as before',
  $q$SELECT count(DISTINCT codigo)::text FROM public.ninos_checkin(ARRAY[pg_temp.k(1), pg_temp.k(2)], pg_temp.ctx('turno')::uuid,
       DATE '2099-03-29', ARRAY[pg_temp.id('sa', 1), pg_temp.id('sa', 1)])$q$, '1');
SELECT pg_temp.assert_raises('c: a repeated check-in is still 23505',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[pg_temp.k(1)], pg_temp.ctx('turno')::uuid, DATE '2099-03-29', ARRAY[pg_temp.id('sa', 1)])$q$, '23505');

-- ── d. forced ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('d: K2 forced, K1 not: both go in (the quota is never checked)',
  $q$SELECT pg_temp.filas(format('SELECT * FROM public.ninos_checkin(ARRAY[%L::uuid, %L::uuid], %L::uuid, DATE %L, ARRAY[%L::uuid, %L::uuid], ARRAY[%L::uuid])',
       pg_temp.k(1), pg_temp.k(2), pg_temp.ctx('turno'), '2099-04-05', pg_temp.id('sa', 1), pg_temp.id('sa', 1), pg_temp.k(2)))$q$,
  'K1:S1:2:20:false,K2:S1:2:20:false');
SELECT pg_temp.assert_eq('d: a repeated forced id counts once',
  $q$SELECT pg_temp.filas(format('SELECT * FROM public.ninos_checkin(ARRAY[%L::uuid], %L::uuid, DATE %L, ARRAY[%L::uuid], ARRAY[%L::uuid, %L::uuid])',
       pg_temp.k(3), pg_temp.ctx('turno'), '2099-04-12', pg_temp.id('sa', 1), pg_temp.k(3), pg_temp.k(3)))$q$,
  'K3:S1:1:20:false');

-- ── e. a forced id outside the call ──────────────────────────────────

SELECT pg_temp.assert_raises('e: a forced child not in the call is refused',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[pg_temp.k(1)], pg_temp.ctx('turno')::uuid, DATE '2099-04-19',
       ARRAY[pg_temp.id('sa', 1)], ARRAY[pg_temp.k(3)])$q$, '22023', 'forzado_fuera_del_ingreso');
SELECT pg_temp.assert_raises('e: a NULL forced id is refused',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[pg_temp.k(1)], pg_temp.ctx('turno')::uuid, DATE '2099-04-19',
       ARRAY[pg_temp.id('sa', 1)], ARRAY[NULL]::uuid[])$q$, '22023', 'forzado_fuera_del_ingreso');
RESET ROLE;

SELECT pg_temp.assert_eq('c: no forzado_por without the list',
  $q$SELECT string_agg(f::text || '=' || pg_temp.forzados(f), ' ' ORDER BY f)
       FROM unnest(ARRAY[DATE '2099-03-01', DATE '2099-03-08', DATE '2099-03-15', DATE '2099-03-22', DATE '2099-03-29']) f$q$,
  '2099-03-01=K1:- 2099-03-08=K1:- 2099-03-15=K1:-,K2:- 2099-03-22=K1:- 2099-03-29=K1:-,K2:-');
SELECT pg_temp.assert_eq('d: K2 recorded as forced by the anfitrión, K1 not; K3 forced once',
  $q$SELECT pg_temp.forzados(DATE '2099-04-05') || ' ' || pg_temp.forzados(DATE '2099-04-12')$q$, 'K1:-,K2:U1 K3:U1');
SELECT pg_temp.assert_eq('e: nothing written on the refused calls',
  $q$SELECT pg_temp.forzados(DATE '2099-04-19')$q$, 'nada');
SELECT pg_temp.assert_eq('d: the prior rows keep forzado_por NULL',
  $q$SELECT count(*)::text FROM public.ninos_checkins WHERE salon_id = pg_temp.id('sa', 1) AND fecha < DATE '2099-03-01' AND forzado_por IS NOT NULL$q$, '0');

-- ── f. grants ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('f: one ninos_checkin and one ninos_es_visitante_lote',
  $q$SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ' ; ' ORDER BY p.proname)
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('ninos_checkin', 'ninos_es_visitante_lote')$q$,
  'ninos_checkin(p_nino_ids uuid[], p_turno_id uuid, p_fecha date, p_salon_ids uuid[], p_forzados uuid[])'
  || ' ; ninos_es_visitante_lote(p_nino_ids uuid[], p_fecha date)');
SELECT pg_temp.assert_eq('f: authenticated runs them, anon and PUBLIC do not',
  $q$SELECT string_agg(f || ':' || has_function_privilege('authenticated', f, 'EXECUTE') || has_function_privilege('anon', f, 'EXECUTE')
                       || coalesce((SELECT bool_or(a.grantee = 0) FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = f::regprocedure), false)::text, ',' ORDER BY f)
       FROM unnest(ARRAY['public.ninos_checkin(uuid[], uuid, date, uuid[], uuid[])',
                         'public.ninos_es_visitante_lote(uuid[], date)']) f$q$,
  'public.ninos_checkin(uuid[], uuid, date, uuid[], uuid[]):truefalsefalse,'
  || 'public.ninos_es_visitante_lote(uuid[], date):truefalsefalse');
SELECT pg_temp.assert_eq('f: the definers keep an empty search_path',
  $q$SELECT string_agg(p.proname || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ';'), ',' ORDER BY p.proname)
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('ninos_checkin', 'ninos_es_visitante_lote')$q$,
  'ninos_checkin:true:search_path="",ninos_es_visitante_lote:true:search_path=""');
SELECT pg_temp.assert_eq('f: forzado_por references usuarios',
  $q$SELECT confrelid::regclass::text FROM pg_constraint
      WHERE conrelid = 'public.ninos_checkins'::regclass AND contype = 'f'
        AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.ninos_checkins'::regclass AND attname = 'forzado_por')]$q$,
  'usuarios');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_checkin with the list',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[gen_random_uuid()], gen_random_uuid(), DATE '2099-03-01', ARRAY[gen_random_uuid()], NULL)$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_es_visitante_lote',
  $q$SELECT * FROM public.ninos_es_visitante_lote(ARRAY[gen_random_uuid()], DATE '2099-03-01')$q$, '42501');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_mr_failures;

ROLLBACK;
