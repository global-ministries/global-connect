-- N3 (odd/tasks/ninos-checkin.md) — Niños families
-- (20261008142000_ninos_familias.sql).
--
-- Covers:
--   a. An Anfitriones volunteer registers a family (new parent, two children,
--      one pickup person): relations child→padre, fichas, VIP, pickup rows.
--   b. New-parent data with the same phone is refused (padre_existente);
--      the explicit padre.id reuses the parent (no duplicate, not VIP); the
--      search finds the family by phone, by parent name and by child name.
--   c. Registering the same child again for that parent is refused.
--   d. ninos_actualizar_nino edits the ficha and replaces the pickup list.
--   e. Atomicity: an invalid second child rolls back the whole call.
--   f. A random user is denied (register, search, edit).
--   g. anon cannot execute the RPCs.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION (activo in A), 2 RANDOM.
-- Tree: R → W → A ("Anfitriones"). Room S1 in W on the Barquisimeto campus.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_nf_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_nf_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_nf_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9400000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9401' WHEN 'us' THEN '9402' WHEN 'eq' THEN '9404'
                       WHEN 'ro' THEN '9405' WHEN 'sa' THEN '9406' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_nf_ctx WHERE k = p_k;
$$;

-- A family payload: parent with the test phone, the given children.
CREATE OR REPLACE FUNCTION pg_temp.familia(p_padre_nombre text, p_hijos jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'padre', jsonb_build_object('nombre', p_padre_nombre, 'apellido', 'ZZ Nf', 'telefono', '0412-999 0917',
                                'cedula', NULL, 'genero', 'Femenino'),
    'hijos', p_hijos,
    'autorizados', '[{"nombre": "ZZ Abuela Nf", "telefono": "04129990918", "relacion": "Abuela"}]'::jsonb);
$$;

CREATE OR REPLACE FUNCTION pg_temp.hijo(p_nombre text, p_nac text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('nombre', p_nombre, 'apellido', 'ZZ Nf', 'fecha_nacimiento', p_nac,
                            'genero', 'Masculino', 'grado', NULL, 'alergias', 'ZZ maní', 'cambio_panal', true);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_nf_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'nf-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Nf', 'U' || n, 'nf-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 2) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Nf R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Nf W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Nf S1', 20, 0, 59, 1);

GRANT INSERT, SELECT, UPDATE ON t_nf_failures, t_nf_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text), pg_temp.familia(text, jsonb), pg_temp.hijo(text, text) TO authenticated, anon;

-- The test phone must not belong to anyone yet.
SELECT pg_temp.assert_eq('fixture: the test phone is free',
  $q$SELECT count(*)::text FROM public.usuarios WHERE regexp_replace(telefono, '\D', '', 'g') = '04129990917'$q$, '0');

SET LOCAL ROLE authenticated;

-- ── a. the anfitrión registers a new family ──────────────────────────

SELECT pg_temp.as_persona(1);
INSERT INTO t_nf_ctx (k, v)
SELECT 'r1', public.ninos_registrar_familia(pg_temp.familia('ZZ Ana',
         jsonb_build_array(pg_temp.hijo('ZZ Luis', '2022-03-10'), pg_temp.hijo('ZZ Eva', '2019-06-01'))))::text;

SELECT pg_temp.assert_eq('a: a new parent and two children',
  $q$SELECT (pg_temp.ctx('r1')::jsonb ->> 'padre_nuevo') || ':' || jsonb_array_length(pg_temp.ctx('r1')::jsonb -> 'hijos')$q$,
  'true:2');

RESET ROLE;
SELECT pg_temp.assert_eq('a: relaciones child→padre (tipo padre)',
  $q$SELECT count(*)::text FROM public.relaciones_usuarios
      WHERE usuario2_id = (pg_temp.ctx('r1')::jsonb ->> 'padre_id')::uuid AND tipo_relacion = 'padre'$q$, '2');
SELECT pg_temp.assert_eq('a: fichas are VIP since today with the allergy',
  $q$SELECT string_agg((f.es_vip_desde = (now() AT TIME ZONE 'America/Caracas')::date)::text || ':' || f.alergias || ':' || f.cambio_panal, ',')
       FROM public.ninos_fichas f
      WHERE f.usuario_id IN (SELECT jsonb_array_elements_text(pg_temp.ctx('r1')::jsonb -> 'hijos')::uuid)$q$,
  'true:ZZ maní:true,true:ZZ maní:true');
SELECT pg_temp.assert_eq('a: each child got the pickup person',
  $q$SELECT count(*)::text FROM public.ninos_autorizados_retiro
      WHERE nombre = 'ZZ Abuela Nf'
        AND nino_id IN (SELECT jsonb_array_elements_text(pg_temp.ctx('r1')::jsonb -> 'hijos')::uuid)$q$, '2');
SELECT pg_temp.assert_eq('a: the parent phone is stored normalized',
  $q$SELECT telefono FROM public.usuarios WHERE id = (pg_temp.ctx('r1')::jsonb ->> 'padre_id')::uuid$q$,
  public.normalizar_telefono_ve('04129990917'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

-- ── b. same phone refused; explicit id reuses; search ─────────────────────

SELECT pg_temp.assert_raises('b: new-parent data matching an existing phone is refused (padre_existente)',
  $q$SELECT public.ninos_registrar_familia(pg_temp.familia('ZZ Otra',
       jsonb_build_array(pg_temp.hijo('ZZ Teo', '2021-01-15'))))$q$, '23505');
INSERT INTO t_nf_ctx (k, v)
SELECT 'r2', public.ninos_registrar_familia(jsonb_build_object(
         'padre', jsonb_build_object('id', pg_temp.ctx('r1')::jsonb ->> 'padre_id'),
         'hijos', jsonb_build_array(pg_temp.hijo('ZZ Teo', '2021-01-15'))))::text;
SELECT pg_temp.assert_eq('b: the explicit padre.id reuses the parent, not VIP',
  $q$SELECT ((pg_temp.ctx('r2')::jsonb ->> 'padre_id') = (pg_temp.ctx('r1')::jsonb ->> 'padre_id'))::text
            || ':' || (pg_temp.ctx('r2')::jsonb ->> 'padre_nuevo')$q$, 'true:false');
SELECT pg_temp.assert_eq('b: search by phone finds one parent with three children',
  $q$SELECT jsonb_array_length(x) || ':' || jsonb_array_length(x -> 0 -> 'hijos')
       FROM public.ninos_buscar_familias('0412 999 0917') x$q$, '1:3');
SELECT pg_temp.assert_eq('b: search by parent name',
  $q$SELECT jsonb_array_length(public.ninos_buscar_familias('zz ana zz nf'))::text$q$, '1');
SELECT pg_temp.assert_eq('b: search by child name',
  $q$SELECT ((public.ninos_buscar_familias('ZZ Teo') -> 0 ->> 'id') = (pg_temp.ctx('r1')::jsonb ->> 'padre_id'))::text$q$,
  'true');

-- ── c. the same child twice is refused ───────────────────────────────

SELECT pg_temp.assert_raises('c: the same child cannot be registered twice for the parent',
  $q$SELECT public.ninos_registrar_familia(jsonb_build_object(
       'padre', jsonb_build_object('id', pg_temp.ctx('r1')::jsonb ->> 'padre_id'),
       'hijos', jsonb_build_array(pg_temp.hijo('zz luis', '2022-03-10'))))$q$, '23505');

-- ── d. edit the ficha and replace the pickup list ────────────────────

SELECT public.ninos_actualizar_nino((pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid,
  '{"alergias": "ZZ huevo", "grado": 0, "autorizados": [{"nombre": "ZZ Tío Nf", "relacion": "Tío"}]}'::jsonb);
SELECT pg_temp.assert_eq('d: the ficha changed and other fields kept',
  $q$SELECT alergias || ':' || grado || ':' || cambio_panal FROM public.ninos_fichas
      WHERE usuario_id = (pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid$q$, 'ZZ huevo:0:true');
SELECT pg_temp.assert_eq('d: the active pickup list was replaced',
  $q$SELECT string_agg(nombre, ',') FROM public.ninos_autorizados_retiro
      WHERE nino_id = (pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid AND activo$q$, 'ZZ Tío Nf');
SELECT pg_temp.assert_raises('d: grade out of range is refused',
  $q$SELECT public.ninos_actualizar_nino((pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid, '{"grado": 9}'::jsonb)$q$,
  '22023');

-- ── e. atomicity on invalid input ────────────────────────────────────

SELECT pg_temp.assert_raises('e: a child without gender fails the call',
  $q$SELECT public.ninos_registrar_familia(jsonb_build_object(
       'padre', jsonb_build_object('nombre', 'ZZ Nueva', 'apellido', 'ZZ Nf2', 'telefono', '04129990919', 'genero', 'Femenino'),
       'hijos', jsonb_build_array(pg_temp.hijo('ZZ Ok', '2020-01-01'),
                                  jsonb_build_object('nombre', 'ZZ Mal', 'apellido', 'ZZ Nf2', 'fecha_nacimiento', '2020-01-01'))))$q$,
  '22023');
SELECT pg_temp.assert_raises('e: no children fails the call',
  $q$SELECT public.ninos_registrar_familia(jsonb_build_object(
       'padre', jsonb_build_object('nombre', 'ZZ Nueva', 'apellido', 'ZZ Nf2', 'telefono', '04129990919', 'genero', 'Femenino'),
       'hijos', '[]'::jsonb))$q$, '22023');
RESET ROLE;
SELECT pg_temp.assert_eq('e: nothing of the failed call was written',
  $q$SELECT (SELECT count(*) FROM public.usuarios WHERE apellido = 'ZZ Nf2')::text$q$, '0');
SET LOCAL ROLE authenticated;

-- ── f. a random user is denied ───────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('f: a random user cannot register',
  $q$SELECT public.ninos_registrar_familia(pg_temp.familia('ZZ X', jsonb_build_array(pg_temp.hijo('ZZ Y', '2020-01-01'))))$q$,
  '42501');
SELECT pg_temp.assert_raises('f: a random user cannot search',
  $q$SELECT public.ninos_buscar_familias('ZZ Ana')$q$, '42501');
SELECT pg_temp.assert_raises('f: a random user cannot edit',
  $q$SELECT public.ninos_actualizar_nino((pg_temp.ctx('r1')::jsonb -> 'hijos' ->> 0)::uuid, '{"alergias": "x"}'::jsonb)$q$,
  '42501');

-- ── g. anon ──────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('g: anon cannot execute ninos_registrar_familia',
  $q$SELECT public.ninos_registrar_familia('{}'::jsonb)$q$, '42501');
SELECT pg_temp.assert_raises('g: anon cannot execute ninos_buscar_familias',
  $q$SELECT public.ninos_buscar_familias('ZZ')$q$, '42501');
SELECT pg_temp.assert_raises('g: anon cannot execute ninos_actualizar_nino',
  $q$SELECT public.ninos_actualizar_nino(gen_random_uuid(), '{}'::jsonb)$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_nf_failures;

ROLLBACK;
