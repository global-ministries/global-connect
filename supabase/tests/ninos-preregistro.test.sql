-- N8/N9 (odd/tasks/ninos-checkin.md) — public pre-registration and parent
-- emails (20261008150000_ninos_preregistro.sql).
--
-- Covers:
--   a. anon and authenticated cannot read or write ninos_preregistros and
--      cannot execute the service_role functions.
--   b. service_role creates a pre-registration; the per-IP limit answers
--      'limite' on the sixth within 10 minutes.
--   c. The anfitrión lists it; a random user sees nothing and is refused.
--   d. Confirming registers the family (padre_existente still applies),
--      marks it confirmado; a second resolve is refused; discard works.
--   e. Only the confirming operator invites, and only with the given email.
--   f. ninos_correos_visita returns the parent email only to the operator
--      who made the check-in / check-out.
--   g. A parent linked in the reverse form (parent → child, 'hijo') is found too.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION, 2 second ANFITRION, 3 RANDOM.
-- Tree: R → W → A ("Anfitriones"). Room S1 in W.

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
  SELECT format('f9600000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9601' WHEN 'us' THEN '9602' WHEN 'eq' THEN '9604'
                       WHEN 'ro' THEN '9605' WHEN 'sa' THEN '9606' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_np_ctx WHERE k = p_k;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_np_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo ORDER BY t.hora LIMIT 1;
INSERT INTO t_np_ctx (k, v)
SELECT 'campus', t.campus_id::text FROM public.dream_team_turnos t WHERE t.id = pg_temp.ctx('turno')::uuid;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'np-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 3) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Np', 'U' || n, 'np-' || n || '@example.test', 'Soltero', 'Otro'
  FROM generate_series(1, 3) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Np R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Np W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion'),
  (pg_temp.id('us', 2), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 3) n);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Np S1', 20, 1, 1, -100);

INSERT INTO t_np_ctx (k, v) VALUES ('payload', jsonb_build_object(
  'padre', jsonb_build_object('nombre', 'ZZ Np Mamá', 'apellido', 'Prueba', 'telefono', '0414-555-9601',
                              'genero', 'Femenino', 'email', 'zz-np-mama@example.test'),
  'hijos', jsonb_build_array(jsonb_build_object('nombre', 'ZZ Np Sofía', 'apellido', 'Prueba',
                              'fecha_nacimiento', '2019-05-01', 'genero', 'Femenino', 'grado', 1)),
  'autorizados', '[]'::jsonb)::text);

GRANT INSERT, SELECT, UPDATE ON t_np_failures, t_np_ctx TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.ctx(text) TO authenticated, anon, service_role;

-- ── a. anon and authenticated ────────────────────────────────────────

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('a: anon cannot read the table',
  $q$SELECT count(*) FROM public.ninos_preregistros$q$, '42501');
SELECT pg_temp.assert_raises('a: anon cannot insert',
  $q$INSERT INTO public.ninos_preregistros (campus_id, payload) VALUES (pg_temp.ctx('campus')::uuid, '{}')$q$, '42501');
SELECT pg_temp.assert_raises('a: anon cannot execute ninos_preregistro_crear',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid, pg_temp.ctx('payload')::jsonb, NULL)$q$, '42501');
SELECT pg_temp.assert_raises('a: anon cannot execute ninos_preregistro_campus',
  $q$SELECT * FROM public.ninos_preregistro_campus()$q$, '42501');
SELECT pg_temp.assert_raises('a: anon cannot execute ninos_preregistros_pendientes',
  $q$SELECT * FROM public.ninos_preregistros_pendientes()$q$, '42501');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('a: authenticated cannot read the table',
  $q$SELECT count(*) FROM public.ninos_preregistros$q$, '42501');
SELECT pg_temp.assert_raises('a: authenticated cannot insert',
  $q$INSERT INTO public.ninos_preregistros (campus_id, payload) VALUES (pg_temp.ctx('campus')::uuid, '{}')$q$, '42501');
SELECT pg_temp.assert_raises('a: authenticated cannot execute ninos_preregistro_crear',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid, pg_temp.ctx('payload')::jsonb, NULL)$q$, '42501');
RESET ROLE;

-- ── b. service_role creates; rate limit ──────────────────────────────

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_eq('b: service_role sees the campus in the picker',
  $q$SELECT count(*)::text FROM public.ninos_preregistro_campus() WHERE id = pg_temp.ctx('campus')::uuid$q$, '1');
SELECT pg_temp.assert_eq('b: service_role creates',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid, pg_temp.ctx('payload')::jsonb, repeat('a', 64))$q$, 'ok');
SELECT pg_temp.assert_raises('b: invalid payload is refused',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid, '{"padre":{}}'::jsonb, repeat('a', 64))$q$, '22023');
SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid, pg_temp.ctx('payload')::jsonb, repeat('b', 64))
  FROM generate_series(1, 5);
SELECT pg_temp.assert_eq('b: the sixth from one IP within 10 minutes is limited',
  $q$SELECT public.ninos_preregistro_crear(pg_temp.ctx('campus')::uuid, pg_temp.ctx('payload')::jsonb, repeat('b', 64))$q$, 'limite');
RESET ROLE;

INSERT INTO t_np_ctx (k, v)
SELECT 'pre', id::text FROM public.ninos_preregistros WHERE ip_hash = repeat('a', 64);
INSERT INTO t_np_ctx (k, v)
SELECT 'pre2', min(id::text) FROM public.ninos_preregistros WHERE ip_hash = repeat('b', 64);
INSERT INTO t_np_ctx (k, v)
SELECT 'pre_vieja', max(id::text) FROM public.ninos_preregistros WHERE ip_hash = repeat('b', 64);
-- One second before this week's Monday 00:00 America/Caracas.
UPDATE public.ninos_preregistros
   SET created_at = (date_trunc('week', public.ninos_hoy()::timestamp) AT TIME ZONE 'America/Caracas') - interval '1 second'
 WHERE id = pg_temp.ctx('pre_vieja')::uuid;

-- ── c. list ──────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: the anfitrión lists the pending one',
  $q$SELECT count(*)::text FROM public.ninos_preregistros_pendientes() WHERE id = pg_temp.ctx('pre')::uuid$q$, '1');
SELECT pg_temp.assert_eq('c: a pending one from before this week''s Monday is not listed',
  $q$SELECT count(*)::text FROM public.ninos_preregistros_pendientes() WHERE id = pg_temp.ctx('pre_vieja')::uuid$q$, '0');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('c: a random user lists nothing',
  $q$SELECT count(*)::text FROM public.ninos_preregistros_pendientes()$q$, '0');
SELECT pg_temp.assert_raises('c: a random user cannot resolve',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre')::uuid, 'descartar')$q$, '42501');
SELECT pg_temp.assert_raises('c: a random user cannot invite',
  $q$SELECT public.ninos_preregistro_invitar(pg_temp.ctx('pre')::uuid, 'zz-np-mama@example.test')$q$, '42501');

-- ── d. confirm and discard ───────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('d: confirm registers the family',
  $q$SELECT (public.ninos_preregistro_resolver(pg_temp.ctx('pre')::uuid, 'confirmar', pg_temp.ctx('payload')::jsonb) ->> 'estado')$q$,
  'confirmado');
SELECT pg_temp.assert_raises('d: a second resolve is refused',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre')::uuid, 'descartar')$q$, '22023');
SELECT pg_temp.assert_raises('d: same parent data again needs an explicit choice',
  $q$SELECT public.ninos_preregistro_resolver(pg_temp.ctx('pre2')::uuid, 'confirmar', pg_temp.ctx('payload')::jsonb)$q$, '23505');
SELECT pg_temp.assert_eq('d: discard works',
  $q$SELECT (public.ninos_preregistro_resolver(pg_temp.ctx('pre2')::uuid, 'descartar') ->> 'estado')$q$, 'descartado');
RESET ROLE;
SELECT pg_temp.assert_eq('d: the row is confirmado with the parent and the operator',
  $q$SELECT estado || ':' || (familia_padre_id IS NOT NULL) || ':' || (confirmado_por = pg_temp.id('us', 1))
       FROM public.ninos_preregistros WHERE id = pg_temp.ctx('pre')::uuid$q$, 'confirmado:true:true');
INSERT INTO t_np_ctx (k, v)
SELECT 'padre', familia_padre_id::text FROM public.ninos_preregistros WHERE id = pg_temp.ctx('pre')::uuid;
INSERT INTO t_np_ctx (k, v)
SELECT 'nino', r.usuario1_id::text FROM public.relaciones_usuarios r WHERE r.usuario2_id = pg_temp.ctx('padre')::uuid LIMIT 1;

-- ── e. invitation ────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('e: another anfitrión cannot invite',
  $q$SELECT public.ninos_preregistro_invitar(pg_temp.ctx('pre')::uuid, 'zz-np-mama@example.test')$q$, '42501');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('e: a different email is refused',
  $q$SELECT public.ninos_preregistro_invitar(pg_temp.ctx('pre')::uuid, 'otro@example.test')$q$, '22023');
SELECT pg_temp.assert_eq('e: the confirming operator invites with the given email',
  $q$SELECT public.ninos_preregistro_invitar(pg_temp.ctx('pre')::uuid, 'ZZ-np-mama@example.test ') ->> 'email'$q$,
  'zz-np-mama@example.test');
RESET ROLE;

-- ── f. visit emails ──────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT count(*) FROM public.ninos_checkin(ARRAY[pg_temp.ctx('nino')::uuid], pg_temp.ctx('turno')::uuid,
  DATE '2099-01-04', ARRAY[pg_temp.id('sa', 1)]);
SELECT pg_temp.assert_eq('f: the operator who checked in gets the parent email',
  $q$SELECT string_agg(email || ':' || nino_nombre || ':' || salon, ',')
       FROM public.ninos_correos_visita(ARRAY[pg_temp.ctx('nino')::uuid], pg_temp.ctx('turno')::uuid, DATE '2099-01-04', 'ingreso')$q$,
  'zz-np-mama@example.test:ZZ Np Sofía:ZZ Np S1');
SELECT pg_temp.assert_eq('f: no retiro emails before the check-out',
  $q$SELECT count(*)::text FROM public.ninos_correos_visita(ARRAY[pg_temp.ctx('nino')::uuid], pg_temp.ctx('turno')::uuid, DATE '2099-01-04', 'retiro')$q$,
  '0');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('f: another anfitrión gets nothing',
  $q$SELECT count(*)::text FROM public.ninos_correos_visita(ARRAY[pg_temp.ctx('nino')::uuid], pg_temp.ctx('turno')::uuid, DATE '2099-01-04', 'ingreso')$q$,
  '0');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('f: a random user gets nothing',
  $q$SELECT count(*)::text FROM public.ninos_correos_visita(ARRAY[pg_temp.ctx('nino')::uuid], pg_temp.ctx('turno')::uuid, DATE '2099-01-04', 'ingreso')$q$,
  '0');
SELECT pg_temp.as_persona(2);
SELECT count(*) FROM public.ninos_checkout(
  (SELECT c.codigo FROM public.ninos_checkins c WHERE c.nino_id = pg_temp.ctx('nino')::uuid AND c.fecha = DATE '2099-01-04'),
  pg_temp.ctx('turno')::uuid, DATE '2099-01-04', 'ZZ Ana');
SELECT pg_temp.assert_eq('f: the operator who checked out gets the retiro email',
  $q$SELECT string_agg(email || ':' || retirado_por_nombre, ',')
       FROM public.ninos_correos_visita(ARRAY[pg_temp.ctx('nino')::uuid], pg_temp.ctx('turno')::uuid, DATE '2099-01-04', 'retiro')$q$,
  'zz-np-mama@example.test:ZZ Ana');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('f: the check-in operator does not get the retiro email',
  $q$SELECT count(*)::text FROM public.ninos_correos_visita(ARRAY[pg_temp.ctx('nino')::uuid], pg_temp.ctx('turno')::uuid, DATE '2099-01-04', 'retiro')$q$,
  '0');
RESET ROLE;

-- ── g. reverse link form (parent = usuario1, child = usuario2, 'hijo') ─

INSERT INTO public.usuarios (id, nombre, apellido, email, estado_civil, genero)
VALUES (pg_temp.id('us', 9), 'ZZ Np Papá', 'Prueba', 'zz-np-papa@example.test', 'No especificado', 'Masculino');
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal)
VALUES (pg_temp.id('us', 9), pg_temp.ctx('nino')::uuid, 'hijo', false);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT count(*) FROM public.ninos_checkin(ARRAY[pg_temp.ctx('nino')::uuid], pg_temp.ctx('turno')::uuid,
  DATE '2099-01-11', ARRAY[pg_temp.id('sa', 1)]);
SELECT pg_temp.assert_eq('g: both parents, either link form, get the email',
  $q$SELECT string_agg(email, ',' ORDER BY email)
       FROM public.ninos_correos_visita(ARRAY[pg_temp.ctx('nino')::uuid], pg_temp.ctx('turno')::uuid, DATE '2099-01-11', 'ingreso')$q$,
  'zz-np-mama@example.test,zz-np-papa@example.test');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('f: anon cannot execute ninos_correos_visita',
  $q$SELECT * FROM public.ninos_correos_visita(ARRAY[]::uuid[], gen_random_uuid(), DATE '2099-01-04', 'ingreso')$q$, '42501');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_np_failures;

ROLLBACK;
