-- N11 (odd/tasks/ninos-checkin.md) — an existing adult with no Niños
-- children is found by EXACT cédula or phone, never by a partial name
-- (20261008154000_ninos_buscar_adultos.sql).
--
-- Covers:
--   a. Exact cédula and exact phone (any formatting) find the adult as a
--      family with zero children, sin_hijos = true, masked contact data and
--      no email, address or birth date.
--   b. A partial name, a partial cédula and a partial phone do NOT find them.
--   c. Adding a child with the explicit padre.id works; afterwards the adult
--      is an ordinary family (sin_hijos false) and their name finds them.
--   d. Linking an existing child (found by exact child cédula) to the adult.
--   e. A random user is denied; f. anon cannot execute the search.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ba_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ba_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ba_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9520000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9401' WHEN 'us' THEN '9402' WHEN 'eq' THEN '9404'
                       WHEN 'ro' THEN '9405' WHEN 'sa' THEN '9406' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_ba_ctx WHERE k = p_k;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_ba_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ba-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;

-- 1 anfitrión, 2 random user; 3 adult A with no children (email, address,
-- birth date set: they must never leak); 4 father P; 6 child C with a
-- cédula, linked to P.
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, telefono, cedula, fecha_nacimiento) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Ba', 'U1', 'ba-1@example.test', 'Soltero', 'Otro', NULL, NULL, NULL),
  (pg_temp.id('us', 2), pg_temp.id('au', 2), 'ZZ Ba', 'U2', 'ba-2@example.test', 'Soltero', 'Otro', NULL, NULL, NULL),
  (pg_temp.id('us', 3), NULL, 'ZZ Adela', 'ZZ Ba', 'zz-adela@example.test', 'Casado', 'Femenino', '04129990951', 'V-99990951', '1990-03-03'),
  (pg_temp.id('us', 4), NULL, 'ZZ Pablo', 'ZZ Ba', NULL, 'Casado', 'Masculino', '04129990952', NULL, '1988-01-01'),
  (pg_temp.id('us', 6), NULL, 'ZZ Cami', 'ZZ Ba', NULL, 'No especificado', 'Femenino', NULL, 'V-99990956', '2020-06-06');
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 6), pg_temp.id('us', 4), 'padre', true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Ba R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Ba W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Ba S1', 20, 0, 59, 1);

GRANT INSERT, SELECT, UPDATE ON t_ba_failures, t_ba_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text) TO authenticated, anon;

SELECT pg_temp.assert_eq('fixture: A''s cédula and phone are unique',
  $q$SELECT count(*)::text FROM public.usuarios
      WHERE cedula = 'V-99990951' OR regexp_replace(telefono, '\D', '', 'g') = '04129990951'$q$, '1');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

-- ── a. exact cédula / phone find the adult with zero children ────────

SELECT pg_temp.assert_eq('a: exact cédula finds A with zero children',
  $q$SELECT (f ->> 'sin_hijos') || ':' || jsonb_array_length(f -> 'hijos')
       FROM jsonb_array_elements(public.ninos_buscar_familias('V-99990951')) f
      WHERE f ->> 'id' = pg_temp.id('us', 3)::text$q$, 'true:0');
SELECT pg_temp.assert_eq('a: exact cédula without prefix finds A',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_familias('99990951')) f
      WHERE f ->> 'id' = pg_temp.id('us', 3)::text$q$, '1');
SELECT pg_temp.assert_eq('a: exact phone (formatted) finds A',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_familias('0412-999.09.51')) f
      WHERE f ->> 'id' = pg_temp.id('us', 3)::text$q$, '1');
SELECT pg_temp.assert_eq('a: contact data is masked',
  $q$SELECT (f ->> 'telefono') || '|' || (f ->> 'cedula')
       FROM jsonb_array_elements(public.ninos_buscar_familias('V-99990951')) f
      WHERE f ->> 'id' = pg_temp.id('us', 3)::text$q$, '•••0951|•••0951');
SELECT pg_temp.assert_eq('a: no email, address or birth date anywhere in the result',
  $q$SELECT (public.ninos_buscar_familias('V-99990951')::text ~ '(zz-adela|1990-03-03|email|direccion|fecha_nacimiento)')::text$q$,
  'false');
SELECT pg_temp.assert_eq('a: the parent entry is masked too',
  $q$SELECT f -> 'padres' -> 0 ->> 'telefono'
       FROM jsonb_array_elements(public.ninos_buscar_familias('04129990951')) f
      WHERE f ->> 'id' = pg_temp.id('us', 3)::text$q$, '•••0951');

-- ── b. partial searches never list the adult ─────────────────────────

SELECT pg_temp.assert_eq('b: a partial name does not find A',
  $q$SELECT (jsonb_array_length(public.ninos_buscar_familias('ZZ Adela'))
            + jsonb_array_length(public.ninos_buscar_familias('Adela')))::text$q$, '0');
SELECT pg_temp.assert_eq('b: a partial cédula does not find A',
  $q$SELECT jsonb_array_length(public.ninos_buscar_familias('9999095'))::text$q$, '0');
SELECT pg_temp.assert_eq('b: a partial phone does not find A',
  $q$SELECT jsonb_array_length(public.ninos_buscar_familias('0412999095'))::text$q$, '0');
SELECT pg_temp.assert_eq('b: a child by exact cédula is not returned as an adult',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_familias('V-99990956')) f
      WHERE f ->> 'id' = pg_temp.id('us', 6)::text$q$, '0');

-- ── d. link an existing child found by exact cédula ──────────────────

SELECT pg_temp.assert_eq('d: the child C is found by exact cédula inside P''s family',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_familias('V-99990956')) f,
            jsonb_array_elements(f -> 'hijos') h
      WHERE h ->> 'id' = pg_temp.id('us', 6)::text$q$, '1');
SELECT pg_temp.assert_eq('d: C is linked to A',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 6)], pg_temp.id('us', 3), NULL) ->> 'vinculados'$q$, '1');
SELECT pg_temp.assert_eq('d: A is now a family with C',
  $q$SELECT (f ->> 'sin_hijos') || ':' || (f -> 'hijos' -> 0 ->> 'id')
       FROM jsonb_array_elements(public.ninos_buscar_familias('V-99990951')) f
      WHERE f ->> 'id' = pg_temp.id('us', 3)::text$q$, 'false:' || pg_temp.id('us', 6)::text);
RESET ROLE;
DELETE FROM public.relaciones_usuarios WHERE usuario1_id = pg_temp.id('us', 6) AND usuario2_id = pg_temp.id('us', 3);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

-- ── c. add a child to A with the explicit padre.id ───────────────────

SELECT pg_temp.assert_eq('c: registrar_familia with padre.id adds a child to A',
  $q$SELECT public.ninos_registrar_familia(jsonb_build_object(
       'padre', jsonb_build_object('id', pg_temp.id('us', 3)),
       'hijos', jsonb_build_array(jsonb_build_object('nombre', 'ZZ Lia', 'apellido', 'ZZ Ba',
                 'fecha_nacimiento', '2021-01-01', 'genero', 'Femenino')),
       'autorizados', '[]'::jsonb)) ->> 'padre_id'$q$, pg_temp.id('us', 3)::text);
SELECT pg_temp.assert_eq('c: A is now an ordinary family with one child',
  $q$SELECT (f ->> 'sin_hijos') || ':' || jsonb_array_length(f -> 'hijos')
       FROM jsonb_array_elements(public.ninos_buscar_familias('V-99990951')) f
      WHERE f ->> 'id' = pg_temp.id('us', 3)::text$q$, 'false:1');
SELECT pg_temp.assert_eq('c: and the name now finds A',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_familias('ZZ Adela')) f
      WHERE f ->> 'id' = pg_temp.id('us', 3)::text$q$, '1');

-- ── e. a random user is denied ───────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('e: a random user cannot search',
  $q$SELECT public.ninos_buscar_familias('V-99990951')$q$, '42501');

-- ── f. anon ──────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_buscar_familias',
  $q$SELECT public.ninos_buscar_familias('V-99990951')$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_ba_failures;

ROLLBACK;
