-- N13 (odd/tasks/ninos-checkin.md) — "Revisar edad" when linking an
-- existing child (20261008157000_ninos_revisar_edad.sql).
--
-- Covers:
--   a. ninos_buscar_hijos_revisar_edad finds a 15-year-old T, a 30-year-old
--      single O and a person U with no birth date (youngest first, unknown
--      last), with name, age and masked cédula only; never an 8-year-old K
--      (that is the normal tab), a married M (estado_civil Casado) or a
--      person S with a conyuge relation.
--   b. ninos_vincular_revisando_edad refuses a corrected date still 13+, a
--      married person and a future date; with a date under 13 it writes the
--      date and links T to A.
--   c. A random user is denied; anon cannot execute; the internal helper is
--      not executable by authenticated.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_re_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_re_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_re_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9570000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9401' WHEN 'us' THEN '9402' WHEN 'eq' THEN '9404'
                       WHEN 'ro' THEN '9405' WHEN 'sa' THEN '9406' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_re_ctx WHERE k = p_k;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_re_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 're-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;

-- 1 anfitrión, 2 random user, 3 adult A, 4 K (8), 5 T (15, email set: it
-- must never leak), 6 U (no date), 7 O (30, single), 8 M (30, Casado),
-- 9 S (30, Soltero but with a conyuge relation to 10), 10 spouse of S.
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, telefono, cedula, fecha_nacimiento) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'Zqanf', 'Zqrevisa', 're-1@example.test', 'Soltero', 'Masculino', NULL, NULL, NULL),
  (pg_temp.id('us', 2), pg_temp.id('au', 2), 'Zqrandom', 'Zqrevisa', 're-2@example.test', 'Soltero', 'Masculino', NULL, NULL, NULL),
  (pg_temp.id('us', 3), NULL, 'Zqadulta', 'Zqrevisa', NULL, 'Casado', 'Femenino', '04129995701', NULL, '1990-01-01'),
  (pg_temp.id('us', 4), NULL, 'Zqkiara', 'Zqrevisa', NULL, 'No especificado', 'Femenino', NULL, 'V-99995704',
   (public.ninos_hoy() - interval '8 years')::date),
  (pg_temp.id('us', 5), NULL, 'Zqteo', 'Zqrevisa', 'zqteo@example.test', 'No especificado', 'Masculino', '04129995705', 'V-99995705',
   (public.ninos_hoy() - interval '15 years')::date),
  (pg_temp.id('us', 6), NULL, 'Zqsinfecha', 'Zqrevisa', NULL, 'No especificado', 'Masculino', NULL, NULL, NULL),
  (pg_temp.id('us', 7), NULL, 'Zqoscar', 'Zqrevisa', NULL, 'Soltero', 'Masculino', NULL, 'V-99995707',
   (public.ninos_hoy() - interval '30 years')::date),
  (pg_temp.id('us', 8), NULL, 'Zqmaria', 'Zqrevisa', NULL, 'Casado', 'Femenino', NULL, 'V-99995708',
   (public.ninos_hoy() - interval '30 years')::date),
  (pg_temp.id('us', 9), NULL, 'Zqsara', 'Zqrevisa', NULL, 'Soltero', 'Femenino', NULL, NULL,
   (public.ninos_hoy() - interval '30 years')::date),
  (pg_temp.id('us', 10), NULL, 'Zqesposo', 'Zqotro', NULL, 'Soltero', 'Masculino', NULL, NULL, '1990-01-01');
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 10), pg_temp.id('us', 9), 'conyuge', false);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Re R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Re W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Re Maternal', 20, 0, 23, 1);

GRANT INSERT, SELECT, UPDATE ON t_re_failures, t_re_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text) TO authenticated, anon;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

-- ── a. the review search ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: zqs finds U but not the spouse-linked S',
  $q$SELECT string_agg(h ->> 'nombre', ',' ORDER BY o)
       FROM jsonb_array_elements(public.ninos_buscar_hijos_revisar_edad('zqs Zqrevisa', pg_temp.id('us', 3)))
            WITH ORDINALITY AS t(h, o)$q$, 'Zqsinfecha');
SELECT pg_temp.assert_eq('a: by >= 3 chars of first and last name',
  $q$SELECT string_agg(h ->> 'nombre', ',' ORDER BY o)
       FROM jsonb_array_elements(public.ninos_buscar_hijos_revisar_edad('zqo zqrevisa', pg_temp.id('us', 3)))
            WITH ORDINALITY AS t(h, o)$q$, 'Zqoscar');
SELECT pg_temp.assert_eq('a: the married M is never found (name or cédula)',
  $q$SELECT (jsonb_array_length(public.ninos_buscar_hijos_revisar_edad('Zqmaria Zqrevisa', pg_temp.id('us', 3)))
            + jsonb_array_length(public.ninos_buscar_hijos_revisar_edad('V-99995708', pg_temp.id('us', 3))))::text$q$, '0');
SELECT pg_temp.assert_eq('a: S with a conyuge relation is never found',
  $q$SELECT jsonb_array_length(public.ninos_buscar_hijos_revisar_edad('Zqsara Zqrevisa', pg_temp.id('us', 3)))::text$q$, '0');
SELECT pg_temp.assert_eq('a: the 8-year-old K is not in the review list',
  $q$SELECT jsonb_array_length(public.ninos_buscar_hijos_revisar_edad('Zqkiara Zqrevisa', pg_temp.id('us', 3)))::text$q$, '0');
SELECT pg_temp.assert_eq('a: the 30-year-old single O is found by cédula',
  $q$SELECT h ->> 'edad_anos' FROM jsonb_array_elements(public.ninos_buscar_hijos_revisar_edad('99995707', pg_temp.id('us', 3))) h$q$, '30');
SELECT pg_temp.assert_eq('a: a single first name (N14) finds T, never the married M',
  $q$SELECT string_agg(h ->> 'id', ',') FROM jsonb_array_elements(public.ninos_buscar_hijos_revisar_edad('zqteo', pg_temp.id('us', 3))) h
      WHERE h ->> 'id' IN (pg_temp.id('us', 5)::text)$q$, pg_temp.id('us', 5)::text);
SELECT pg_temp.assert_eq('a: a single last name (N14) excludes married M, S and the under-13 K',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_buscar_hijos_revisar_edad('Zqrevisa', pg_temp.id('us', 3))) h
      WHERE h ->> 'id' IN (pg_temp.id('us', 4)::text, pg_temp.id('us', 8)::text, pg_temp.id('us', 9)::text)$q$, '0');
SELECT pg_temp.assert_eq('a: only name, age and masked cédula',
  $q$SELECT (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(h) k) || '|' || (h ->> 'edad_anos') || '|' || (h ->> 'cedula')
       FROM jsonb_array_elements(public.ninos_buscar_hijos_revisar_edad('Zqteo Zqrevisa', pg_temp.id('us', 3))) h$q$,
  'apellido,cedula,edad_anos,id,nombre|15|•••5705');
SELECT pg_temp.assert_eq('a: no email or phone in the result',
  $q$SELECT (public.ninos_buscar_hijos_revisar_edad('Zqteo Zqrevisa', pg_temp.id('us', 3))::text ~ '(zqteo@|04129995705)')::text$q$, 'false');
SELECT pg_temp.assert_eq('a: unknown age comes back as null',
  $q$SELECT coalesce(h ->> 'edad_anos', 'null') FROM jsonb_array_elements(public.ninos_buscar_hijos_revisar_edad('Zqsinfecha Zqrevisa', pg_temp.id('us', 3))) h$q$, 'null');
SELECT pg_temp.assert_eq('a: order is T (15), O (30), U (unknown)',
  $q$SELECT string_agg(h ->> 'nombre', ',' ORDER BY o)
       FROM jsonb_array_elements(public.ninos_buscar_hijos_revisar_edad('Zqteo Zqrevisa', pg_temp.id('us', 3))
                                 || public.ninos_buscar_hijos_revisar_edad('Zqoscar Zqrevisa', pg_temp.id('us', 3))
                                 || public.ninos_buscar_hijos_revisar_edad('Zqsinfecha Zqrevisa', pg_temp.id('us', 3)))
            WITH ORDINALITY AS t(h, o)$q$, 'Zqteo,Zqoscar,Zqsinfecha');

-- ── b. linking with a corrected birth date ───────────────────────────

SELECT pg_temp.assert_raises('b: a corrected date still 13+ is refused',
  $q$SELECT public.ninos_vincular_revisando_edad(pg_temp.id('us', 5), (public.ninos_hoy() - interval '14 years')::date, pg_temp.id('us', 3), NULL)$q$, '22023');
SELECT pg_temp.assert_raises('b: a future date is refused',
  $q$SELECT public.ninos_vincular_revisando_edad(pg_temp.id('us', 5), (public.ninos_hoy() + 1), pg_temp.id('us', 3), NULL)$q$, '22023');
SELECT pg_temp.assert_raises('b: a married person is refused',
  $q$SELECT public.ninos_vincular_revisando_edad(pg_temp.id('us', 8), (public.ninos_hoy() - interval '5 years')::date, pg_temp.id('us', 3), NULL)$q$, '22023');
SELECT pg_temp.assert_raises('b: K (already in range) goes through the normal tab',
  $q$SELECT public.ninos_vincular_revisando_edad(pg_temp.id('us', 4), (public.ninos_hoy() - interval '5 years')::date, pg_temp.id('us', 3), NULL)$q$, '22023');
SELECT pg_temp.assert_raises('b: a refused link leaves the date unchanged (self link)',
  $q$SELECT public.ninos_vincular_revisando_edad(pg_temp.id('us', 5), (public.ninos_hoy() - interval '10 years')::date, pg_temp.id('us', 5), NULL)$q$, '22023');
SELECT pg_temp.assert_eq('b: T is linked to A with a date under 13',
  $q$SELECT public.ninos_vincular_revisando_edad(pg_temp.id('us', 5), (public.ninos_hoy() - interval '10 years')::date, pg_temp.id('us', 3), NULL) ->> 'vinculados'$q$, '1');
RESET ROLE;
SELECT pg_temp.assert_eq('b: the corrected date was stored',
  $q$SELECT (fecha_nacimiento::date = (public.ninos_hoy() - interval '10 years')::date)::text FROM public.usuarios WHERE id = pg_temp.id('us', 5)$q$, 'true');
SELECT pg_temp.assert_eq('b: the link exists',
  $q$SELECT count(*)::text FROM public.relaciones_usuarios
      WHERE usuario1_id = pg_temp.id('us', 5) AND usuario2_id = pg_temp.id('us', 3) AND tipo_relacion = 'padre'$q$, '1');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b: T is no longer in the review list',
  $q$SELECT jsonb_array_length(public.ninos_buscar_hijos_revisar_edad('Zqteo Zqrevisa', pg_temp.id('us', 3)))::text$q$, '0');

-- ── c. authority ─────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('c: the internal helper is not executable',
  $q$SELECT public.ninos_revisar_edad_candidato(pg_temp.id('us', 7))$q$, '42501');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('c: a random user cannot search',
  $q$SELECT public.ninos_buscar_hijos_revisar_edad('Zqoscar Zqrevisa', NULL)$q$, '42501');
SELECT pg_temp.assert_raises('c: a random user cannot link',
  $q$SELECT public.ninos_vincular_revisando_edad(pg_temp.id('us', 7), (public.ninos_hoy() - interval '5 years')::date, pg_temp.id('us', 2), NULL)$q$, '42501');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('c: anon cannot search',
  $q$SELECT public.ninos_buscar_hijos_revisar_edad('Zqoscar Zqrevisa', NULL)$q$, '42501');
SELECT pg_temp.assert_raises('c: anon cannot link',
  $q$SELECT public.ninos_vincular_revisando_edad(pg_temp.id('us', 7), (public.ninos_hoy() - interval '5 years')::date, pg_temp.id('us', 3), NULL)$q$, '42501');

RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_re_failures;

ROLLBACK;
