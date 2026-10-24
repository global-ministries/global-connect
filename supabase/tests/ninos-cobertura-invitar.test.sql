-- G5 (odd/tasks/ninos-cobertura.md) — after "Nueva familia" at the table,
-- the account invitation of the new adult
-- (20261012130200_ninos_cobertura_invitar_familia.sql).
--
-- Covers:
--   a. ninos_registrar_familia_mesa registers like ninos_registrar_familia and
--      records the alta only for a NEW parent, with the operator.
--   b. Only that operator invites: another anfitrión and a random user are
--      refused; an existing parent chosen by id can never be invited here.
--   c. The operator invites with the given email (stored on the ficha); a
--      resend cancels the previous invitation.
--   d. Same safety checks as ninos_preregistro_invitar: an invalid email, an
--      email of someone else, a ficha that already has an account.
--   e. After one hour it is refused.
--   f. anon cannot execute either function nor read the table.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION, 2 second ANFITRION, 3 RANDOM.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ci_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ci_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ci_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT v FROM t_ci_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.familia(p_n int) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'padre', jsonb_build_object('nombre', 'ZZ Ci Mamá ' || p_n, 'apellido', 'Prueba',
                                'telefono', '0414-555-99' || lpad(p_n::text, 2, '0'), 'genero', 'Femenino'),
    'hijos', jsonb_build_array(jsonb_build_object('nombre', 'ZZ Ci Hijo ' || p_n, 'apellido', 'Prueba',
                                'fecha_nacimiento', '2019-05-01', 'genero', 'Femenino', 'grado', 1)),
    'autorizados', '[]'::jsonb);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_ci_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto';

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ci-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ci', 'U' || n, 'ci-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 3) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Ci R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Ci W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 2), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Ci S1', 20, 1, 1, -100);

GRANT INSERT, SELECT, UPDATE ON t_ci_failures, t_ci_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text), pg_temp.familia(int) TO authenticated, anon;

-- ── a. register at the table ─────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
INSERT INTO t_ci_ctx (k, v)
SELECT 'p' || n, public.ninos_registrar_familia_mesa(pg_temp.familia(n)) ->> 'padre_id' FROM generate_series(1, 4) n;
-- An existing parent chosen explicitly (padre.id): never recorded.
SELECT pg_temp.assert_eq('a: an existing parent chosen by id is not new',
  $q$SELECT public.ninos_registrar_familia_mesa(jsonb_set(pg_temp.familia(5), '{padre}',
       jsonb_build_object('id', pg_temp.ctx('p1')))) ->> 'padre_nuevo'$q$, 'false');
SELECT public.ninos_registrar_familia_mesa(jsonb_set(pg_temp.familia(6), '{padre}',
  jsonb_build_object('id', pg_temp.id('us', 3))));
RESET ROLE;
SELECT pg_temp.assert_eq('a: the alta is recorded for each new parent, with the operator',
  $q$SELECT count(*)::text FROM public.ninos_altas_mesa
      WHERE padre_id IN (SELECT v::uuid FROM t_ci_ctx WHERE k IN ('p1', 'p2', 'p3', 'p4'))
        AND registrado_por = pg_temp.id('us', 1)$q$, '4');
SELECT pg_temp.assert_eq('a: an existing parent is never recorded',
  $q$SELECT count(*)::text FROM public.ninos_altas_mesa WHERE padre_id = pg_temp.id('us', 3)$q$, '0');

-- ── b. who may invite ────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('b: another anfitrión cannot invite',
  $q$SELECT public.ninos_familia_invitar(pg_temp.ctx('p1')::uuid, 'zz-ci-mama1@example.test')$q$, '42501');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('b: a random user cannot invite',
  $q$SELECT public.ninos_familia_invitar(pg_temp.ctx('p1')::uuid, 'zz-ci-mama1@example.test')$q$, '42501');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('b: an existing parent cannot be invited here',
  $q$SELECT public.ninos_familia_invitar(pg_temp.id('us', 3), 'zz-ci-otro@example.test')$q$, '42501');

-- ── c. invite and resend ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('c: the operator invites the new adult',
  $q$SELECT public.ninos_familia_invitar(pg_temp.ctx('p1')::uuid, ' ZZ-Ci-Mama1@example.test ') ->> 'email'$q$,
  'zz-ci-mama1@example.test');
SELECT pg_temp.assert_eq('c: a resend creates a new invitation',
  $q$SELECT (public.ninos_familia_invitar(pg_temp.ctx('p1')::uuid, 'zz-ci-mama1@example.test') ->> 'id') IS NOT NULL$q$,
  'true');
SELECT pg_temp.assert_raises('d: another email than the one now on the ficha is refused',
  $q$SELECT public.ninos_familia_invitar(pg_temp.ctx('p1')::uuid, 'zz-ci-otra@example.test')$q$, '22023', 'email_distinto');
SELECT pg_temp.assert_raises('d: an invalid email is refused',
  $q$SELECT public.ninos_familia_invitar(pg_temp.ctx('p2')::uuid, 'no-es-correo')$q$, '22023', 'email_invalido');
SELECT pg_temp.assert_raises('d: the email of another person is refused',
  $q$SELECT public.ninos_familia_invitar(pg_temp.ctx('p2')::uuid, 'ci-2@example.test')$q$, '23505', 'email_en_uso');
SELECT pg_temp.assert_raises('d: the email of an account of no ficha is refused',
  $q$SELECT public.ninos_familia_invitar(pg_temp.ctx('p2')::uuid, 'ci-4@example.test')$q$, '23505', 'email_en_uso');
RESET ROLE;

SELECT pg_temp.assert_eq('c: the ficha keeps the email; only the last invitation is open',
  $q$SELECT (SELECT email FROM public.usuarios WHERE id = pg_temp.ctx('p1')::uuid) || ':'
         || (SELECT string_agg(estado::text, ',' ORDER BY estado::text) FROM public.invitaciones_cuenta
              WHERE usuario_id = pg_temp.ctx('p1')::uuid AND invitado_por = pg_temp.id('us', 1))$q$,
  'zz-ci-mama1@example.test:cancelada,enviada');

-- ── d/e. account already there; after one hour ───────────────────────

UPDATE public.usuarios SET auth_id = pg_temp.id('au', 4) WHERE id = pg_temp.ctx('p3')::uuid;
UPDATE public.ninos_altas_mesa SET registrado_at = now() - interval '61 minutes' WHERE padre_id = pg_temp.ctx('p4')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('d: a ficha that already has an account is refused',
  $q$SELECT public.ninos_familia_invitar(pg_temp.ctx('p3')::uuid, 'zz-ci-mama3@example.test')$q$, '22023', 'ya_tiene_cuenta');
SELECT pg_temp.assert_raises('e: after one hour it is refused',
  $q$SELECT public.ninos_familia_invitar(pg_temp.ctx('p4')::uuid, 'zz-ci-mama4@example.test')$q$, '42501');
RESET ROLE;

-- ── f. anon ──────────────────────────────────────────────────────────

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_registrar_familia_mesa',
  $q$SELECT public.ninos_registrar_familia_mesa(pg_temp.familia(9))$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_familia_invitar',
  $q$SELECT public.ninos_familia_invitar(gen_random_uuid(), 'x@example.test')$q$, '42501');
SELECT pg_temp.assert_raises('f: anon cannot read ninos_altas_mesa',
  $q$SELECT count(*) FROM public.ninos_altas_mesa$q$, '42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('f: authenticated cannot read ninos_altas_mesa',
  $q$SELECT count(*) FROM public.ninos_altas_mesa$q$, '42501');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_ci_failures;

ROLLBACK;
