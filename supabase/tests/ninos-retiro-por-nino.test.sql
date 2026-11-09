-- T2a (odd/tasks/ninos-checkin-pco.md, S6 "pickup per child") — the door
-- releases only the children marked (20261108120000_ninos_retiro_por_nino.sql).
--
-- Covers:
--   a. Unchanged: ninos_checkout without the list (4 and 5 arguments, or an
--      explicit NULL) releases every child still inside with the code; a
--      code in a room the caller does not operate is still refused whole.
--   b. One child of two leaves: only that row is written, the other stays
--      inside with the same code, ninos_buscar_codigo shows both, and the
--      sibling is released later with the same code.
--   c. The list is checked as a whole (nothing written on any refusal): an
--      empty list, a child of another code / a random id, a child already
--      out, and a mix of an inside child with a refused one.
--   d. The pickup person is checked against the marked children only: an
--      uncle authorized for one child picks up that child alone and is
--      refused (retiro_no_autorizado) for the sibling.
--   e. Authority per child: the anfitrión releases the child of their room
--      from a code shared with another area's room, never the other one; a
--      random user is refused.
--   f. ninos_retiro_opciones narrows to the marked children; without the
--      list it is unchanged; a child not inside is refused.
--   g. ninos_retiros_recientes: the service's last pickups (who, when, with
--      whom) and the inside / out counts of the rooms the caller operates;
--      a random user is refused.
--   h. Grants: one function per name; anon runs none; authenticated runs all.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION W, 2 RANDOM, 3 ANFITRION U.
-- Tree: R → W → Anfitriones; R → U → Anfitriones. Salones S1 (W), S2 (U).
-- Family: children K1, K2 (mother, grandmother for both; uncle for K1 only);
-- K3 is a child checked in directly into S2 with K1's code on 22 Mar.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_rn_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_rn_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_rn_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9900000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9901' WHEN 'us' THEN '9902' WHEN 'eq' THEN '9904'
                       WHEN 'ro' THEN '9905' WHEN 'sa' THEN '9906' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_rn_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.k(p_n int) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('k' || p_n)::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.codigo(p_fecha date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('codigo ' || p_fecha::text);
$$;

-- ninos_checkout with the list, on the fixture turno.
CREATE OR REPLACE FUNCTION pg_temp.retirar(p_fecha date, p_quien text, p_ninos uuid[], p_motivo text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT count(*)::int FROM public.ninos_checkout(pg_temp.codigo(p_fecha), pg_temp.ctx('turno')::uuid, p_fecha,
                                                          p_quien, p_motivo, p_ninos));
END;
$$;

-- Who is still inside on a date (as postgres): 'K1,K2' or '-'.
CREATE OR REPLACE FUNCTION pg_temp.adentro(p_fecha date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(x.k, ',' ORDER BY x.k), '-')
    FROM (SELECT 'K' || n AS k FROM generate_series(1, 3) n
            JOIN public.ninos_checkins c ON c.nino_id = pg_temp.k(n)
           WHERE c.fecha = p_fecha AND c.turno_id = pg_temp.ctx('turno')::uuid AND c.salida_at IS NULL) x;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_rn_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo AND t.tipo = 'semanal' ORDER BY t.hora LIMIT 1;
INSERT INTO t_rn_ctx (k, v)
SELECT 'campus', t.campus_id::text FROM public.dream_team_turnos t WHERE t.id = pg_temp.ctx('turno')::uuid;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'rn-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 3) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Rn', 'U' || n, 'rn-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 3) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Rn R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Rn W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', pg_temp.id('eq', 1), 'ZZ Rn U', true),
  (pg_temp.id('eq', 5), 'ninos', pg_temp.id('eq', 4), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 5), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 3), pg_temp.id('eq', 5), pg_temp.id('ro', 2), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 3) n);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Rn S1', 20, 1, 1, -100),
  (pg_temp.id('sa', 2), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 4), 'upstreet', 'ZZ Rn S2', 20, 2, 2, -99);

GRANT INSERT, SELECT, UPDATE ON t_rn_failures, t_rn_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text), pg_temp.k(int), pg_temp.codigo(date), pg_temp.retirar(date, text, uuid[], text)
  TO authenticated, anon;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT public.ninos_registrar_familia(jsonb_build_object(
  'padre', jsonb_build_object('nombre', 'ZZ Rn Mamá', 'apellido', 'Prueba', 'telefono', '0414-555-9901', 'genero', 'Femenino'),
  'hijos', jsonb_build_array(
    jsonb_build_object('nombre', 'ZZ Rn Uno', 'apellido', 'Prueba', 'fecha_nacimiento', '2019-05-01', 'genero', 'Femenino', 'grado', 1),
    jsonb_build_object('nombre', 'ZZ Rn Dos', 'apellido', 'Prueba', 'fecha_nacimiento', '2019-06-01', 'genero', 'Masculino', 'grado', 1)),
  'autorizados', jsonb_build_array(jsonb_build_object('nombre', 'ZZ Rn Abuela', 'telefono', '04120009901', 'relacion', 'Abuela'))));
RESET ROLE;
INSERT INTO t_rn_ctx (k, v)
SELECT 'k1', u.id::text FROM public.usuarios u WHERE u.nombre = 'ZZ Rn Uno' AND u.apellido = 'Prueba';
INSERT INTO t_rn_ctx (k, v)
SELECT 'k2', u.id::text FROM public.usuarios u WHERE u.nombre = 'ZZ Rn Dos' AND u.apellido = 'Prueba';
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 13), 'ZZ Rn Tres', 'Otra', 'No especificado', 'Masculino');
INSERT INTO t_rn_ctx (k, v) VALUES ('k3', pg_temp.id('us', 13)::text);
INSERT INTO public.ninos_autorizados_retiro (nino_id, nombre, relacion) VALUES (pg_temp.k(1), 'ZZ Rn Tío', 'Tío');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
INSERT INTO t_rn_ctx (k, v)
SELECT 'codigo ' || f::text, (SELECT min(codigo) FROM public.ninos_checkin(ARRAY[pg_temp.k(1), pg_temp.k(2)],
         pg_temp.ctx('turno')::uuid, f, ARRAY[pg_temp.id('sa', 1), pg_temp.id('sa', 1)]))
  FROM unnest(ARRAY[DATE '2099-03-01', DATE '2099-03-08', DATE '2099-03-15', DATE '2099-04-05']) f;
INSERT INTO t_rn_ctx (k, v)
SELECT 'codigo 2099-03-22', min(codigo) FROM public.ninos_checkin(ARRAY[pg_temp.k(1)], pg_temp.ctx('turno')::uuid,
  DATE '2099-03-22', ARRAY[pg_temp.id('sa', 1)]);
RESET ROLE;
-- 22 Mar: K3 shares K1's code in the other area's room (S2).
INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_por) -- noqa: insert-into
SELECT pg_temp.k(3), pg_temp.id('sa', 2), c.turno_id, c.campus_id, c.fecha, c.visita_id, c.codigo, pg_temp.id('us', 3)
  FROM public.ninos_checkins c WHERE c.nino_id = pg_temp.k(1) AND c.fecha = DATE '2099-03-22';

SELECT pg_temp.assert_eq('fixtures: four family codes and the shared code',
  $q$SELECT count(*)::text FROM t_rn_ctx WHERE k LIKE 'codigo %' AND v ~ '^[0-9]{4}$'$q$, '5');

SET LOCAL ROLE authenticated;

-- ── e. a random user ─────────────────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('e: a random user cannot release one child',
  $q$SELECT pg_temp.retirar(DATE '2099-03-08', 'ZZ Rn Abuela', ARRAY[pg_temp.k(1)])$q$, '42501');
SELECT pg_temp.assert_raises('e: a random user cannot read the last pickups',
  $q$SELECT public.ninos_retiros_recientes(pg_temp.ctx('turno')::uuid, DATE '2099-03-08')$q$, '42501');

-- ── a. without the list: the whole code, unchanged ───────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('a: 4 arguments release both children',
  $q$SELECT count(*)::text FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-03-01'), pg_temp.ctx('turno')::uuid, DATE '2099-03-01', 'ZZ Rn Abuela')$q$,
  '2');
SELECT pg_temp.assert_eq('a: an explicit NULL list releases both children',
  $q$SELECT pg_temp.retirar(DATE '2099-04-05', 'ZZ Rn Abuela', NULL)::text$q$, '2');
SELECT pg_temp.assert_raises('a: without the list a code shared with another area''s room is refused whole',
  $q$SELECT * FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-03-22'), pg_temp.ctx('turno')::uuid, DATE '2099-03-22', 'ZZ Rn Abuela', NULL)$q$,
  '42501');

-- ── c. the list is checked as a whole ────────────────────────────────

SELECT pg_temp.assert_raises('c: an empty list is refused',
  $q$SELECT pg_temp.retirar(DATE '2099-03-08', 'ZZ Rn Abuela', ARRAY[]::uuid[])$q$, '22023', 'sin_ninos');
SELECT pg_temp.assert_raises('c: a random id is refused',
  $q$SELECT pg_temp.retirar(DATE '2099-03-08', 'ZZ Rn Abuela', ARRAY[pg_temp.k(1), gen_random_uuid()])$q$, '22023', 'nino_no_esta_adentro');
SELECT pg_temp.assert_raises('c: a child of another code is refused',
  $q$SELECT pg_temp.retirar(DATE '2099-03-08', 'ZZ Rn Abuela', ARRAY[pg_temp.k(1), pg_temp.k(3)])$q$, '22023', 'nino_no_esta_adentro');

-- ── d / b. one child of two ──────────────────────────────────────────

SELECT pg_temp.assert_raises('d: the uncle (only K1''s list) cannot take K2',
  $q$SELECT pg_temp.retirar(DATE '2099-03-08', 'ZZ Rn Tío', ARRAY[pg_temp.k(1), pg_temp.k(2)])$q$, '22023', 'retiro_no_autorizado');
SELECT pg_temp.assert_eq('f: the options for K1 alone add the uncle',
  $q$SELECT string_agg(nombre || ':' || tipo, ',' ORDER BY tipo DESC, nombre)
       FROM public.ninos_retiro_opciones(pg_temp.codigo(DATE '2099-03-08'), pg_temp.ctx('turno')::uuid, DATE '2099-03-08', ARRAY[pg_temp.k(1)])$q$,
  'ZZ Rn Mamá Prueba:representante,ZZ Rn Abuela:autorizado,ZZ Rn Tío:autorizado');
SELECT pg_temp.assert_eq('f: without the list the options are the shared ones (unchanged)',
  $q$SELECT string_agg(nombre || ':' || tipo, ',' ORDER BY tipo DESC, nombre)
       FROM public.ninos_retiro_opciones(pg_temp.codigo(DATE '2099-03-08'), pg_temp.ctx('turno')::uuid, DATE '2099-03-08')$q$,
  'ZZ Rn Mamá Prueba:representante,ZZ Rn Abuela:autorizado');
SELECT pg_temp.assert_raises('f: the options refuse a child not inside with the code',
  $q$SELECT * FROM public.ninos_retiro_opciones(pg_temp.codigo(DATE '2099-03-08'), pg_temp.ctx('turno')::uuid, DATE '2099-03-08', ARRAY[pg_temp.k(3)])$q$,
  '22023', 'nino_no_esta_adentro');
SELECT pg_temp.assert_eq('b: the uncle takes K1 alone',
  $q$SELECT string_agg(nino_id::text, ',') FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-03-08'), pg_temp.ctx('turno')::uuid,
       DATE '2099-03-08', 'ZZ Rn Tío', NULL, ARRAY[pg_temp.k(1)])$q$,
  pg_temp.k(1)::text);
SELECT pg_temp.assert_eq('b: the lookup by the same code shows K1 out with the uncle and K2 inside',
  $q$SELECT string_agg(nombre || ':' || coalesce(retirado_por_nombre, 'adentro'), ',' ORDER BY nombre)
       FROM public.ninos_buscar_codigo(pg_temp.codigo(DATE '2099-03-08'), pg_temp.ctx('turno')::uuid, DATE '2099-03-08')$q$,
  'ZZ Rn Dos:adentro,ZZ Rn Uno:ZZ Rn Tío');
SELECT pg_temp.assert_raises('c: K1 already out is refused',
  $q$SELECT pg_temp.retirar(DATE '2099-03-08', 'ZZ Rn Abuela', ARRAY[pg_temp.k(1)])$q$, '22023', 'nino_no_esta_adentro');
SELECT pg_temp.assert_raises('c: K1 already out with K2 inside is refused whole',
  $q$SELECT pg_temp.retirar(DATE '2099-03-08', 'ZZ Rn Abuela', ARRAY[pg_temp.k(2), pg_temp.k(1)])$q$, '22023', 'nino_no_esta_adentro');
SELECT pg_temp.assert_raises('f: the options refuse K1 already out',
  $q$SELECT * FROM public.ninos_retiro_opciones(pg_temp.codigo(DATE '2099-03-08'), pg_temp.ctx('turno')::uuid, DATE '2099-03-08', ARRAY[pg_temp.k(1)])$q$,
  '22023', 'nino_no_esta_adentro');
SELECT pg_temp.assert_eq('f: without the list the options now follow K2 alone',
  $q$SELECT string_agg(nombre, ',' ORDER BY nombre)
       FROM public.ninos_retiro_opciones(pg_temp.codigo(DATE '2099-03-08'), pg_temp.ctx('turno')::uuid, DATE '2099-03-08')$q$,
  'ZZ Rn Abuela,ZZ Rn Mamá Prueba');

-- g. last pickups after K1 left on 8 Mar (K2 still inside).
SELECT pg_temp.assert_eq('g: the last pickup, the counts and nothing of other dates',
  $q$SELECT r ->> 'adentro' || '|' || (r ->> 'salieron') || '|' ||
            (SELECT string_agg(x ->> 'nombre' || ' ' || (x ->> 'apellido') || ':' || (x ->> 'salon') || ':' || (x ->> 'retirado_por_nombre')
                               || ':' || (x ->> 'otra_persona') || ':' || ((x ->> 'salida_at') IS NOT NULL), ',')
               FROM jsonb_array_elements(r -> 'retiros') x)
       FROM public.ninos_retiros_recientes(pg_temp.ctx('turno')::uuid, DATE '2099-03-08') r$q$,
  '1|1|ZZ Rn Uno Prueba:ZZ Rn S1:ZZ Rn Tío:false:true');

SELECT pg_temp.assert_eq('b: K2 leaves later with the same code',
  $q$SELECT pg_temp.retirar(DATE '2099-03-08', 'ZZ Rn Abuela', ARRAY[pg_temp.k(2)])::text$q$, '1');
SELECT pg_temp.assert_eq('b: a repeated id releases the child once',
  $q$SELECT pg_temp.retirar(DATE '2099-03-15', 'ZZ Rn Vecina', ARRAY[pg_temp.k(2), pg_temp.k(2)], 'La mamá avisó')::text$q$, '1');
SELECT pg_temp.assert_eq('g: the newest pickup first, with the other-person flag',
  $q$SELECT r ->> 'adentro' || '|' || (r ->> 'salieron') || '|' || (r -> 'retiros' -> 0 ->> 'retirado_por_nombre') || ':' || (r -> 'retiros' -> 0 ->> 'otra_persona')
       FROM public.ninos_retiros_recientes(pg_temp.ctx('turno')::uuid, DATE '2099-03-15') r$q$,
  '1|1|ZZ Rn Vecina:true');
SELECT pg_temp.assert_eq('g: the limit is respected',
  $q$SELECT jsonb_array_length(r -> 'retiros')::text || '|' || (r ->> 'salieron')
       FROM public.ninos_retiros_recientes(pg_temp.ctx('turno')::uuid, DATE '2099-03-01', 1) r$q$,
  '1|2');

-- ── e. authority per child ───────────────────────────────────────────

SELECT pg_temp.assert_raises('e: the W anfitrión cannot release K3 of the U room',
  $q$SELECT pg_temp.retirar(DATE '2099-03-22', 'ZZ Rn Abuela', ARRAY[pg_temp.k(3)], 'Motivo')$q$, '42501');
SELECT pg_temp.assert_raises('e: nor K1 and K3 together',
  $q$SELECT pg_temp.retirar(DATE '2099-03-22', 'ZZ Rn Mamá Prueba', ARRAY[pg_temp.k(1), pg_temp.k(3)], 'Motivo')$q$, '42501');
SELECT pg_temp.assert_eq('g: the W anfitrión counts only the rooms they operate',
  $q$SELECT r ->> 'adentro' || '|' || (r ->> 'salieron')
       FROM public.ninos_retiros_recientes(pg_temp.ctx('turno')::uuid, DATE '2099-03-22') r$q$,
  '1|0');
SELECT pg_temp.assert_eq('e: the W anfitrión releases K1 of their room',
  $q$SELECT pg_temp.retirar(DATE '2099-03-22', 'ZZ Rn Mamá Prueba', ARRAY[pg_temp.k(1)])::text$q$, '1');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('e: the U anfitrión releases K3 of theirs (another person, with a reason)',
  $q$SELECT pg_temp.retirar(DATE '2099-03-22', 'ZZ Rn Vecina', ARRAY[pg_temp.k(3)], 'Su papá avisó')::text$q$, '1');
SELECT pg_temp.assert_eq('g: the U anfitrión sees only K3 of their room',
  $q$SELECT r ->> 'adentro' || '|' || (r ->> 'salieron') || '|' || (r -> 'retiros' -> 0 ->> 'nombre')
       FROM public.ninos_retiros_recientes(pg_temp.ctx('turno')::uuid, DATE '2099-03-22') r$q$,
  '0|1|ZZ Rn Tres');
RESET ROLE;

-- ── nothing written on any refusal ───────────────────────────────────

SELECT pg_temp.assert_eq('c: who is inside at the end of the test',
  $q$SELECT string_agg(f::text || '=' || pg_temp.adentro(f), ' ' ORDER BY f)
       FROM unnest(ARRAY[DATE '2099-03-01', DATE '2099-03-08', DATE '2099-03-15', DATE '2099-03-22', DATE '2099-04-05']) f$q$,
  '2099-03-01=- 2099-03-08=- 2099-03-15=K1 2099-03-22=- 2099-04-05=-');
SELECT pg_temp.assert_eq('b/d: who picked up each child on 8 Mar (the refusals wrote nothing)',
  $q$SELECT string_agg(u.nombre || ':' || c.retirado_por_nombre || ':' || c.retiro_otra_persona, ',' ORDER BY u.nombre)
       FROM public.ninos_checkins c JOIN public.usuarios u ON u.id = c.nino_id
      WHERE c.fecha = DATE '2099-03-08' AND c.turno_id = pg_temp.ctx('turno')::uuid AND c.nino_id IN (pg_temp.k(1), pg_temp.k(2))$q$,
  'ZZ Rn Dos:ZZ Rn Abuela:false,ZZ Rn Uno:ZZ Rn Tío:false');
SELECT pg_temp.assert_eq('e: K3 was released by the U anfitrión, flagged with the reason',
  $q$SELECT (salida_por = pg_temp.id('us', 3))::text || ':' || retiro_motivo FROM public.ninos_checkins
      WHERE nino_id = pg_temp.k(3) AND fecha = DATE '2099-03-22'$q$,
  'true:Su papá avisó');

-- ── h. grants ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('h: one ninos_checkout and one ninos_retiro_opciones',
  $q$SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ' ; ' ORDER BY p.proname)
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('ninos_checkout', 'ninos_retiro_opciones', 'ninos_retiros_recientes')$q$,
  'ninos_checkout(p_codigo text, p_turno_id uuid, p_fecha date, p_retirado_por text, p_motivo_otra text, p_nino_ids uuid[])'
  || ' ; ninos_retiro_opciones(p_codigo text, p_turno_id uuid, p_fecha date, p_nino_ids uuid[])'
  || ' ; ninos_retiros_recientes(p_turno_id uuid, p_fecha date, p_limite integer)');
SELECT pg_temp.assert_eq('h: authenticated runs them, anon and PUBLIC do not',
  $q$SELECT string_agg(f || ':' || has_function_privilege('authenticated', f, 'EXECUTE') || has_function_privilege('anon', f, 'EXECUTE')
                       || (SELECT bool_or(a.grantee = 0) FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = f::regprocedure)::text, ',' ORDER BY f)
       FROM unnest(ARRAY['public.ninos_checkout(text, uuid, date, text, text, uuid[])',
                         'public.ninos_retiro_opciones(text, uuid, date, uuid[])',
                         'public.ninos_retiros_recientes(uuid, date, integer)']) f$q$,
  'public.ninos_checkout(text, uuid, date, text, text, uuid[]):truefalsefalse,'
  || 'public.ninos_retiro_opciones(text, uuid, date, uuid[]):truefalsefalse,'
  || 'public.ninos_retiros_recientes(uuid, date, integer):truefalsefalse');
SELECT pg_temp.assert_eq('h: the definers keep an empty search_path',
  $q$SELECT string_agg(p.proname || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ';'), ',' ORDER BY p.proname)
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('ninos_checkout', 'ninos_retiro_opciones', 'ninos_retiros_recientes')$q$,
  'ninos_checkout:true:search_path="",ninos_retiro_opciones:true:search_path="",ninos_retiros_recientes:true:search_path=""');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_checkout with the list',
  $q$SELECT * FROM public.ninos_checkout('1234', gen_random_uuid(), DATE '2099-03-01', 'x', NULL, ARRAY[gen_random_uuid()])$q$, '42501');
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_retiros_recientes',
  $q$SELECT public.ninos_retiros_recientes(gen_random_uuid(), DATE '2099-03-01')$q$, '42501');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_rn_failures;

ROLLBACK;
