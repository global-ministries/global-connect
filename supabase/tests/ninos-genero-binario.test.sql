-- N13 (odd/tasks/ninos-checkin.md) — gender is Masculino or Femenino only
-- (20261008156000_ninos_genero_binario.sql).
--
-- Covers:
--   a. ninos_registrar_familia refuses "Otro" for the parent and the child,
--      and accepts Masculino / Femenino.
--   b. ninos_actualizar_nino refuses "Otro" and accepts Femenino.
--   c. ninos_vincular_padre refuses a new parent with "Otro".
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ng_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ng_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ng_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9560000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9401' WHEN 'us' THEN '9402' WHEN 'eq' THEN '9404'
                       WHEN 'ro' THEN '9405' WHEN 'sa' THEN '9406' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_ng_ctx WHERE k = p_k;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_ng_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ng-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;

-- 1 anfitrión, 2 random user, 3 adult A.
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, telefono, cedula, fecha_nacimiento) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'Zqanf', 'Zqgenero', 'ng-1@example.test', 'Soltero', 'Masculino', NULL, NULL, NULL),
  (pg_temp.id('us', 2), pg_temp.id('au', 2), 'Zqrandom', 'Zqgenero', 'ng-2@example.test', 'Soltero', 'Masculino', NULL, NULL, NULL),
  (pg_temp.id('us', 3), NULL, 'Zqadulta', 'Zqgenero', NULL, 'Casado', 'Femenino', '04129995601', NULL, '1990-01-01');

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Ng R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Ng W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Ng Maternal', 20, 0, 23, 1),
  (pg_temp.id('sa', 2), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Ng Preescolar I', 20, 24, 35, 2);

GRANT INSERT, SELECT, UPDATE ON t_ng_failures, t_ng_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text) TO authenticated, anon;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

-- ── a. registrar_familia ─────────────────────────────────────────────

SELECT pg_temp.assert_raises('a: a child with Otro is refused',
  $q$SELECT public.ninos_registrar_familia(jsonb_build_object(
       'padre', jsonb_build_object('id', pg_temp.id('us', 3)),
       'hijos', jsonb_build_array(jsonb_build_object('nombre', 'Zqotro', 'apellido', 'Zqgenero',
                 'fecha_nacimiento', (public.ninos_hoy() - interval '3 years')::date, 'genero', 'Otro'))))$q$, '22023');
SELECT pg_temp.assert_raises('a: a new parent with Otro is refused',
  $q$SELECT public.ninos_registrar_familia(jsonb_build_object(
       'padre', jsonb_build_object('nombre', 'Zqpadre', 'apellido', 'Zqgenero', 'telefono', '04129995611', 'genero', 'Otro'),
       'hijos', jsonb_build_array(jsonb_build_object('nombre', 'Zqhijo', 'apellido', 'Zqgenero',
                 'fecha_nacimiento', (public.ninos_hoy() - interval '3 years')::date, 'genero', 'Masculino'))))$q$, '22023');
SELECT pg_temp.assert_eq('a: Masculino is accepted',
  $q$SELECT jsonb_array_length(public.ninos_registrar_familia(jsonb_build_object(
       'padre', jsonb_build_object('id', pg_temp.id('us', 3)),
       'hijos', jsonb_build_array(jsonb_build_object('nombre', 'Zqhijo', 'apellido', 'Zqgenero',
                 'fecha_nacimiento', (public.ninos_hoy() - interval '3 years')::date, 'genero', 'Masculino')))) -> 'hijos')::text$q$, '1');

-- ── b. actualizar_nino ───────────────────────────────────────────────

RESET ROLE;
INSERT INTO t_ng_ctx (k, v)
SELECT 'hijo', r.usuario1_id::text FROM public.relaciones_usuarios r
 WHERE r.usuario2_id = pg_temp.id('us', 3) AND r.tipo_relacion = 'padre' LIMIT 1;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('b: editing the gender to Otro is refused',
  $q$SELECT public.ninos_actualizar_nino(pg_temp.ctx('hijo')::uuid, '{"genero":"Otro"}'::jsonb)$q$, '22023');
SELECT pg_temp.assert_eq('b: editing the gender to Femenino is saved',
  $q$SELECT public.ninos_actualizar_nino(pg_temp.ctx('hijo')::uuid, '{"genero":"Femenino"}'::jsonb)::text$q$, '');

-- ── c. vincular_padre ────────────────────────────────────────────────

SELECT pg_temp.assert_raises('c: a new parent with Otro is refused',
  $q$SELECT public.ninos_vincular_padre(ARRAY[pg_temp.ctx('hijo')::uuid], NULL,
       '{"nombre": "Zqnuevo", "apellido": "Zqgenero", "telefono": "04129995612", "genero": "Otro"}'::jsonb)$q$, '22023');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_ng_failures;

ROLLBACK;
