-- N4 (odd/tasks/ninos-checkin.md) — check-in screen support
-- (20261008143000_ninos_checkin_pantalla.sql).
--
-- Covers:
--   a. New-parent data matching an existing phone is refused (padre_existente);
--      no silent reuse.
--   b. ninos_buscar_padre returns the match with a masked phone; registering
--      with the explicit padre.id reuses the parent.
--   c. ninos_actualizar_nino edits nombre, apellido, fecha_nacimiento and
--      genero, validates them and only touches children with a ficha.
--   d. ninos_ocupacion counts open check-ins per room, per date and turno.
--   e. A random user is denied; f. anon cannot execute the RPCs.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION (activo in A), 2 RANDOM.
-- Tree: R → W → A ("Anfitriones"). Room S1 in W on the Barquisimeto campus.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_np_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_np_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_np_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9500000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9401' WHEN 'us' THEN '9402' WHEN 'eq' THEN '9404'
                       WHEN 'ro' THEN '9405' WHEN 'sa' THEN '9406' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_np_ctx WHERE k = p_k;
$$;

-- A family payload: parent with the test phone, the given children.
CREATE OR REPLACE FUNCTION pg_temp.familia(p_padre_nombre text, p_hijos jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'padre', jsonb_build_object('nombre', p_padre_nombre, 'apellido', 'ZZ Np', 'telefono', '0412-999 0927',
                                'cedula', NULL, 'genero', 'Femenino'),
    'hijos', p_hijos,
    'autorizados', '[{"nombre": "ZZ Abuela Np", "telefono": "04129990928", "relacion": "Abuela"}]'::jsonb);
$$;

CREATE OR REPLACE FUNCTION pg_temp.hijo(p_nombre text, p_nac text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('nombre', p_nombre, 'apellido', 'ZZ Np', 'fecha_nacimiento', p_nac,
                            'genero', 'Masculino', 'grado', NULL, 'alergias', 'ZZ maní', 'cambio_panal', true);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_np_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'np-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Np', 'U' || n, 'np-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 2) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Np R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Np W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Np S1', 20, 0, 59, 1);

GRANT INSERT, SELECT, UPDATE ON t_np_failures, t_np_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text), pg_temp.familia(text, jsonb), pg_temp.hijo(text, text) TO authenticated, anon;


SELECT pg_temp.assert_eq('fixture: the test phone is free',
  $q$SELECT count(*)::text FROM public.usuarios WHERE regexp_replace(telefono, '\D', '', 'g') = '04129990927'$q$, '0');
INSERT INTO t_np_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t
 WHERE t.campus_id = pg_temp.ctx('campus')::uuid AND t.activo ORDER BY t.orden LIMIT 1;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

-- ── a. a new parent registers; the same phone is never reused silently ──

INSERT INTO t_np_ctx (k, v)
SELECT 'r1', public.ninos_registrar_familia(pg_temp.familia('ZZ Ana',
         jsonb_build_array(pg_temp.hijo('ZZ Luis', '2022-03-10'), pg_temp.hijo('ZZ Eva', '2019-06-01'))))::text;
SELECT pg_temp.assert_eq('a: first registration creates the parent',
  $q$SELECT pg_temp.ctx('r1')::jsonb ->> 'padre_nuevo'$q$, 'true');
SELECT pg_temp.assert_raises('a: same phone without padre.id is refused (padre_existente)',
  $q$SELECT public.ninos_registrar_familia(pg_temp.familia('ZZ Otra',
       jsonb_build_array(pg_temp.hijo('ZZ Teo', '2021-01-15'))))$q$, '23505');
DO $$
BEGIN
  PERFORM public.ninos_registrar_familia(pg_temp.familia('ZZ Otra', jsonb_build_array(pg_temp.hijo('ZZ Teo', '2021-01-15'))));
  PERFORM pg_temp.fail('a: padre_existente message', 'no error');
EXCEPTION WHEN unique_violation THEN
  IF SQLERRM <> 'padre_existente' THEN PERFORM pg_temp.fail('a: padre_existente message', SQLERRM); END IF;
END $$;

-- ── b. lookup returns the match masked; explicit id reuses ───────────

SELECT pg_temp.assert_eq('b: lookup by phone finds the parent by id',
  $q$SELECT (x -> 0 ->> 'id') = (pg_temp.ctx('r1')::jsonb ->> 'padre_id') AND jsonb_array_length(x) = 1
       FROM public.ninos_buscar_padre(NULL, '0412 999 0927') x$q$, 'true');
SELECT pg_temp.assert_eq('b: the phone is masked',
  $q$SELECT (x -> 0 ->> 'telefono') || ':' || (x -> 0 ->> 'coincide_por') || ':' || (x -> 0 ->> 'nombre')
       FROM public.ninos_buscar_padre('', '04129990927') x$q$, '•••0927:telefono:ZZ Ana');
SELECT pg_temp.assert_eq('b: the payload never carries the full phone',
  $q$SELECT (public.ninos_buscar_padre(NULL, '04129990927')::text LIKE '%9990927%')::text$q$, 'false');
SELECT pg_temp.assert_eq('b: an unknown phone finds nobody',
  $q$SELECT public.ninos_buscar_padre(NULL, '04129990999')::text$q$, '[]');
INSERT INTO t_np_ctx (k, v)
SELECT 'r2', public.ninos_registrar_familia(jsonb_build_object(
         'padre', jsonb_build_object('id', pg_temp.ctx('r1')::jsonb ->> 'padre_id'),
         'hijos', jsonb_build_array(pg_temp.hijo('ZZ Teo', '2021-01-15'))))::text;
SELECT pg_temp.assert_eq('b: with the explicit id the parent is reused, not VIP',
  $q$SELECT ((pg_temp.ctx('r2')::jsonb ->> 'padre_id') = (pg_temp.ctx('r1')::jsonb ->> 'padre_id'))::text
            || ':' || (pg_temp.ctx('r2')::jsonb ->> 'padre_nuevo')$q$, 'true:false');

-- ── c. edit the child's personal data ────────────────────────────────

SELECT public.ninos_actualizar_nino((pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid,
  '{"nombre": "ZZ Luisito", "apellido": "ZZ Np2", "fecha_nacimiento": "2022-04-11", "genero": "Otro", "alergias": "ZZ soya"}'::jsonb);
RESET ROLE;
SELECT pg_temp.assert_eq('c: name, birth date and gender changed',
  $q$SELECT u.nombre || ':' || u.apellido || ':' || u.fecha_nacimiento::date || ':' || u.genero || ':' || f.alergias
       FROM public.usuarios u JOIN public.ninos_fichas f ON f.usuario_id = u.id
      WHERE u.id = (pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid$q$, 'ZZ Luisito:ZZ Np2:2022-04-11:Otro:ZZ soya');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('c: an invalid gender is refused',
  $q$SELECT public.ninos_actualizar_nino((pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid, '{"genero": "X"}'::jsonb)$q$, '22023');
SELECT pg_temp.assert_raises('c: a blank name is refused',
  $q$SELECT public.ninos_actualizar_nino((pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid, '{"nombre": " "}'::jsonb)$q$, '22023');
SELECT pg_temp.assert_raises('c: a future birth date is refused',
  $q$SELECT public.ninos_actualizar_nino((pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid, '{"fecha_nacimiento": "2999-01-01"}'::jsonb)$q$, '22023');
SELECT pg_temp.assert_raises('c: a non-child usuario cannot be edited',
  $q$SELECT public.ninos_actualizar_nino(pg_temp.id('us', 2), '{"nombre": "ZZ Hack"}'::jsonb)$q$, '22023');

-- ── d. occupancy ─────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('d: an empty room counts 0 of 20',
  $q$SELECT presentes || '/' || capacidad FROM public.ninos_ocupacion(pg_temp.ctx('turno')::uuid, '2030-01-06')
      WHERE salon_id = pg_temp.id('sa', 1)$q$, '0/20');
INSERT INTO t_np_ctx (k, v)
SELECT 'codigo', min(codigo) FROM public.ninos_checkin(
  ARRAY[(pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid, (pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 1)::uuid],
  pg_temp.ctx('turno')::uuid, '2030-01-06', ARRAY[pg_temp.id('sa', 1), pg_temp.id('sa', 1)]);
SELECT pg_temp.assert_eq('d: two check-ins count 2',
  $q$SELECT presentes::text FROM public.ninos_ocupacion(pg_temp.ctx('turno')::uuid, '2030-01-06')
      WHERE salon_id = pg_temp.id('sa', 1)$q$, '2');
SELECT pg_temp.assert_eq('d: another date stays 0',
  $q$SELECT presentes::text FROM public.ninos_ocupacion(pg_temp.ctx('turno')::uuid, '2030-01-13')
      WHERE salon_id = pg_temp.id('sa', 1)$q$, '0');
SELECT public.ninos_checkout(pg_temp.ctx('codigo'), pg_temp.ctx('turno')::uuid, '2030-01-06', 'ZZ Abuela');
SELECT pg_temp.assert_eq('d: checked-out children no longer count',
  $q$SELECT presentes::text FROM public.ninos_ocupacion(pg_temp.ctx('turno')::uuid, '2030-01-06')
      WHERE salon_id = pg_temp.id('sa', 1)$q$, '0');

-- ── e. a random user is denied ───────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('e: a random user cannot look up a parent',
  $q$SELECT public.ninos_buscar_padre(NULL, '04129990927')$q$, '42501');
SELECT pg_temp.assert_raises('e: a random user cannot read occupancy',
  $q$SELECT * FROM public.ninos_ocupacion(pg_temp.ctx('turno')::uuid, '2030-01-06')$q$, '42501');
SELECT pg_temp.assert_raises('e: a random user cannot edit a child',
  $q$SELECT public.ninos_actualizar_nino((pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid, '{"nombre": "x"}'::jsonb)$q$, '42501');

-- ── f. anon ──────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_buscar_padre',
  $q$SELECT public.ninos_buscar_padre(NULL, '04129990927')$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_ocupacion',
  $q$SELECT * FROM public.ninos_ocupacion(gen_random_uuid(), '2030-01-06')$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_np_failures;

ROLLBACK;
