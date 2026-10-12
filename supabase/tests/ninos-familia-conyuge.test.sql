-- Spouse as second parent (odd/tasks/familia-hijos-conyuge.md, C2;
-- 20261011100000_ninos_familia_conyuge.sql).
--
-- Covers:
--   a. ninos_conyuge_de returns the spouse in either storage direction and
--      NULL when there is none.
--   b. No spouse sent: only the registering adult is linked (with or without
--      a spouse on record).
--   c. Spouse accepted: every new child is linked to both, the spouse as
--      (child, spouse, 'padre').
--   d. A non-spouse, the adult itself, or a spouse with a NEW adult is
--      refused and nothing is created.
--   e. A random user is denied; f. anon cannot execute the RPCs.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_fc_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_fc_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_fc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- Registration payload: an existing adult, one child, an optional spouse.
CREATE OR REPLACE FUNCTION pg_temp.familia(p_padre int, p_hijo text, p_conyuge uuid) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'padre', jsonb_build_object('id', pg_temp.id('us', p_padre)),
    'hijos', jsonb_build_array(jsonb_build_object('nombre', p_hijo, 'apellido', 'ZZ Fc',
               'genero', 'Femenino', 'fecha_nacimiento', '2021-04-04')))
    || CASE WHEN p_conyuge IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('conyuge_id', p_conyuge) END;
$$;

-- "padre ids" of the child named p_hijo, sorted: who is linked as its parent.
-- Readback helpers run as the test owner so RLS does not hide the rows.
CREATE OR REPLACE FUNCTION pg_temp.padres_de(p_hijo text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT coalesce(string_agg(r.usuario2_id::text || ':' || r.es_principal::text, ',' ORDER BY r.usuario2_id), '-')
    FROM public.usuarios u JOIN public.relaciones_usuarios r ON r.usuario1_id = u.id AND r.tipo_relacion = 'padre'
   WHERE u.nombre = p_hijo AND u.apellido = 'ZZ Fc';
$$;

CREATE OR REPLACE FUNCTION pg_temp.hijos_rechazados() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT count(*)::text FROM public.usuarios WHERE apellido = 'ZZ Fc' AND nombre LIKE 'ZZ Hx%';
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_fc_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'fc-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;

-- 1 anfitrión, 2 random user; 3 P and 4 M spouses stored (P, M); 5 S a
-- stranger; 6 Q without spouse; 7 R and 8 W spouses stored reversed (W, R).
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Fc', 'U1', 'fc-1@example.test', 'Soltero', 'Masculino'),
  (pg_temp.id('us', 2), pg_temp.id('au', 2), 'ZZ Fc', 'U2', 'fc-2@example.test', 'Soltero', 'Masculino'),
  (pg_temp.id('us', 3), NULL, 'ZZ Pablo', 'ZZ Fc', NULL, 'Casado', 'Masculino'),
  (pg_temp.id('us', 4), NULL, 'ZZ Maria', 'ZZ Fc', NULL, 'Casado', 'Femenino'),
  (pg_temp.id('us', 5), NULL, 'ZZ Sara', 'ZZ Fc', NULL, 'Soltero', 'Femenino'),
  (pg_temp.id('us', 6), NULL, 'ZZ Quique', 'ZZ Fc', NULL, 'Soltero', 'Masculino'),
  (pg_temp.id('us', 7), NULL, 'ZZ Raul', 'ZZ Fc', NULL, 'Casado', 'Masculino'),
  (pg_temp.id('us', 8), NULL, 'ZZ Wendy', 'ZZ Fc', NULL, 'Casado', 'Femenino');
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 3), pg_temp.id('us', 4), 'conyuge', true),
  (pg_temp.id('us', 8), pg_temp.id('us', 7), 'conyuge', true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Fc R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Fc W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), (SELECT v::uuid FROM t_fc_ctx WHERE k = 'campus'), pg_temp.id('eq', 2), 'waumba', 'ZZ Fc S1', 20, 0, 59, 1);

GRANT INSERT, SELECT ON t_fc_failures, t_fc_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.familia(int, text, uuid), pg_temp.padres_de(text), pg_temp.hijos_rechazados() TO authenticated, anon;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

-- ── a. the spouse lookup ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: P''s spouse is M',
  $q$SELECT public.ninos_conyuge_de(pg_temp.id('us', 3)) ->> 'id'$q$, pg_temp.id('us', 4)::text);
SELECT pg_temp.assert_eq('a: the lookup returns only id, nombre, apellido and genero',
  $q$SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(public.ninos_conyuge_de(pg_temp.id('us', 3))) k$q$,
  'apellido,genero,id,nombre');
SELECT pg_temp.assert_eq('a: R''s spouse W is found although stored reversed',
  $q$SELECT public.ninos_conyuge_de(pg_temp.id('us', 7)) ->> 'id'$q$, pg_temp.id('us', 8)::text);
SELECT pg_temp.assert_eq('a: Q has no spouse',
  $q$SELECT coalesce(public.ninos_conyuge_de(pg_temp.id('us', 6))::text, 'null')$q$, 'null');

-- ── b. no spouse sent ────────────────────────────────────────────────

SELECT public.ninos_registrar_familia(pg_temp.familia(6, 'ZZ Hq', NULL));
SELECT pg_temp.assert_eq('b: without a spouse on record only Q is linked',
  $q$SELECT pg_temp.padres_de('ZZ Hq')$q$, pg_temp.id('us', 6)::text || ':true');
SELECT public.ninos_registrar_familia(pg_temp.familia(3, 'ZZ Hp1', NULL));
SELECT pg_temp.assert_eq('b: spouse declined: only P is linked',
  $q$SELECT pg_temp.padres_de('ZZ Hp1')$q$, pg_temp.id('us', 3)::text || ':true');

-- ── c. spouse accepted ───────────────────────────────────────────────

SELECT public.ninos_registrar_familia(pg_temp.familia(3, 'ZZ Hp2', pg_temp.id('us', 4)));
SELECT pg_temp.assert_eq('c: P (principal) and M are both linked',
  $q$SELECT pg_temp.padres_de('ZZ Hp2')$q$,
  pg_temp.id('us', 3)::text || ':true,' || pg_temp.id('us', 4)::text || ':false');
SELECT public.ninos_registrar_familia(pg_temp.familia(7, 'ZZ Hr', pg_temp.id('us', 8)));
SELECT pg_temp.assert_eq('c: a spouse stored reversed is accepted too',
  $q$SELECT pg_temp.padres_de('ZZ Hr')$q$,
  pg_temp.id('us', 7)::text || ':true,' || pg_temp.id('us', 8)::text || ':false');

-- ── d. refused spouse ids ────────────────────────────────────────────

SELECT pg_temp.assert_raises('d: a stranger as spouse is refused',
  $q$SELECT public.ninos_registrar_familia(pg_temp.familia(3, 'ZZ Hx1', pg_temp.id('us', 5)))$q$, '22023');
SELECT pg_temp.assert_raises('d: the adult itself as spouse is refused',
  $q$SELECT public.ninos_registrar_familia(pg_temp.familia(3, 'ZZ Hx2', pg_temp.id('us', 3)))$q$, '22023');
SELECT pg_temp.assert_raises('d: a malformed spouse id is refused',
  $q$SELECT public.ninos_registrar_familia(pg_temp.familia(3, 'ZZ Hx3', NULL) || '{"conyuge_id": "x"}'::jsonb)$q$, '22023');
SELECT pg_temp.assert_raises('d: a spouse with a new adult is refused',
  $q$SELECT public.ninos_registrar_familia(jsonb_build_object(
       'padre', jsonb_build_object('nombre', 'ZZ Nuevo', 'apellido', 'ZZ Fc', 'telefono', '04129990961', 'genero', 'Masculino'),
       'hijos', pg_temp.familia(3, 'ZZ Hx4', NULL) -> 'hijos', 'conyuge_id', pg_temp.id('us', 4)))$q$, '22023');
SELECT pg_temp.assert_eq('d: no refused child was created',
  $q$SELECT pg_temp.hijos_rechazados()$q$, '0');

-- ── e. a random user is denied ───────────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('e: a random user cannot look up a spouse',
  $q$SELECT public.ninos_conyuge_de(pg_temp.id('us', 3))$q$, '42501');
SELECT pg_temp.assert_raises('e: a random user cannot register with a spouse',
  $q$SELECT public.ninos_registrar_familia(pg_temp.familia(3, 'ZZ Hx5', pg_temp.id('us', 4)))$q$, '42501');

-- ── f. anon ──────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_conyuge_de',
  $q$SELECT public.ninos_conyuge_de(gen_random_uuid())$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_fc_failures;

ROLLBACK;
