-- N10 (odd/tasks/ninos-checkin.md) — complete a linked child's ficha and
-- link a second parent (20261008151000_ninos_vinculos_familia.sql).
--
-- Covers:
--   a. A child linked to a parent without ficha shows in the search with
--      tiene_ficha = false, and ninos_checkin refuses it.
--   b. ninos_crear_ficha creates the ficha and pickup list, then a check-in
--      works; a second ficha, a child with no parent link and invalid data
--      are refused.
--   c. ninos_vincular_padre with an explicit id is idempotent; both parents'
--      searches show the child and the card lists both parents; self links
--      and cycles are refused.
--   d. A new second parent is created (never reusing a known phone).
--   g. (20261008152000) an adult hijo without birth date and a 20-year-old
--      hijo are not shown and get no ficha (fuera_de_rango).
--   e. A random user is denied; f. anon cannot execute the RPCs.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).

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
  SELECT format('f9510000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9401' WHEN 'us' THEN '9402' WHEN 'eq' THEN '9404'
                       WHEN 'ro' THEN '9405' WHEN 'sa' THEN '9406' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_nv_ctx WHERE k = p_k;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_nv_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;
INSERT INTO t_nv_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t
 WHERE t.campus_id = pg_temp.ctx('campus')::uuid AND t.activo ORDER BY t.orden LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'nv-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;

-- 1 anfitrión, 2 random user (both with auth); 3 father P, 4 child K linked
-- to P without ficha, 5 child O with no parent link, 6 mother M (adults).
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, telefono, fecha_nacimiento) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Nv', 'U1', 'nv-1@example.test', 'Soltero', 'Otro', NULL, NULL),
  (pg_temp.id('us', 2), pg_temp.id('au', 2), 'ZZ Nv', 'U2', 'nv-2@example.test', 'Soltero', 'Otro', NULL, NULL),
  (pg_temp.id('us', 3), NULL, 'ZZ Pedro', 'ZZ Nv', NULL, 'Casado', 'Masculino', '04129990941', '1990-01-01'),
  (pg_temp.id('us', 4), NULL, 'ZZ Kiko', 'ZZ Nv', NULL, 'No especificado', 'Masculino', NULL, '2021-05-05'),
  (pg_temp.id('us', 5), NULL, 'ZZ Olga', 'ZZ Nv', NULL, 'No especificado', 'Femenino', NULL, '2020-02-02'),
  (pg_temp.id('us', 6), NULL, 'ZZ Marta', 'ZZ Nv', NULL, 'Casado', 'Femenino', '04129990942', '1991-01-01'),
  (pg_temp.id('us', 7), NULL, 'ZZ Adulto', 'ZZ Nv', NULL, 'Casado', 'Masculino', NULL, NULL),
  (pg_temp.id('us', 8), NULL, 'ZZ Veinte', 'ZZ Nv', NULL, 'Soltero', 'Femenino', NULL,
   (current_date - interval '20 years')::date);
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 4), pg_temp.id('us', 3), 'padre', true),
  (pg_temp.id('us', 7), pg_temp.id('us', 3), 'padre', false),
  (pg_temp.id('us', 3), pg_temp.id('us', 8), 'hijo', false);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Nv R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Nv W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Nv S1', 20, 0, 59, 1);

GRANT INSERT, SELECT, UPDATE ON t_nv_failures, t_nv_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text) TO authenticated, anon;

SELECT pg_temp.assert_eq('fixture: the new-parent phone is free',
  $q$SELECT count(*)::text FROM public.usuarios WHERE regexp_replace(telefono, '\D', '', 'g') = '04129990943'$q$, '0');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

-- ── a. the search shows K without a ficha ────────────────────────────

SELECT pg_temp.assert_eq('a: K appears in P''s family with tiene_ficha false',
  $q$SELECT h ->> 'tiene_ficha' FROM jsonb_array_elements(public.ninos_buscar_familias('ZZ Pedro')) f,
            jsonb_array_elements(f -> 'hijos') h
      WHERE f ->> 'id' = pg_temp.id('us', 3)::text AND h ->> 'id' = pg_temp.id('us', 4)::text$q$, 'false');
SELECT pg_temp.assert_eq('a: an adult hijo without birth date and a 20-year-old hijo are not shown',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_familias('ZZ Pedro')) f,
            jsonb_array_elements(f -> 'hijos') h
      WHERE h ->> 'id' IN (pg_temp.id('us', 7)::text, pg_temp.id('us', 8)::text)$q$, '0');
SELECT pg_temp.assert_eq('a: searching the adults by name finds no family',
  $q$SELECT (jsonb_array_length(public.ninos_buscar_familias('ZZ Adulto'))
            + jsonb_array_length(public.ninos_buscar_familias('ZZ Veinte')))::text$q$, '0');
SELECT pg_temp.assert_raises('a: check-in of K without ficha is refused',
  $q$SELECT * FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 4)], pg_temp.ctx('turno')::uuid, '2030-02-03',
       ARRAY[pg_temp.id('sa', 1)])$q$, '22023');

-- ── b. complete the ficha, then the check-in works ───────────────────

SELECT public.ninos_crear_ficha(pg_temp.id('us', 4),
  '{"nombre": "ZZ Kiko", "apellido": "ZZ Nv", "fecha_nacimiento": "2021-05-05", "genero": "Masculino", "alergias": "ZZ gluten"}'::jsonb,
  '[{"nombre": "ZZ Tía Nv", "telefono": "04129990944", "relacion": "Tía"}]'::jsonb);
SELECT pg_temp.assert_eq('b: the ficha and the pickup list exist',
  $q$SELECT h ->> 'tiene_ficha' || ':' || (h ->> 'alergias') || ':' || (h -> 'autorizados' -> 0 ->> 'nombre')
       FROM jsonb_array_elements(public.ninos_buscar_familias('ZZ Kiko')) f, jsonb_array_elements(f -> 'hijos') h
      WHERE h ->> 'id' = pg_temp.id('us', 4)::text LIMIT 1$q$, 'true:ZZ gluten:ZZ Tía Nv');
SELECT pg_temp.assert_eq('b: the check-in now works',
  $q$SELECT count(*)::text FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 4)], pg_temp.ctx('turno')::uuid,
       '2030-02-03', ARRAY[pg_temp.id('sa', 1)])$q$, '1');
SELECT pg_temp.assert_raises('b: a second ficha is refused (ficha_existente)',
  $q$SELECT public.ninos_crear_ficha(pg_temp.id('us', 4), '{}'::jsonb, '[]'::jsonb)$q$, '23505');
SELECT pg_temp.assert_raises('b: a child with no parent link is refused (sin_padre)',
  $q$SELECT public.ninos_crear_ficha(pg_temp.id('us', 5), '{}'::jsonb, '[]'::jsonb)$q$, '22023');
SELECT pg_temp.assert_raises('b: a 20-year-old hijo is refused (fuera_de_rango)',
  $q$SELECT public.ninos_crear_ficha(pg_temp.id('us', 8), '{}'::jsonb, '[]'::jsonb)$q$, '22023');
DO $$
BEGIN
  PERFORM public.ninos_crear_ficha(pg_temp.id('us', 7), '{}'::jsonb, '[]'::jsonb);
  PERFORM pg_temp.fail('b: unknown birth date message', 'no error');
EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM <> 'fuera_de_rango' THEN PERFORM pg_temp.fail('b: unknown birth date message', SQLERRM); END IF;
END $$;
SELECT pg_temp.assert_raises('b: a birth date sent in the ficha must be in range too',
  $q$SELECT public.ninos_crear_ficha(pg_temp.id('us', 7), '{"fecha_nacimiento": "2000-01-01"}'::jsonb, NULL)$q$, '22023');
SELECT pg_temp.assert_raises('b: the adult cannot get a second parent through Niños',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 7)], pg_temp.id('us', 6), NULL)$q$, '22023');
SELECT pg_temp.assert_eq('b: no ficha was left for O',
  $q$SELECT count(*)::text FROM public.ninos_fichas WHERE usuario_id = pg_temp.id('us', 5)$q$, '0');
SELECT pg_temp.assert_raises('b: invalid ficha data rolls back the insert',
  $q$SELECT public.ninos_crear_ficha(pg_temp.id('us', 6), '{"genero": "X"}'::jsonb, NULL)$q$, '22023');

-- ── c. link the existing mother M with an explicit id (idempotent) ──

SELECT pg_temp.assert_eq('c: first link creates one row',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], pg_temp.id('us', 6), NULL) ->> 'vinculados'$q$, '1');
SELECT pg_temp.assert_eq('c: repeating it creates none',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], pg_temp.id('us', 6), NULL) ->> 'vinculados'$q$, '0');
RESET ROLE;
SELECT pg_temp.assert_eq('c: exactly one K→M relation row',
  $q$SELECT count(*)::text FROM public.relaciones_usuarios
      WHERE usuario1_id = pg_temp.id('us', 4) AND usuario2_id = pg_temp.id('us', 6)$q$, '1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: M''s search finds K',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_familias('ZZ Marta')) f,
            jsonb_array_elements(f -> 'hijos') h
      WHERE f ->> 'id' = pg_temp.id('us', 6)::text AND h ->> 'id' = pg_temp.id('us', 4)::text$q$, '1');
SELECT pg_temp.assert_eq('c: P''s card lists both parents, P first',
  $q$SELECT string_agg(p ->> 'nombre', ',' ORDER BY o) FROM jsonb_array_elements(public.ninos_buscar_familias('ZZ Pedro')) f,
            jsonb_array_elements(f -> 'padres') WITH ORDINALITY AS x(p, o)
      WHERE f ->> 'id' = pg_temp.id('us', 3)::text$q$, 'ZZ Pedro,ZZ Marta');
SELECT pg_temp.assert_raises('c: a child cannot be its own parent',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], pg_temp.id('us', 4), NULL)$q$, '22023');
SELECT pg_temp.assert_raises('c: a child''s own child cannot be its parent',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 3)], pg_temp.id('us', 4), NULL)$q$, '22023');
SELECT pg_temp.assert_raises('c: both id and new data is refused',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], pg_temp.id('us', 6), '{}'::jsonb)$q$, '22023');

-- ── d. a new second parent is created ────────────────────────────────

SELECT pg_temp.assert_raises('d: a known phone is never reused silently',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], NULL,
       '{"nombre": "ZZ Otra", "apellido": "ZZ Nv", "telefono": "0412-999 0942", "genero": "Femenino"}'::jsonb)$q$, '23505');
INSERT INTO t_nv_ctx (k, v)
SELECT 'nuevo', public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], NULL,
  '{"nombre": "ZZ Nora", "apellido": "ZZ Nv", "telefono": "0412 999 0943", "genero": "Femenino", "email": "NV-NORA@example.test"}'::jsonb)::text;
SELECT pg_temp.assert_eq('d: the new parent is created and linked',
  $q$SELECT (pg_temp.ctx('nuevo')::jsonb ->> 'padre_nuevo') || ':' || (pg_temp.ctx('nuevo')::jsonb ->> 'vinculados')$q$, 'true:1');
RESET ROLE;
SELECT pg_temp.assert_eq('d: the new parent has the email lowercased and a campus',
  $q$SELECT u.email || ':' || (SELECT count(*) FROM public.usuario_campus uc WHERE uc.usuario_id = u.id)
       FROM public.usuarios u WHERE u.id = (pg_temp.ctx('nuevo')::jsonb ->> 'padre_id')::uuid$q$, 'nv-nora@example.test:1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('d: missing phone is refused',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], NULL,
       '{"nombre": "ZZ X", "apellido": "ZZ Nv", "genero": "Otro"}'::jsonb)$q$, '22023');
SELECT pg_temp.assert_raises('d: a person outside the module cannot get a parent',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 2)], pg_temp.id('us', 6), NULL)$q$, '22023');

-- ── e. a random user is denied ───────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('e: a random user cannot create a ficha',
  $q$SELECT public.ninos_crear_ficha(pg_temp.id('us', 5), '{}'::jsonb, '[]'::jsonb)$q$, '42501');
SELECT pg_temp.assert_raises('e: a random user cannot link a parent',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.id('us', 4)], pg_temp.id('us', 6), NULL)$q$, '42501');

-- ── f. anon ──────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_crear_ficha',
  $q$SELECT public.ninos_crear_ficha(gen_random_uuid(), '{}'::jsonb, '[]'::jsonb)$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_vincular_padre',
  $q$SELECT public.ninos_vincular_padre(ARRAY[gen_random_uuid()], gen_random_uuid(), NULL)$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_nv_failures;

ROLLBACK;
