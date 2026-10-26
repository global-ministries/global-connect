-- Cross-family child duplicate warning (odd/tasks/ninos-pendientes-2.md T2;
-- 20261026110000_ninos_duplicado_entre_familias.sql).
--
-- Fixtures: campus A (Barquisimeto) with the Anfitrión's room and a synthetic
-- campus B. Family A (parent 3) has the child "José Ángel ZZ Dup" born
-- 2020-05-05; family B (parent 5, campus B only) has the same child; a
-- parentless person with the same name and date lives on campus A; parent 4
-- (campus A) has no children.
--
-- Covers:
--   a. A child of another family is reported with only indice, nino_id,
--      nombre, apellido, padre_id and padres; a new adult (NULL) gets it too.
--   b. Accents, case and spacing do not matter (same key as the guard).
--   c. A different birth date is not a match; an invalid entry is skipped.
--   d. Same family: the adult's own child is not reported and the
--      registration still refuses it as hijo_ya_registrado; registering it
--      for another adult is still allowed (warning, not block).
--   e. Out of scope (campus B only) and parentless people are not reported.
--   f. Invalid input: non-array or more than 10 children is 22023.
--   g. A random user is denied; h. anon cannot execute it.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_dup_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_dup_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_dup_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f95d0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9401' WHEN 'us' THEN '9402' WHEN 'eq' THEN '9404'
                       WHEN 'ro' THEN '9405' WHEN 'sa' THEN '9406' WHEN 'ca' THEN '9407' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- One child entry as the form sends it.
CREATE OR REPLACE FUNCTION pg_temp.hijo(p_nombre text, p_apellido text, p_nac text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('nombre', p_nombre, 'apellido', p_apellido, 'genero', 'Masculino', 'fecha_nacimiento', p_nac);
$$;

-- The warning for the given children and registering adult (NULL = new adult).
CREATE OR REPLACE FUNCTION pg_temp.avisos(p_hijos jsonb, p_padre int) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT public.ninos_hijos_coincidencias(p_hijos, CASE WHEN p_padre IS NULL THEN NULL ELSE pg_temp.id('us', p_padre) END);
$$;

-- Readback as the test owner so RLS does not hide the rows.
CREATE OR REPLACE FUNCTION pg_temp.cuantos_jose() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT count(*)::text FROM public.usuarios WHERE nombre = 'José Ángel' AND apellido = 'ZZ Dup';
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_dup_ctx (k, v)
SELECT 'campus_a', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;
INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 2), 'ZZ Dup Campus B', 'ZZDUPB');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'dup-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;

-- 1 anfitrión (campus A), 2 random user; 3 parent A and 4 childless parent
-- (campus A); 5 parent B (campus B); 10 family A's child, 11 family B's
-- child, 12 parentless namesake (campus A).
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, fecha_nacimiento) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Dup', 'U1', 'dup-1@example.test', 'Soltero', 'Masculino', NULL),
  (pg_temp.id('us', 2), pg_temp.id('au', 2), 'ZZ Dup', 'U2', 'dup-2@example.test', 'Soltero', 'Masculino', NULL),
  (pg_temp.id('us', 3), NULL, 'ZZ Ana', 'ZZ Dup', NULL, 'Casado', 'Femenino', NULL),
  (pg_temp.id('us', 4), NULL, 'ZZ Luis', 'ZZ Dup', NULL, 'Casado', 'Masculino', NULL),
  (pg_temp.id('us', 5), NULL, 'ZZ Bea', 'ZZ Dup', NULL, 'Casado', 'Femenino', NULL),
  (pg_temp.id('us', 10), NULL, 'José Ángel', 'ZZ Dup', NULL, 'No especificado', 'Masculino', '2020-05-05'),
  (pg_temp.id('us', 11), NULL, 'José Ángel', 'ZZ Dup', NULL, 'No especificado', 'Masculino', '2020-05-05'),
  (pg_temp.id('us', 12), NULL, 'José Ángel', 'ZZ Dup', NULL, 'No especificado', 'Masculino', '2020-05-05');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 3), (SELECT v::uuid FROM t_dup_ctx WHERE k = 'campus_a'), true),
  (pg_temp.id('us', 4), (SELECT v::uuid FROM t_dup_ctx WHERE k = 'campus_a'), true),
  (pg_temp.id('us', 5), pg_temp.id('ca', 2), true),
  (pg_temp.id('us', 10), (SELECT v::uuid FROM t_dup_ctx WHERE k = 'campus_a'), true),
  (pg_temp.id('us', 11), pg_temp.id('ca', 2), true),
  (pg_temp.id('us', 12), (SELECT v::uuid FROM t_dup_ctx WHERE k = 'campus_a'), true);
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 10), pg_temp.id('us', 3), 'padre', true),
  (pg_temp.id('us', 11), pg_temp.id('us', 5), 'padre', true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Dup R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Dup W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), (SELECT v::uuid FROM t_dup_ctx WHERE k = 'campus_a'), pg_temp.id('eq', 2), 'waumba', 'ZZ Dup S1', 20, 0, 59, 1);

GRANT INSERT, SELECT ON t_dup_failures, t_dup_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.hijo(text, text, text), pg_temp.avisos(jsonb, int), pg_temp.cuantos_jose() TO authenticated, anon;

SELECT pg_temp.assert_eq('fixture: campus A exists',
  $q$SELECT (count(*) = 1)::text FROM t_dup_ctx WHERE k = 'campus_a' AND v IS NOT NULL$q$, 'true');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

-- ── a. another family's child is reported ────────────────────────────

SELECT pg_temp.assert_eq('a: adult 4 is warned about family A''s child (only that one)',
  $q$SELECT string_agg((e ->> 'indice') || ':' || (e ->> 'nino_id') || ':' || (e ->> 'padre_id'), ',')
       FROM jsonb_array_elements(pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')), 4)) e$q$,
  '0:' || pg_temp.id('us', 10)::text || ':' || pg_temp.id('us', 3)::text);
SELECT pg_temp.assert_eq('a: only the minimum keys are returned',
  $q$SELECT string_agg(k, ',' ORDER BY k)
       FROM jsonb_object_keys(pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')), 4) -> 0) k$q$,
  'apellido,indice,nino_id,nombre,padre_id,padres');
SELECT pg_temp.assert_eq('a: the family is labelled by its parents'' names',
  $q$SELECT (pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')), 4) -> 0 -> 'padres')::text$q$,
  '["ZZ Ana ZZ Dup"]');
SELECT pg_temp.assert_eq('a: a new adult (NULL) is warned too',
  $q$SELECT jsonb_array_length(pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')), NULL))::text$q$,
  '1');
SELECT pg_temp.assert_eq('a: the position in the list is kept',
  $q$SELECT (pg_temp.avisos(jsonb_build_array(pg_temp.hijo('ZZ Otro', 'ZZ Dup', '2020-05-05'),
                                              pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')), 4) -> 0 ->> 'indice')$q$,
  '1');

-- ── b. normalization ─────────────────────────────────────────────────

SELECT pg_temp.assert_eq('b: accents, case and spaces do not matter',
  $q$SELECT jsonb_array_length(pg_temp.avisos(jsonb_build_array(pg_temp.hijo('  JOSE   angel ', 'zz dup', '2020-05-05')), 4))::text$q$,
  '1');

-- ── c. not a match ───────────────────────────────────────────────────

SELECT pg_temp.assert_eq('c: a different birth date is not a match',
  $q$SELECT pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-06')), 4)::text$q$, '[]');
SELECT pg_temp.assert_eq('c: a different name is not a match',
  $q$SELECT pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José', 'ZZ Dup', '2020-05-05')), 4)::text$q$, '[]');
SELECT pg_temp.assert_eq('c: invalid or incomplete entries are skipped, not an error',
  $q$SELECT pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-02-30'),
                                            pg_temp.hijo('José Ángel', '', '2020-05-05'), '"x"'::jsonb), 4)::text$q$, '[]');

-- ── d. same family behaves as before ─────────────────────────────────

SELECT pg_temp.assert_eq('d: the adult''s own child is not reported',
  $q$SELECT pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')), 3)::text$q$, '[]');
SELECT pg_temp.assert_raises('d: registering it again for the same adult is still refused',
  $q$SELECT public.ninos_registrar_familia(jsonb_build_object('padre', jsonb_build_object('id', pg_temp.id('us', 3)),
       'hijos', jsonb_build_array(pg_temp.hijo('jose angel', 'ZZ DUP', '2020-05-05'))))$q$, '23505');
SELECT pg_temp.assert_eq('d: the refused child was not created',
  $q$SELECT pg_temp.cuantos_jose()$q$, '3');
-- The warning does not block: the anfitrión may continue for adult 4.
SELECT public.ninos_registrar_familia(jsonb_build_object('padre', jsonb_build_object('id', pg_temp.id('us', 4)),
  'hijos', jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05'))));
SELECT pg_temp.assert_eq('d: continuing after the warning still registers the child',
  $q$SELECT pg_temp.cuantos_jose()$q$, '4');
SELECT pg_temp.assert_eq('d: afterwards adult 4 is still warned about family A only',
  $q$SELECT string_agg(e ->> 'padre_id', ',')
       FROM jsonb_array_elements(pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')), 4)) e$q$,
  pg_temp.id('us', 3)::text);

-- ── e. out of scope / no family ──────────────────────────────────────

SELECT pg_temp.assert_eq('e: family B (campus B only) and the parentless namesake are never returned',
  $q$SELECT count(*)::text
       FROM jsonb_array_elements(pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')), NULL)) e
      WHERE e ->> 'nino_id' IN (pg_temp.id('us', 11)::text, pg_temp.id('us', 12)::text)$q$, '0');

-- ── f. invalid input ─────────────────────────────────────────────────

SELECT pg_temp.assert_raises('f: a non-array is refused',
  $q$SELECT public.ninos_hijos_coincidencias('{}'::jsonb, NULL)$q$, '22023');
SELECT pg_temp.assert_raises('f: NULL is refused',
  $q$SELECT public.ninos_hijos_coincidencias(NULL, NULL)$q$, '22023');
SELECT pg_temp.assert_raises('f: more than 10 children are refused',
  $q$SELECT public.ninos_hijos_coincidencias(
       (SELECT jsonb_agg(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')) FROM generate_series(1, 11)), NULL)$q$, '22023');

-- ── g. a random user is denied ───────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('g: a non-operator cannot look up duplicates',
  $q$SELECT pg_temp.avisos(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')), 4)$q$, '42501');

-- ── h. anon ──────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('h: anon cannot execute ninos_hijos_coincidencias',
  $q$SELECT public.ninos_hijos_coincidencias(jsonb_build_array(pg_temp.hijo('José Ángel', 'ZZ Dup', '2020-05-05')), NULL)$q$, '42501');

RESET ROLE;
SELECT pg_temp.assert_eq('h: anon has no EXECUTE privilege',
  $q$SELECT has_function_privilege('anon', 'public.ninos_hijos_coincidencias(jsonb, uuid)', 'EXECUTE')::text$q$, 'false');
SELECT pg_temp.assert_eq('h: authenticated has EXECUTE',
  $q$SELECT has_function_privilege('authenticated', 'public.ninos_hijos_coincidencias(jsonb, uuid)', 'EXECUTE')::text$q$, 'true');

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_dup_failures;

ROLLBACK;
