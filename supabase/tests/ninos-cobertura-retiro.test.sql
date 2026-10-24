-- G3 (odd/tasks/ninos-cobertura.md, decision D1) — check-out picks who picks
-- up from the child's list (20261012130100_ninos_cobertura_retiro.sql).
--
-- Covers:
--   a. ninos_retiro_opciones lists the authorized people and the linked
--      parents (either link form) that may pick up EVERY child still inside
--      with that code; a random user and anon are refused.
--   b. ninos_checkout without a reason refuses a name outside that list
--      (retiro_no_autorizado), and accepts a listed name whatever its case or
--      spacing; the row is not flagged.
--   c. "Otra persona": any name with a reason is accepted, flagged and keeps
--      the reason; a blank reason is not a reason.
--   d. Existing guards still hold: who is required, the room authority, anon.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION, 2 RANDOM.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cr_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_cr_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9800000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9801' WHEN 'us' THEN '9802' WHEN 'eq' THEN '9804'
                       WHEN 'ro' THEN '9805' WHEN 'sa' THEN '9806' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_cr_ctx WHERE k = p_k;
$$;

-- The code of each visit, kept when checking in (a random user cannot read ninos_checkins).
CREATE OR REPLACE FUNCTION pg_temp.codigo(p_fecha date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('codigo ' || p_fecha::text);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_cr_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo ORDER BY t.hora LIMIT 1;
INSERT INTO t_cr_ctx (k, v)
SELECT 'campus', t.campus_id::text FROM public.dream_team_turnos t WHERE t.id = pg_temp.ctx('turno')::uuid;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'cr-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Cr', 'U' || n, 'cr-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 2) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Cr R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Cr W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 2) n);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Cr S1', 20, 1, 1, -100);

GRANT INSERT, SELECT, UPDATE ON t_cr_failures, t_cr_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text), pg_temp.codigo(date) TO authenticated, anon;

-- A family of two children with one authorized person, registered at the table.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
INSERT INTO t_cr_ctx (k, v)
SELECT 'padre', public.ninos_registrar_familia(jsonb_build_object(
  'padre', jsonb_build_object('nombre', 'ZZ Cr Mamá', 'apellido', 'Prueba', 'telefono', '0414-555-9801', 'genero', 'Femenino'),
  'hijos', jsonb_build_array(
    jsonb_build_object('nombre', 'ZZ Cr Uno', 'apellido', 'Prueba', 'fecha_nacimiento', '2019-05-01', 'genero', 'Femenino', 'grado', 1),
    jsonb_build_object('nombre', 'ZZ Cr Dos', 'apellido', 'Prueba', 'fecha_nacimiento', '2019-06-01', 'genero', 'Masculino', 'grado', 1)),
  'autorizados', jsonb_build_array(jsonb_build_object('nombre', 'ZZ Cr Abuela', 'telefono', '04120009801', 'relacion', 'Abuela'))))
  ->> 'padre_id';
RESET ROLE;
INSERT INTO t_cr_ctx (k, v)
SELECT 'n1', u.id::text FROM public.usuarios u WHERE u.nombre = 'ZZ Cr Uno' AND u.apellido = 'Prueba';
INSERT INTO t_cr_ctx (k, v)
SELECT 'n2', u.id::text FROM public.usuarios u WHERE u.nombre = 'ZZ Cr Dos' AND u.apellido = 'Prueba';
-- Only for the first child: an uncle, and a father linked in the reverse form.
INSERT INTO public.ninos_autorizados_retiro (nino_id, nombre, relacion) VALUES (pg_temp.ctx('n1')::uuid, 'ZZ Cr Tío', 'Tío');
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
VALUES (pg_temp.id('us', 9), 'ZZ Cr Papá', 'Prueba', 'No especificado', 'Masculino');
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
VALUES (pg_temp.id('us', 9), pg_temp.ctx('n1')::uuid, 'hijo', false);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
INSERT INTO t_cr_ctx (k, v)
SELECT 'codigo 2099-02-01', min(codigo) FROM public.ninos_checkin(ARRAY[pg_temp.ctx('n1')::uuid, pg_temp.ctx('n2')::uuid], pg_temp.ctx('turno')::uuid,
  DATE '2099-02-01', ARRAY[pg_temp.id('sa', 1), pg_temp.id('sa', 1)]);
INSERT INTO t_cr_ctx (k, v)
SELECT 'codigo 2099-02-08', min(codigo) FROM public.ninos_checkin(ARRAY[pg_temp.ctx('n1')::uuid, pg_temp.ctx('n2')::uuid], pg_temp.ctx('turno')::uuid,
  DATE '2099-02-08', ARRAY[pg_temp.id('sa', 1), pg_temp.id('sa', 1)]);
INSERT INTO t_cr_ctx (k, v)
SELECT 'codigo 2099-02-15', min(codigo) FROM public.ninos_checkin(ARRAY[pg_temp.ctx('n1')::uuid], pg_temp.ctx('turno')::uuid,
  DATE '2099-02-15', ARRAY[pg_temp.id('sa', 1)]);

-- ── a. options ───────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: both children: the shared authorized person and the parent of both',
  $q$SELECT string_agg(nombre || ':' || tipo || ':' || coalesce(relacion, '-'), ',' ORDER BY tipo DESC, nombre)
       FROM public.ninos_retiro_opciones(pg_temp.codigo(DATE '2099-02-01'), pg_temp.ctx('turno')::uuid, DATE '2099-02-01')$q$,
  'ZZ Cr Mamá Prueba:representante:Representante,ZZ Cr Abuela:autorizado:Abuela');
SELECT pg_temp.assert_eq('a: one child: also the uncle and the father linked in reverse',
  $q$SELECT string_agg(nombre || ':' || tipo, ',' ORDER BY tipo DESC, nombre)
       FROM public.ninos_retiro_opciones(pg_temp.codigo(DATE '2099-02-15'), pg_temp.ctx('turno')::uuid, DATE '2099-02-15')$q$,
  'ZZ Cr Mamá Prueba:representante,ZZ Cr Papá Prueba:representante,ZZ Cr Abuela:autorizado,ZZ Cr Tío:autorizado');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('a: a random user cannot list the options',
  $q$SELECT * FROM public.ninos_retiro_opciones(pg_temp.codigo(DATE '2099-02-01'), pg_temp.ctx('turno')::uuid, DATE '2099-02-01')$q$,
  '42501');

-- ── b. a listed person ───────────────────────────────────────────────

SELECT pg_temp.assert_raises('d: a random user still cannot check out',
  $q$SELECT * FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-02-01'), pg_temp.ctx('turno')::uuid, DATE '2099-02-01', 'ZZ Cr Abuela')$q$,
  '42501');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('d: who picks up is still required',
  $q$SELECT * FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-02-01'), pg_temp.ctx('turno')::uuid, DATE '2099-02-01', ' ')$q$,
  '22023');
SELECT pg_temp.assert_raises('b: a name outside the list is refused without a reason',
  $q$SELECT * FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-02-01'), pg_temp.ctx('turno')::uuid, DATE '2099-02-01', 'ZZ Cr Vecina')$q$,
  '22023', 'retiro_no_autorizado');
SELECT pg_temp.assert_raises('b: someone authorized for one child only is refused for both',
  $q$SELECT * FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-02-01'), pg_temp.ctx('turno')::uuid, DATE '2099-02-01', 'ZZ Cr Tío')$q$,
  '22023', 'retiro_no_autorizado');
SELECT pg_temp.assert_raises('c: a blank reason is no reason',
  $q$SELECT * FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-02-01'), pg_temp.ctx('turno')::uuid, DATE '2099-02-01', 'ZZ Cr Vecina', '  ')$q$,
  '22023', 'retiro_no_autorizado');
SELECT pg_temp.assert_eq('b: the parent, in other case and spacing, picks up both',
  $q$SELECT count(*)::text FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-02-01'), pg_temp.ctx('turno')::uuid, DATE '2099-02-01', '  zz cr   MAMÁ prueba ')$q$,
  '2');
SELECT pg_temp.assert_eq('b: the one-child code accepts the father',
  $q$SELECT count(*)::text FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-02-15'), pg_temp.ctx('turno')::uuid, DATE '2099-02-15', 'ZZ Cr Papá Prueba')$q$,
  '1');

-- ── c. another person with a reason ──────────────────────────────────

SELECT pg_temp.assert_raises('c: a reason longer than 300 characters is refused',
  $q$SELECT * FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-02-08'), pg_temp.ctx('turno')::uuid, DATE '2099-02-08', 'ZZ Cr Vecina', repeat('x', 301))$q$,
  '22023');
SELECT pg_temp.assert_eq('c: another person with a reason picks up both',
  $q$SELECT count(*)::text FROM public.ninos_checkout(pg_temp.codigo(DATE '2099-02-08'), pg_temp.ctx('turno')::uuid, DATE '2099-02-08', 'ZZ Cr Vecina', ' La mamá avisó por teléfono ')$q$,
  '2');
RESET ROLE;

SELECT pg_temp.assert_eq('b: a listed pickup is stored trimmed and not flagged',
  $q$SELECT string_agg(DISTINCT retirado_por_nombre || ':' || retiro_otra_persona || ':' || coalesce(retiro_motivo, '-'), ',')
       FROM public.ninos_checkins WHERE nino_id IN (pg_temp.ctx('n1')::uuid, pg_temp.ctx('n2')::uuid) AND fecha = DATE '2099-02-01'$q$,
  'zz cr   MAMÁ prueba:false:-');
SELECT pg_temp.assert_eq('c: another person is flagged with the reason',
  $q$SELECT string_agg(DISTINCT retirado_por_nombre || ':' || retiro_otra_persona || ':' || coalesce(retiro_motivo, '-'), ',')
       FROM public.ninos_checkins WHERE nino_id IN (pg_temp.ctx('n1')::uuid, pg_temp.ctx('n2')::uuid) AND fecha = DATE '2099-02-08'$q$,
  'ZZ Cr Vecina:true:La mamá avisó por teléfono');

-- ── d. anon ──────────────────────────────────────────────────────────

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('d: anon cannot execute ninos_checkout',
  $q$SELECT * FROM public.ninos_checkout('1234', gen_random_uuid(), DATE '2099-02-01', 'x', 'y')$q$, '42501');
SELECT pg_temp.assert_raises('d: anon cannot execute ninos_retiro_opciones',
  $q$SELECT * FROM public.ninos_retiro_opciones('1234', gen_random_uuid(), DATE '2099-02-01')$q$, '42501');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_cr_failures;

ROLLBACK;
