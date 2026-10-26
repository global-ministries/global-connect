-- P4 (odd/tasks/ninos-precheck.md, odd/tasks/ninos-pendientes-2.md T3) —
-- "¿Vienen hoy?" in the public QR wizard (20261026120000_ninos_precheck_qr.sql).
--
-- Covers:
--   a. anon and authenticated cannot execute the token create, the notice or
--      the services helper, nor read the notices or the pre-registrations.
--   b. The create with a token answers the row id and only today's services
--      of its campus inside the window (T1, T2; never T3 or T4); without a
--      token there is no id, and the 3-argument create still answers 'ok'.
--   c. A wrong token, another pre-registration's token, an unknown id, a row
--      stored without a token and a row of another day are all sin_autoridad.
--   d. Outside the window (T3) and a turno of another campus (T4) are
--      fuera_de_horario.
--   e. A valid notice for T1 is 'ok'; the same service again is ya_avisado;
--      another service of today (T2) is allowed.
--   f. The anfitrión of campus 1 sees the pre-registration in the T1 list
--      (tipo, names, alerts; no phone or email); nothing for T4; a parent
--      without rooms sees nothing.
--   g. Once the table discards the pre-registration it leaves the list and
--      takes no more notices.
--   h. Rate limit: 5 notices per ip_hash per 10 minutes answer 'limite'.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 PADRE P (no rooms), 6 ANFITRION (campus 1).
-- Tree: R → W → Anfitriones, room S1 in W on campus 1; R2 → W2, room S2 on campus 2.
-- Turnos (today's weekday): T1 now, T2 now + 30 min (campus 1), T3 now + 5 h
-- (campus 1, outside the window), T4 now (campus 2).
-- Pre-registrations (campus 1, stored as service_role): PR1 token tok-1,
-- PR2 token tok-2, PR3 no token, PR4 token tok-4 (moved to yesterday),
-- PR5 token tok-5 (rate limit).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_qr_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_qr_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_qr_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_denied(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected permission denied, got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> '42501' OR SQLERRM NOT LIKE 'permission denied%' THEN
      PERFORM pg_temp.fail(p_case, 'expected permission denied, got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

-- Runs a statement that needs the new objects; an error is a failure, not an abort.
CREATE OR REPLACE FUNCTION pg_temp.run(p_case text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9b50000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9e01' WHEN 'us' THEN '9e02' WHEN 'eq' THEN '9e04'
                       WHEN 'ro' THEN '9e05' WHEN 'sa' THEN '9e06' WHEN 'tu' THEN '9e07' WHEN 'ca' THEN '9e08' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_qr_ctx WHERE k = p_k;
$$;

-- The hash the route handler stores for a token.
CREATE OR REPLACE FUNCTION pg_temp.h(p_token text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- "SELECT public.ninos_preregistro_avisar(pr, h(token), turno, ip)".
CREATE OR REPLACE FUNCTION pg_temp.avisar(p_pr text, p_token text, p_turno int, p_ip text DEFAULT repeat('a', 64))
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_preregistro_avisar(%L::uuid, %L, %L::uuid, %L)',
                pg_temp.ctx(p_pr), pg_temp.h(p_token), pg_temp.id('tu', p_turno), p_ip);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_qr_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;
INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Qr Campus', 'ZZQR');
INSERT INTO t_qr_ctx (k, v) VALUES
  ('campus2', pg_temp.id('ca', 1)::text),
  ('hoy', public.ninos_hoy()::text),
  ('ahora', date_trunc('minute', now() AT TIME ZONE 'America/Caracas')::time::text),
  ('payload', jsonb_build_object(
     'padre', jsonb_build_object('nombre', 'ZZ Rosa', 'apellido', 'ZZ Qr', 'telefono', '04140000000',
                                 'email', 'zz-qr@example.test', 'cedula', NULL, 'genero', NULL),
     'hijos', jsonb_build_array(
       jsonb_build_object('nombre', 'ZZ Sol', 'apellido', 'ZZ Qr', 'fecha_nacimiento', '2021-03-04', 'genero', 'Femenino',
                          'alergias', 'ZZ Maní', 'necesidades_especiales', NULL),
       jsonb_build_object('nombre', 'ZZ Luz', 'apellido', 'ZZ Qr', 'fecha_nacimiento', '2019-05-06', 'genero', 'Femenino',
                          'alergias', NULL, 'necesidades_especiales', NULL)),
     'autorizados', '[]'::jsonb)::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'qr-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 6]) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, fecha_nacimiento) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Pablo', 'ZZ Qr', 'qr-1@example.test', 'Casado', 'Masculino', '1990-01-01'),
  (pg_temp.id('us', 6), pg_temp.id('au', 6), 'ZZ Anfi', 'ZZ Qr', 'qr-6@example.test', 'Soltero', 'Femenino', NULL);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Qr R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Qr W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', NULL, 'ZZ Qr R2', true),
  (pg_temp.id('eq', 5), 'ninos', pg_temp.id('eq', 4), 'ZZ Qr W2', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 6), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Qr S1', 20, 0, 155, 1),
  (pg_temp.id('sa', 2), pg_temp.ctx('campus2')::uuid, pg_temp.id('eq', 5), 'waumba', 'ZZ Qr S2', 20, 0, 155, 1);
INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.ctx('campus')::uuid, 'ZZ Qr T1', extract(dow FROM public.ninos_hoy())::smallint,
   pg_temp.ctx('ahora')::time, 911, true),
  (pg_temp.id('tu', 2), pg_temp.ctx('campus')::uuid, 'ZZ Qr T2', extract(dow FROM public.ninos_hoy())::smallint,
   pg_temp.ctx('ahora')::time + interval '30 minutes', 912, true),
  (pg_temp.id('tu', 3), pg_temp.ctx('campus')::uuid, 'ZZ Qr T3', extract(dow FROM public.ninos_hoy())::smallint,
   pg_temp.ctx('ahora')::time + interval '5 hours', 913, true),
  (pg_temp.id('tu', 4), pg_temp.ctx('campus2')::uuid, 'ZZ Qr T4', extract(dow FROM public.ninos_hoy())::smallint,
   pg_temp.ctx('ahora')::time, 914, true);

GRANT INSERT, SELECT, UPDATE ON t_qr_failures, t_qr_ctx TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.assert_denied(text, text), pg_temp.run(text, text),
  pg_temp.as_persona(int), pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.h(text),
  pg_temp.avisar(text, text, int, text)
  TO authenticated, anon, service_role;

-- ── a. no client access ──────────────────────────────────────────────

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('a: anon cannot execute the token create',
  format('SELECT public.ninos_preregistro_crear(%L::uuid, %L::jsonb, NULL, %L)',
         pg_temp.ctx('campus'), pg_temp.ctx('payload'), pg_temp.h('x')));
SELECT pg_temp.assert_denied('a: anon cannot notify',
  format('SELECT public.ninos_preregistro_avisar(%L::uuid, %L, %L::uuid, NULL)',
         pg_temp.id('ca', 9), pg_temp.h('x'), pg_temp.id('tu', 1)));
SELECT pg_temp.assert_denied('a: anon cannot list services',
  format('SELECT public.ninos_preregistro_servicios_hoy(%L::uuid)', pg_temp.ctx('campus')));
SELECT pg_temp.assert_denied('a: anon cannot read the notices', 'SELECT count(*) FROM public.ninos_preregistro_avisos');
SELECT pg_temp.assert_denied('a: anon cannot read the pre-registrations', 'SELECT count(*) FROM public.ninos_preregistros');
SELECT pg_temp.assert_denied('a: anon cannot read the arriving list',
  format('SELECT public.ninos_prechecks_pendientes(%L, %L)', pg_temp.id('tu', 1), pg_temp.ctx('hoy')));
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_denied('a: authenticated cannot execute the token create',
  format('SELECT public.ninos_preregistro_crear(%L::uuid, %L::jsonb, NULL, %L)',
         pg_temp.ctx('campus'), pg_temp.ctx('payload'), pg_temp.h('x')));
SELECT pg_temp.assert_denied('a: authenticated cannot notify',
  format('SELECT public.ninos_preregistro_avisar(%L::uuid, %L, %L::uuid, NULL)',
         pg_temp.id('ca', 9), pg_temp.h('x'), pg_temp.id('tu', 1)));
SELECT pg_temp.assert_denied('a: authenticated cannot read the notices', 'SELECT count(*) FROM public.ninos_preregistro_avisos');
RESET ROLE;

-- ── b. create with a token (as the route handler) ────────────────────

SET LOCAL ROLE service_role;
SELECT pg_temp.run('b: store PR1, PR2, PR4, PR5 with tokens and PR3 without', format($q$
  INSERT INTO t_qr_ctx (k, v)
  SELECT 'r' || n, public.ninos_preregistro_crear(%L::uuid, %L::jsonb, repeat(n::text, 64), pg_temp.h('tok-' || n))::text
    FROM unnest(ARRAY[1, 2, 4, 5]) AS n
  UNION ALL
  SELECT 'r3', public.ninos_preregistro_crear(%L::uuid, %L::jsonb, repeat('3', 64), NULL::text)::text$q$,
  pg_temp.ctx('campus'), pg_temp.ctx('payload'), pg_temp.ctx('campus'), pg_temp.ctx('payload')));
SELECT pg_temp.run('b: keep the ids', $q$
  INSERT INTO t_qr_ctx (k, v)
  SELECT 'pr' || substr(k, 2), v::jsonb ->> 'id' FROM t_qr_ctx WHERE k IN ('r1', 'r2', 'r4', 'r5')$q$);
SELECT pg_temp.assert_eq('b: the token create answers ok with the row id',
  $q$SELECT (pg_temp.ctx('r1')::jsonb ->> 'estado') || ':' || (pg_temp.ctx('pr1') ~ '^[0-9a-f-]{36}$')::text$q$,
  'ok:true');
SELECT pg_temp.assert_eq('b: only today''s services of its campus inside the window',
  $q$SELECT string_agg(s ->> 'nombre', ',' ORDER BY s ->> 'nombre')
       FROM jsonb_array_elements(pg_temp.ctx('r1')::jsonb -> 'servicios') s
      WHERE s ->> 'nombre' LIKE 'ZZ Qr%'$q$,
  'ZZ Qr T1,ZZ Qr T2');
SELECT pg_temp.assert_eq('b: a service carries only id, name and time',
  $q$SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(pg_temp.ctx('r1')::jsonb -> 'servicios' -> 0) k$q$,
  'hora,nombre,turno_id');
SELECT pg_temp.assert_eq('b: without a token there is no id nor services',
  $q$SELECT pg_temp.ctx('r3')$q$, '{"estado": "ok"}');
SELECT pg_temp.assert_eq('b: the 3-argument create keeps answering ok',
  format('SELECT public.ninos_preregistro_crear(%L::uuid, %L::jsonb, %L)',
         pg_temp.ctx('campus'), pg_temp.ctx('payload'), repeat('6', 64)),
  'ok');
SELECT pg_temp.assert_raises('b: a malformed token hash is refused',
  format('SELECT public.ninos_preregistro_crear(%L::uuid, %L::jsonb, %L, %L)',
         pg_temp.ctx('campus'), pg_temp.ctx('payload'), repeat('7', 64), 'not-a-hash'),
  '22023', 'datos_invalidos');
RESET ROLE;
SELECT pg_temp.run('b: keep the PR3 id', $q$
  INSERT INTO t_qr_ctx (k, v)
  SELECT 'pr3', r.id::text FROM public.ninos_preregistros r
   WHERE r.ip_hash = repeat('3', 64) AND r.created_at > now() - interval '1 minute'$q$);
SELECT pg_temp.run('b: PR4 moved to yesterday', format(
  $q$UPDATE public.ninos_preregistros SET created_at = now() - interval '1 day' WHERE id = %L::uuid$q$, pg_temp.ctx('pr4')));
SELECT pg_temp.assert_eq('b: only the hash is stored',
  format('SELECT (aviso_token_hash = %L)::text FROM public.ninos_preregistros WHERE id = %L::uuid',
         pg_temp.h('tok-1'), pg_temp.ctx('pr1')),
  'true');

-- ── c. the notice is bound to its pre-registration ───────────────────

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_raises('c: a wrong token', pg_temp.avisar('pr1', 'tok-wrong', 1), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('c: another pre-registration''s token', pg_temp.avisar('pr1', 'tok-2', 1), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('c: an unknown id',
  format('SELECT public.ninos_preregistro_avisar(%L::uuid, %L, %L::uuid, NULL)', pg_temp.id('ca', 9), pg_temp.h('tok-1'), pg_temp.id('tu', 1)),
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('c: a row stored without a token',
  format('SELECT public.ninos_preregistro_avisar(%L::uuid, NULL, %L::uuid, NULL)', pg_temp.ctx('pr3'), pg_temp.id('tu', 1)),
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('c: a pre-registration of another day', pg_temp.avisar('pr4', 'tok-4', 1), '42501', 'sin_autoridad');

-- ── d. the window and the campus ─────────────────────────────────────

SELECT pg_temp.assert_raises('d: outside the window', pg_temp.avisar('pr1', 'tok-1', 3), '22023', 'fuera_de_horario');
SELECT pg_temp.assert_raises('d: a turno of another campus', pg_temp.avisar('pr1', 'tok-1', 4), '22023', 'fuera_de_horario');

-- ── e. notify once per service ───────────────────────────────────────

SELECT pg_temp.assert_eq('e: a valid notice for T1', pg_temp.avisar('pr1', 'tok-1', 1), 'ok');
SELECT pg_temp.assert_raises('e: the same service again', pg_temp.avisar('pr1', 'tok-1', 1), '22023', 'ya_avisado');
SELECT pg_temp.assert_eq('e: another service of today', pg_temp.avisar('pr1', 'tok-1', 2), 'ok');
RESET ROLE;
SELECT pg_temp.assert_eq('e: one row per service',
  format('SELECT count(*)::text FROM public.ninos_preregistro_avisos WHERE preregistro_id = %L::uuid', pg_temp.ctx('pr1')),
  '2');

-- ── f. the table's list ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('f: the anfitrión sees PR1 arriving for T1',
  format($q$SELECT string_agg(concat_ws(':', f ->> 'tipo', f -> 'padre' ->> 'nombre',
                                        (SELECT string_agg(h ->> 'nombre', '+' ORDER BY h ->> 'nombre') FROM jsonb_array_elements(f -> 'hijos') h)), ',')
              FROM jsonb_array_elements(public.ninos_prechecks_pendientes(%L, %L)) f
             WHERE f ->> 'preregistro_id' = %L$q$, pg_temp.id('tu', 1), pg_temp.ctx('hoy'), pg_temp.ctx('pr1')),
  'preregistro:ZZ Rosa:ZZ Luz+ZZ Sol');
SELECT pg_temp.assert_eq('f: the children carry their alerts',
  format($q$SELECT string_agg(coalesce(h ->> 'alergias', '-'), ',' ORDER BY h ->> 'nombre')
              FROM jsonb_array_elements(public.ninos_prechecks_pendientes(%L, %L)) f, jsonb_array_elements(f -> 'hijos') h
             WHERE f ->> 'preregistro_id' = %L$q$, pg_temp.id('tu', 1), pg_temp.ctx('hoy'), pg_temp.ctx('pr1')),
  '-,ZZ Maní');
SELECT pg_temp.assert_eq('f: no phone nor email in the entry',
  format($q$SELECT ((f::text LIKE '%%04140000000%%') OR (f::text LIKE '%%zz-qr@%%'))::text
              FROM jsonb_array_elements(public.ninos_prechecks_pendientes(%L, %L)) f
             WHERE f ->> 'preregistro_id' = %L$q$, pg_temp.id('tu', 1), pg_temp.ctx('hoy'), pg_temp.ctx('pr1')),
  'false');
SELECT pg_temp.assert_eq('f: nothing for a turno of another campus',
  format('SELECT public.ninos_prechecks_pendientes(%L, %L)::text', pg_temp.id('tu', 4), pg_temp.ctx('hoy')), '[]');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('f: a parent sees nothing',
  format('SELECT public.ninos_prechecks_pendientes(%L, %L)::text', pg_temp.id('tu', 1), pg_temp.ctx('hoy')), '[]');

-- ── g. resolved at the table ─────────────────────────────────────────

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('g: the anfitrión discards PR1',
  format($q$SELECT public.ninos_preregistro_resolver(%L::uuid, 'descartar') ->> 'estado'$q$, pg_temp.ctx('pr1')),
  'descartado');
SELECT pg_temp.assert_eq('g: PR1 leaves the list',
  format($q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_prechecks_pendientes(%L, %L)) f
             WHERE f ->> 'preregistro_id' = %L$q$, pg_temp.id('tu', 1), pg_temp.ctx('hoy'), pg_temp.ctx('pr1')),
  '0');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_raises('g: a resolved pre-registration takes no notice', pg_temp.avisar('pr1', 'tok-1', 1), '42501', 'sin_autoridad');
RESET ROLE;

-- ── h. rate limit ────────────────────────────────────────────────────

SELECT pg_temp.run('h: five notices from one ip in the last minutes', format($q$
  INSERT INTO public.ninos_preregistro_avisos (preregistro_id, turno_id, fecha, ip_hash)
  SELECT %L::uuid, %L::uuid, %L::date - n, repeat('c', 64) FROM generate_series(1, 5) n$q$,
  pg_temp.ctx('pr2'), pg_temp.id('tu', 1), pg_temp.ctx('hoy')));
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_eq('h: the sixth answers limite', pg_temp.avisar('pr5', 'tok-5', 1, repeat('c', 64)), 'limite');
SELECT pg_temp.assert_eq('h: another ip still works', pg_temp.avisar('pr5', 'tok-5', 1, repeat('d', 64)), 'ok');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_qr_failures;

ROLLBACK;
