-- T3a (odd/tasks/ninos-checkin-pco.md, S10, S6, S9.2, S9.3) — print queue
-- for the check-in labels (20261109100000_ninos_impresion.sql).
--
-- Covers:
--   a. Permissions: anon and a random user are refused; the agent RPCs are
--      service_role only; no direct table access; every function is
--      SECURITY DEFINER (or internal) with an empty search_path; RLS on.
--   b. Stations: only the room authority (ninos_puede_configurar) creates,
--      rotates and updates; the token comes back once, 64 hex, and only its
--      sha256 is stored; rotating invalidates the old one; label size NULL
--      until measured, invalid sizes refused (datos_invalidos).
--   c. Listing: the campuses where I operate, with puede_administrar.
--   d. Enqueue after a check-in: one child label per child + one parent label
--      per código, payload built from the DB with exactly the S10 keys (no
--      phone, cédula, allergy text, salón on the receipt, nor custody);
--      visita 'primera' / 'visitante' / null from the prior check-in dates
--      (S9.3); the hour of a dated turno comes from its planned date;
--      refusals store nothing.
--   e. Reprint (S10 "Anfitriones y coordinación, con motivo"): todas /
--      representante / nino with a reason se_trabo / se_perdio / otro (otro
--      needs a note, at most 200); who and when are stored; the código never
--      changes; the coordinator may reprint; a child of a salón the caller does
--      not operate is not found.
--   f. Agent: token lookup + heartbeat, claim without double claim, retry of a
--      stale claim, max attempts → sin_respuesta, old job → vencida, report
--      transitions (first result wins), scoped to the station.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing is kept. Fixture rows
-- use the f9c60000-0000-4000-9c6x-... namespace and the 'ZZ Im' prefix. The
-- last statement is a SELECT of the failing cases ('all cases ok' when none).
--
-- Identities (usuario n = auth n): 1 ANFITRION, 2 COORDINADOR (coordinate on
-- W), 3 RANDOM. Tree: R → W → Anfitriones; R → U. Room S1 (waumba) and S2
-- (upstreet) in W, S3 in U (nobody here operates it), all on the Barquisimeto
-- campus. Station E3 lives on another campus.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_im_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_im_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_im_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- The statement fails with p_sqlstate (and the message p_message when given).
CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate OR (p_message IS NOT NULL AND SQLERRM <> p_message) THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('f9c60000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9c61' WHEN 'us' THEN '9c62' WHEN 'eq' THEN '9c64'
                       WHEN 'ro' THEN '9c65' WHEN 'sa' THEN '9c66' WHEN 'es' THEN '9c67' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('au', p_n), 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', '', true);
$$;

-- sha256 hex of a text, as the app hashes the Bearer token.
CREATE OR REPLACE FUNCTION pg_temp.h(p_text text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(p_text, 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_im_ctx WHERE k = p_k;
$$;

-- The service of the fixtures.
CREATE OR REPLACE FUNCTION pg_temp.fecha() RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT DATE '2099-03-07';
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_im_ctx (k, v)
SELECT 'turno', t.id::text FROM public.dream_team_turnos t JOIN public.campus c ON c.id = t.campus_id
 WHERE c.nombre = 'Barquisimeto' AND t.dia_semana = 0 AND t.activo AND t.tipo = 'semanal'
 ORDER BY t.hora, t.id LIMIT 1;
INSERT INTO t_im_ctx (k, v)
SELECT 'campus', t.campus_id::text FROM public.dream_team_turnos t WHERE t.id = pg_temp.ctx('turno')::uuid;
INSERT INTO t_im_ctx (k, v)
SELECT 'otro_campus', c.id::text FROM public.campus c WHERE c.id <> pg_temp.ctx('campus')::uuid ORDER BY c.nombre, c.id LIMIT 1;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'im-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 3) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Im', 'U' || n, 'im-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 3) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Im R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Im W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', pg_temp.id('eq', 1), 'ZZ Im U', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 3) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 2), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Im S1', 20, 0, 1, -100),
  (pg_temp.id('sa', 2), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'upstreet', 'ZZ Im S2', 20, 2, 5, -99),
  (pg_temp.id('sa', 3), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 4), 'upstreet', 'ZZ Im S3', 20, 0, 5, -98);

-- A station on another campus (nobody here operates it) and an inactive one here.
INSERT INTO public.ninos_estaciones_impresion (id, campus_id, nombre, token_hash) VALUES
  (pg_temp.id('es', 3), pg_temp.ctx('otro_campus')::uuid, 'ZZ Im Otra', pg_temp.h('zz-im-otra')),
  (pg_temp.id('es', 4), pg_temp.ctx('campus')::uuid, 'ZZ Im Apagada', pg_temp.h('zz-im-apagada'));
UPDATE public.ninos_estaciones_impresion SET activa = false WHERE id = pg_temp.id('es', 4);

GRANT INSERT, SELECT, UPDATE ON t_im_failures, t_im_ctx TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.id(text, int), pg_temp.as_user(int), pg_temp.as_nobody(),
  pg_temp.ctx(text), pg_temp.h(text), pg_temp.fecha()
  TO authenticated, anon, service_role;

-- A family of two children (one with allergies), checked in by the anfitrión.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
INSERT INTO t_im_ctx (k, v)
SELECT 'padre', public.ninos_registrar_familia(jsonb_build_object(
  'padre', jsonb_build_object('nombre', 'ZZ Im Mamá', 'apellido', 'Prueba', 'telefono', '0414-555-9611', 'genero', 'Femenino'),
  'hijos', jsonb_build_array(
    jsonb_build_object('nombre', 'ZZ Im Uno', 'apellido', 'Prueba', 'fecha_nacimiento', '2021-05-01', 'genero', 'Femenino',
                       'grado', 0, 'alergias', 'Maní'),
    jsonb_build_object('nombre', 'ZZ Im Dos', 'apellido', 'Prueba', 'fecha_nacimiento', '2017-06-01', 'genero', 'Masculino',
                       'grado', 3)),
  'autorizados', '[]'::jsonb)) ->> 'padre_id';
RESET ROLE;
INSERT INTO t_im_ctx (k, v)
SELECT 'n1', u.id::text FROM public.usuarios u WHERE u.nombre = 'ZZ Im Uno' AND u.apellido = 'Prueba';
INSERT INTO t_im_ctx (k, v)
SELECT 'n2', u.id::text FROM public.usuarios u WHERE u.nombre = 'ZZ Im Dos' AND u.apellido = 'Prueba';
-- A third child with a ficha who is not checked in.
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento)
VALUES (pg_temp.id('us', 9), 'ZZ Im Fuera', 'Prueba', 'No especificado', 'Masculino', DATE '2019-01-01');
INSERT INTO public.ninos_fichas (usuario_id, grado) VALUES (pg_temp.id('us', 9), 1);

-- S9.3: Dos came once before (visitante); Uno never (primera vez).
INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, salida_at)
VALUES (pg_temp.ctx('n2')::uuid, pg_temp.id('sa', 2), pg_temp.ctx('turno')::uuid, pg_temp.ctx('campus')::uuid,
        pg_temp.fecha() - 7, gen_random_uuid(), '1111', now());
-- S9.2: a custody restriction on Uno never reaches a label.
INSERT INTO public.ninos_custodia_restricciones (nino_id, persona_nombre, relacion, respaldo)
VALUES (pg_temp.ctx('n1')::uuid, 'ZZ Im Restringido', 'padre', 'ZZ Im orden del tribunal');

-- A dated turno (S8.1) planned on the fixture date at 18:30, not at its own hour.
INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, tipo)
VALUES (pg_temp.id('sa', 20), pg_temp.ctx('campus')::uuid, 'ZZ Im Retiro', 6, '08:00', 'fechas');
INSERT INTO public.dream_team_turno_fechas (turno_id, fecha, hora) VALUES (pg_temp.id('sa', 20), pg_temp.fecha(), '18:30');
INSERT INTO public.ninos_eventos (id, campus_id, nombre, tipo, fecha_inicio)
VALUES (pg_temp.id('sa', 21), pg_temp.ctx('campus')::uuid, 'ZZ Im Retiro', 'unico', pg_temp.fecha());
INSERT INTO public.ninos_evento_horarios (evento_id, turno_id, turno_creado)
VALUES (pg_temp.id('sa', 21), pg_temp.id('sa', 20), true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
INSERT INTO t_im_ctx (k, v)
SELECT 'codigo', min(codigo) FROM public.ninos_checkin(ARRAY[pg_temp.ctx('n1')::uuid, pg_temp.ctx('n2')::uuid],
  pg_temp.ctx('turno')::uuid, pg_temp.fecha(), ARRAY[pg_temp.id('sa', 1), pg_temp.id('sa', 2)]);
INSERT INTO t_im_ctx (k, v)
SELECT 'codigo_retiro', min(codigo) FROM public.ninos_checkin(ARRAY[pg_temp.id('us', 9)],
  pg_temp.id('sa', 20), pg_temp.fecha(), ARRAY[pg_temp.id('sa', 1)]);
RESET ROLE;

-- ── a. permissions ───────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: who may execute each RPC (anon / authenticated)',
  $q$SELECT string_agg(f || '=' || has_function_privilege('anon', f, 'EXECUTE')::text
                         || '/' || has_function_privilege('authenticated', f, 'EXECUTE')::text, ',' ORDER BY f)
       FROM unnest(ARRAY[
         'public.ninos_impresion_estaciones()',
         'public.ninos_impresion_estacion_crear(uuid, text, numeric, numeric, integer)',
         'public.ninos_impresion_estacion_rotar_token(uuid)',
         'public.ninos_impresion_estacion_actualizar(uuid, text, numeric, numeric, integer, boolean)',
         'public.ninos_impresion_encolar(uuid, uuid, date, uuid[])',
         'public.ninos_impresion_reimprimir(uuid, uuid, date, text, text, uuid, text, text)',
         'public.ninos_impresion_agente_estacion(text)',
         'public.ninos_impresion_agente_reclamar(uuid, integer)',
         'public.ninos_impresion_agente_reportar(uuid, uuid, text, text)',
         'public.ninos_impresion_insertar(uuid, uuid[], boolean, boolean, text, text)',
         'public.ninos_impresion_estacion_operable(uuid)',
         'public.ninos_impresion_nuevo_token()']) AS f$q$,
  'public.ninos_impresion_agente_estacion(text)=false/false,'
  'public.ninos_impresion_agente_reclamar(uuid, integer)=false/false,'
  'public.ninos_impresion_agente_reportar(uuid, uuid, text, text)=false/false,'
  'public.ninos_impresion_encolar(uuid, uuid, date, uuid[])=false/true,'
  'public.ninos_impresion_estacion_actualizar(uuid, text, numeric, numeric, integer, boolean)=false/true,'
  'public.ninos_impresion_estacion_crear(uuid, text, numeric, numeric, integer)=false/true,'
  'public.ninos_impresion_estacion_operable(uuid)=false/false,'
  'public.ninos_impresion_estacion_rotar_token(uuid)=false/true,'
  'public.ninos_impresion_estaciones()=false/true,'
  'public.ninos_impresion_insertar(uuid, uuid[], boolean, boolean, text, text)=false/false,'
  'public.ninos_impresion_nuevo_token()=false/false,'
  'public.ninos_impresion_reimprimir(uuid, uuid, date, text, text, uuid, text, text)=false/true');
SELECT pg_temp.assert_eq('a: the old reprint and insert signatures are gone',
  $q$SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('ninos_impresion_reimprimir', 'ninos_impresion_insertar')$q$, '2');
SELECT pg_temp.assert_eq('a: service_role executes the three agent RPCs',
  $q$SELECT bool_and(has_function_privilege('service_role', f, 'EXECUTE'))::text
       FROM unnest(ARRAY['public.ninos_impresion_agente_estacion(text)', 'public.ninos_impresion_agente_reclamar(uuid, integer)',
                         'public.ninos_impresion_agente_reportar(uuid, uuid, text, text)']) AS f$q$, 'true');
SELECT pg_temp.assert_eq('a: every new function has an empty search_path; RPCs are SECURITY DEFINER',
  $q$SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
                                               WHERE c LIKE 'search_path=%' AND replace(substr(c, 13), '"', '') = ''))
         || ':' || count(*) FILTER (WHERE NOT p.prosecdef AND p.proname NOT IN ('ninos_impresion_medidas_validas', 'ninos_impresion_estacion_fila'))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'ninos_impresion%'$q$, '0:0');
SELECT pg_temp.assert_eq('a: RLS on both tables, no policies, no table privileges for anon / authenticated',
  $q$SELECT string_agg(c.relname || '=' || c.relrowsecurity::text
                         || '/' || (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid = c.oid)
                         || '/' || has_table_privilege('authenticated', c.oid, 'SELECT')::text
                         || '/' || has_table_privilege('anon', c.oid, 'SELECT')::text, ',' ORDER BY c.relname)
       FROM pg_class c WHERE c.oid IN ('public.ninos_estaciones_impresion'::regclass, 'public.ninos_impresiones'::regclass)$q$,
  'ninos_estaciones_impresion=true/0/false/false,ninos_impresiones=true/0/false/false');

SET LOCAL ROLE anon;
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_raises('a: anon cannot list stations',
  $q$SELECT * FROM public.ninos_impresion_estaciones()$q$, '42501');
SELECT pg_temp.assert_raises('a: anon cannot enqueue',
  $q$SELECT public.ninos_impresion_encolar(pg_temp.id('es', 4), pg_temp.ctx('turno')::uuid, pg_temp.fecha(), ARRAY[pg_temp.ctx('n1')::uuid])$q$, '42501');
SELECT pg_temp.assert_raises('a: anon cannot call the agent',
  $q$SELECT public.ninos_impresion_agente_estacion(pg_temp.h('zz-im-otra'))$q$, '42501');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_raises('a: an authenticated user cannot call the agent lookup',
  $q$SELECT public.ninos_impresion_agente_estacion(pg_temp.h('zz-im-otra'))$q$, '42501');
SELECT pg_temp.assert_raises('a: nor claim jobs',
  $q$SELECT public.ninos_impresion_agente_reclamar(pg_temp.id('es', 3), 10)$q$, '42501');
SELECT pg_temp.assert_raises('a: nor report them',
  $q$SELECT public.ninos_impresion_agente_reportar(pg_temp.id('es', 3), pg_temp.id('es', 3), 'impresa', NULL)$q$, '42501');
SELECT pg_temp.assert_raises('a: nor read the stations table',
  $q$SELECT count(*) FROM public.ninos_estaciones_impresion$q$, '42501');
SELECT pg_temp.assert_raises('a: nor read the jobs table',
  $q$SELECT count(*) FROM public.ninos_impresiones$q$, '42501');
SELECT pg_temp.as_user(3);
SELECT pg_temp.assert_raises('a: a random user cannot list stations',
  $q$SELECT * FROM public.ninos_impresion_estaciones()$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: a random user cannot enqueue',
  $q$SELECT public.ninos_impresion_encolar(pg_temp.id('es', 4), pg_temp.ctx('turno')::uuid, pg_temp.fecha(), ARRAY[pg_temp.ctx('n1')::uuid])$q$,
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: a random user cannot create a station',
  $q$SELECT public.ninos_impresion_estacion_crear(pg_temp.ctx('campus')::uuid, 'ZZ Im Nope', NULL, NULL, NULL)$q$,
  '42501', 'sin_autoridad');
RESET ROLE;

-- ── b. stations ──────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_raises('b: an anfitrión cannot create a station',
  $q$SELECT public.ninos_impresion_estacion_crear(pg_temp.ctx('campus')::uuid, 'ZZ Im Nope', NULL, NULL, NULL)$q$,
  '42501', 'sin_autoridad');
SELECT pg_temp.as_user(2);
SELECT pg_temp.assert_raises('b: the coordinator cannot create one on a campus without their rooms',
  $q$SELECT public.ninos_impresion_estacion_crear(pg_temp.ctx('otro_campus')::uuid, 'ZZ Im Nope', NULL, NULL, NULL)$q$,
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('b: only one of ancho / alto is refused',
  $q$SELECT public.ninos_impresion_estacion_crear(pg_temp.ctx('campus')::uuid, 'ZZ Im Mesa', 50, NULL, NULL)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('b: a width over the printer range is refused',
  $q$SELECT public.ninos_impresion_estacion_crear(pg_temp.ctx('campus')::uuid, 'ZZ Im Mesa', 200, 30, NULL)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('b: a dpi other than 203 / 300 is refused',
  $q$SELECT public.ninos_impresion_estacion_crear(pg_temp.ctx('campus')::uuid, 'ZZ Im Mesa', NULL, NULL, 600)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('b: a blank name is refused',
  $q$SELECT public.ninos_impresion_estacion_crear(pg_temp.ctx('campus')::uuid, '  ', NULL, NULL, NULL)$q$, '22023', 'datos_invalidos');
INSERT INTO t_im_ctx (k, v)
SELECT 'crear', public.ninos_impresion_estacion_crear(pg_temp.ctx('campus')::uuid, '  ZZ Im Mesa  ', NULL, NULL, NULL)::text;
RESET ROLE;
INSERT INTO t_im_ctx (k, v) SELECT 'e1', pg_temp.ctx('crear')::jsonb #>> '{estacion,id}';
INSERT INTO t_im_ctx (k, v) SELECT 'token1', pg_temp.ctx('crear')::jsonb ->> 'token';

SELECT pg_temp.assert_eq('b: the coordinator creates a station: unknown size, 203 dpi, active, trimmed name',
  $q$SELECT concat_ws('|', e ->> 'nombre', coalesce(e ->> 'ancho_mm', '-'), coalesce(e ->> 'alto_mm', '-'), e ->> 'dpi', e ->> 'activa',
                       (e ? 'token_hash')::text)
       FROM (SELECT pg_temp.ctx('crear')::jsonb -> 'estacion' AS e) x$q$, 'ZZ Im Mesa|-|-|203|true|false');
SELECT pg_temp.assert_eq('b: the token is 64 hex chars and only its sha256 is stored',
  $q$SELECT (pg_temp.ctx('token1') ~ '^[0-9a-f]{64}$')::text || ':' || (e.token_hash = pg_temp.h(pg_temp.ctx('token1')))::text
         || ':' || (e.token_hash <> pg_temp.ctx('token1'))::text || ':' || (e.created_by = pg_temp.id('us', 2))::text
       FROM public.ninos_estaciones_impresion e WHERE e.id = pg_temp.ctx('e1')::uuid$q$, 'true:true:true:true');
SELECT pg_temp.assert_eq('b: the plain token appears in no stored row',
  $q$SELECT count(*)::text FROM public.ninos_estaciones_impresion e WHERE e::text LIKE '%' || pg_temp.ctx('token1') || '%'$q$, '0');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_raises('b: an anfitrión cannot rotate the token',
  $q$SELECT public.ninos_impresion_estacion_rotar_token(pg_temp.ctx('e1')::uuid)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('b: an anfitrión cannot change the label size',
  $q$SELECT public.ninos_impresion_estacion_actualizar(pg_temp.ctx('e1')::uuid, 'ZZ Im Mesa', 50, 30, 203, true)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_user(2);
INSERT INTO t_im_ctx (k, v)
SELECT 'token1b', public.ninos_impresion_estacion_rotar_token(pg_temp.ctx('e1')::uuid) ->> 'token';
SELECT pg_temp.assert_eq('b: the coordinator sets the measured size',
  $q$SELECT r ->> 'ancho_mm' || 'x' || (r ->> 'alto_mm') || '@' || (r ->> 'dpi')
       FROM public.ninos_impresion_estacion_actualizar(pg_temp.ctx('e1')::uuid, 'ZZ Im Mesa', 50, 30, 203, true) AS t(r)$q$, '50.0x30.0@203');
SELECT pg_temp.assert_raises('b: update refuses a missing activa',
  $q$SELECT public.ninos_impresion_estacion_actualizar(pg_temp.ctx('e1')::uuid, 'ZZ Im Mesa', 50, 30, 203, NULL)$q$, '22023', 'datos_invalidos');
-- A second active station on the same campus, for the scope of the agent.
INSERT INTO t_im_ctx (k, v)
SELECT 'crear2', public.ninos_impresion_estacion_crear(pg_temp.ctx('campus')::uuid, 'ZZ Im Mesa 2', 62, 40, 300)::text;
RESET ROLE;
INSERT INTO t_im_ctx (k, v) SELECT 'e2', pg_temp.ctx('crear2')::jsonb #>> '{estacion,id}';
INSERT INTO t_im_ctx (k, v) SELECT 'token2', pg_temp.ctx('crear2')::jsonb ->> 'token';
SELECT pg_temp.assert_eq('b: rotating stores the new hash; the old token is gone',
  $q$SELECT (pg_temp.ctx('token1b') <> pg_temp.ctx('token1'))::text || ':' || (e.token_hash = pg_temp.h(pg_temp.ctx('token1b')))::text
         || ':' || (SELECT count(*) FROM public.ninos_estaciones_impresion x WHERE x.token_hash = pg_temp.h(pg_temp.ctx('token1')))
       FROM public.ninos_estaciones_impresion e WHERE e.id = pg_temp.ctx('e1')::uuid$q$, 'true:true:0');

-- ── c. listing ───────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('c: the anfitrión sees the stations of their campus, without admin',
  $q$SELECT string_agg(nombre || ':' || activa::text || ':' || puede_administrar::text, ',' ORDER BY nombre)
       FROM public.ninos_impresion_estaciones() WHERE nombre LIKE 'ZZ Im%'$q$,
  'ZZ Im Apagada:false:false,ZZ Im Mesa:true:false,ZZ Im Mesa 2:true:false');
SELECT pg_temp.as_user(2);
SELECT pg_temp.assert_eq('c: the coordinator sees them with admin and the size',
  $q$SELECT string_agg(nombre || ':' || coalesce(ancho_mm::text, '-') || ':' || puede_administrar::text, ',' ORDER BY nombre)
       FROM public.ninos_impresion_estaciones() WHERE nombre LIKE 'ZZ Im%'$q$,
  'ZZ Im Apagada:-:true,ZZ Im Mesa:50.0:true,ZZ Im Mesa 2:62.0:true');
RESET ROLE;

-- ── d. enqueue after a check-in ──────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_raises('d: a station of another campus is not found',
  $q$SELECT public.ninos_impresion_encolar(pg_temp.id('es', 3), pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       ARRAY[pg_temp.ctx('n1')::uuid, pg_temp.ctx('n2')::uuid])$q$, '22023', 'estacion_no_encontrada');
SELECT pg_temp.assert_raises('d: an inactive station is refused',
  $q$SELECT public.ninos_impresion_encolar(pg_temp.id('es', 4), pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       ARRAY[pg_temp.ctx('n1')::uuid, pg_temp.ctx('n2')::uuid])$q$, '22023', 'estacion_inactiva');
SELECT pg_temp.assert_raises('d: a child who is not checked in is refused',
  $q$SELECT public.ninos_impresion_encolar(pg_temp.ctx('e1')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       ARRAY[pg_temp.ctx('n1')::uuid, pg_temp.id('us', 9)])$q$, '22023', 'checkin_no_encontrado');
SELECT pg_temp.assert_raises('d: another date is refused',
  $q$SELECT public.ninos_impresion_encolar(pg_temp.ctx('e1')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha() + 7,
       ARRAY[pg_temp.ctx('n1')::uuid])$q$, '22023', 'checkin_no_encontrado');
SELECT pg_temp.assert_raises('d: an empty list is refused',
  $q$SELECT public.ninos_impresion_encolar(pg_temp.ctx('e1')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(), '{}'::uuid[])$q$,
  '22023', 'datos_invalidos');
RESET ROLE;
SELECT pg_temp.assert_eq('d: refusals store nothing',
  $q$SELECT count(*)::text FROM public.ninos_impresiones i
       JOIN public.ninos_estaciones_impresion e ON e.id = i.estacion_id WHERE e.nombre LIKE 'ZZ Im%'$q$, '0');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('d: two children → two child labels and one parent label',
  $q$SELECT public.ninos_impresion_encolar(pg_temp.ctx('e1')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       ARRAY[pg_temp.ctx('n1')::uuid, pg_temp.ctx('n2')::uuid])::text$q$, '{"ninos": 2, "representantes": 1}');
RESET ROLE;

SELECT pg_temp.assert_eq('d: stored as pendiente, never claimed, by the anfitrión',
  $q$SELECT string_agg(i.tipo || ':' || i.estado || ':' || i.intentos || ':' || (i.reclamada_at IS NULL)::text
                         || ':' || (i.created_by = pg_temp.id('us', 1))::text, ',' ORDER BY i.tipo, i.payload ->> 'nombre')
       FROM public.ninos_impresiones i WHERE i.estacion_id = pg_temp.ctx('e1')::uuid$q$,
  'nino:pendiente:0:true:true,nino:pendiente:0:true:true,representante:pendiente:0:true:true');
SELECT pg_temp.assert_eq('d: the child label carries exactly the S10 keys',
  $q$SELECT string_agg(DISTINCT k, ',' ORDER BY k) FROM public.ninos_impresiones i, jsonb_object_keys(i.payload) k
      WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND i.tipo = 'nino'$q$,
  'alergias,apellido,area,codigo,fecha,hora,nombre,salon,servicio,visita');
SELECT pg_temp.assert_eq('d: the parent label carries exactly the S10 keys',
  $q$SELECT string_agg(DISTINCT k, ',' ORDER BY k) FROM public.ninos_impresiones i, jsonb_object_keys(i.payload) k
      WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND i.tipo = 'representante'$q$,
  'areas,codigo,fecha,hora,ninos,servicio');
SELECT pg_temp.assert_eq('d: child labels: name, room, area, allergy flag, código and date from the DB',
  $q$SELECT string_agg(concat_ws('|', p ->> 'nombre', p ->> 'apellido', p ->> 'salon', p ->> 'area', p ->> 'alergias',
                                 (p ->> 'codigo' = pg_temp.ctx('codigo'))::text, p ->> 'fecha'), ',' ORDER BY p ->> 'nombre')
       FROM (SELECT i.payload AS p FROM public.ninos_impresiones i
              WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND i.tipo = 'nino') x$q$,
  'ZZ Im Dos|Prueba|ZZ Im S2|upstreet|false|true|2099-03-07,ZZ Im Uno|Prueba|ZZ Im S1|waumba|true|true|2099-03-07');
SELECT pg_temp.assert_eq('d: visita from the prior dates (S9.3): Uno primera, Dos visitante',
  $q$SELECT string_agg(i.payload ->> 'nombre' || '=' || coalesce(i.payload ->> 'visita', 'null'), ',' ORDER BY i.payload ->> 'nombre')
       FROM public.ninos_impresiones i WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND i.tipo = 'nino'$q$,
  'ZZ Im Dos=visitante,ZZ Im Uno=primera');
SELECT pg_temp.assert_eq('d: the original labels have no reprint reason',
  $q$SELECT count(*)::text FROM public.ninos_impresiones i
      WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND (i.motivo IS NOT NULL OR i.nota IS NOT NULL)$q$, '0');
SELECT pg_temp.assert_eq('d: the service name and hour come from the turno',
  $q$SELECT bool_and(i.payload ->> 'servicio' = t.nombre AND i.payload ->> 'hora' = to_char(t.hora, 'HH24:MI'))::text
       FROM public.ninos_impresiones i, public.dream_team_turnos t
      WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND t.id = pg_temp.ctx('turno')::uuid$q$, 'true');
SELECT pg_temp.assert_eq('d: parent label: código, both first names, both areas',
  $q$SELECT concat_ws('|', (p ->> 'codigo' = pg_temp.ctx('codigo'))::text, p ->> 'ninos', p ->> 'areas', p ->> 'fecha')
       FROM (SELECT i.payload AS p FROM public.ninos_impresiones i
              WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND i.tipo = 'representante') x$q$,
  'true|["ZZ Im Dos", "ZZ Im Uno"]|["upstreet", "waumba"]|2099-03-07');
SELECT pg_temp.assert_eq('d: no phone, allergy text or parent name in any payload',
  $q$SELECT count(*)::text FROM public.ninos_impresiones i
      WHERE i.estacion_id = pg_temp.ctx('e1')::uuid
        AND (i.payload::text LIKE '%0414%' OR i.payload::text LIKE '%Maní%' OR i.payload::text LIKE '%Mamá%'
             OR i.payload::text LIKE '%Restringido%' OR i.payload::text LIKE '%tribunal%')$q$, '0');
SELECT pg_temp.assert_eq('d: the receipt never carries a salón',
  $q$SELECT count(*)::text FROM public.ninos_impresiones i
      WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND i.tipo = 'representante' AND i.payload::text LIKE '%ZZ Im S%'$q$, '0');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('d: a dated turno enqueues on another station',
  $q$SELECT public.ninos_impresion_encolar(pg_temp.ctx('e2')::uuid, pg_temp.id('sa', 20), pg_temp.fecha(),
       ARRAY[pg_temp.id('us', 9)])::text$q$, '{"ninos": 1, "representantes": 1}');
RESET ROLE;
SELECT pg_temp.assert_eq('d: its labels carry the planned hour of that date and the turno name; the first visit',
  $q$SELECT string_agg(i.tipo || ':' || (i.payload ->> 'servicio') || ':' || (i.payload ->> 'hora')
                         || ':' || coalesce(i.payload ->> 'visita', '-'), ',' ORDER BY i.tipo)
       FROM public.ninos_impresiones i WHERE i.estacion_id = pg_temp.ctx('e2')::uuid$q$,
  'nino:ZZ Im Retiro:18:30:primera,representante:ZZ Im Retiro:18:30:-');
DELETE FROM public.ninos_impresiones WHERE estacion_id = pg_temp.ctx('e2')::uuid;

-- ── e. reprint ───────────────────────────────────────────────────────

-- Fuera is also checked in in S3 (room U) in the Sunday service, with its own código.
INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo)
VALUES (pg_temp.id('us', 9), pg_temp.id('sa', 3), pg_temp.ctx('turno')::uuid, pg_temp.ctx('campus')::uuid,
        pg_temp.fecha(), gen_random_uuid(), '0003');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('e: reprint the parent label only (se_perdio)',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'representante', NULL, 'se_perdio', NULL)::text$q$, '{"ninos": 0, "representantes": 1}');
SELECT pg_temp.assert_eq('e: reprint one child label (se_trabo)',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'nino', pg_temp.ctx('n1')::uuid, 'se_trabo', NULL)::text$q$, '{"ninos": 1, "representantes": 0}');
SELECT pg_temp.as_user(2);
SELECT pg_temp.assert_eq('e: coordination reprints everything of the visit (otro with a note)',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'todas', NULL, 'otro', '  Se mojó el papel  ')::text$q$, '{"ninos": 2, "representantes": 1}');
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_raises('e: a reason is required',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'todas', NULL, NULL, NULL)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('e: a reason outside the list is refused',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'todas', NULL, 'porque_si', NULL)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('e: otro needs a note',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'todas', NULL, 'otro', '   ')$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('e: a note over 200 characters is refused',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'todas', NULL, 'se_trabo', repeat('x', 201))$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('e: a child reprint needs the child',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'nino', NULL, 'se_trabo', NULL)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('e: an unknown kind is refused',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'otra', NULL, 'se_trabo', NULL)$q$, '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('e: a código never issued is not found',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       '0000', 'todas', NULL, 'se_trabo', NULL)$q$, '22023', 'checkin_no_encontrado');
SELECT pg_temp.assert_raises('e: a child of a salón the anfitrión does not operate is not found',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       '0003', 'todas', NULL, 'se_perdio', NULL)$q$, '22023', 'checkin_no_encontrado');
SELECT pg_temp.as_user(3);
SELECT pg_temp.assert_raises('e: a random user cannot reprint',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'todas', NULL, 'se_trabo', NULL)$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('e: station 2 holds the 6 reprinted labels',
  $q$SELECT string_agg(i.tipo || '=' || n, ',' ORDER BY i.tipo) FROM (
       SELECT i.tipo, count(*) AS n FROM public.ninos_impresiones i WHERE i.estacion_id = pg_temp.ctx('e2')::uuid GROUP BY i.tipo) i$q$,
  'nino=3,representante=2');
SELECT pg_temp.assert_eq('e: each reprint stores its reason, the trimmed note, who and when',
  $q$SELECT string_agg(DISTINCT i.motivo || ':' || coalesce(i.nota, '-') || ':'
                         || CASE i.created_by WHEN pg_temp.id('us', 1) THEN 'anfitrion' WHEN pg_temp.id('us', 2) THEN 'coordinador' END
                         || ':' || (i.created_at IS NOT NULL)::text, ',')
       FROM public.ninos_impresiones i WHERE i.estacion_id = pg_temp.ctx('e2')::uuid$q$,
  'otro:Se mojó el papel:coordinador:true,se_perdio:-:anfitrion:true,se_trabo:-:anfitrion:true');
SELECT pg_temp.assert_eq('e: the pickup código never changes: same check-ins, same código on every label',
  $q$SELECT (SELECT string_agg(DISTINCT c.codigo, ',') FROM public.ninos_checkins c
              WHERE c.nino_id IN (pg_temp.ctx('n1')::uuid, pg_temp.ctx('n2')::uuid) AND c.fecha = pg_temp.fecha())
         || '|' || (SELECT string_agg(DISTINCT i.payload ->> 'codigo', ',') FROM public.ninos_impresiones i
                     WHERE i.estacion_id = pg_temp.ctx('e2')::uuid)
         || '|' || (pg_temp.ctx('codigo') IS NOT NULL)::text$q$,
  (SELECT pg_temp.ctx('codigo') || '|' || pg_temp.ctx('codigo') || '|true'));

-- A later date makes Dos regular: the reprint recomputes visita from the DB.
INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, salida_at)
SELECT pg_temp.ctx('n2')::uuid, pg_temp.id('sa', 2), pg_temp.ctx('turno')::uuid, pg_temp.ctx('campus')::uuid,
       pg_temp.fecha() - d, gen_random_uuid(), '1111', now()
  FROM unnest(ARRAY[14, 21]) AS d;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('e: setup reprint Dos as a regular',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e2')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'nino', pg_temp.ctx('n2')::uuid, 'se_trabo', NULL) ->> 'ninos'$q$, '1');
RESET ROLE;
SELECT pg_temp.assert_eq('e: a regular (3 prior dates) has no visita mark',
  $q$SELECT coalesce(i.payload ->> 'visita', 'null') FROM public.ninos_impresiones i
      WHERE i.estacion_id = pg_temp.ctx('e2')::uuid AND i.tipo = 'nino' AND i.payload ->> 'nombre' = 'ZZ Im Dos'
      ORDER BY i.created_at DESC, i.id LIMIT 1$q$, 'null');
DELETE FROM public.ninos_impresiones i
 WHERE i.estacion_id = pg_temp.ctx('e2')::uuid AND i.id = (
   SELECT x.id FROM public.ninos_impresiones x
    WHERE x.estacion_id = pg_temp.ctx('e2')::uuid AND x.tipo = 'nino' AND x.payload ->> 'nombre' = 'ZZ Im Dos' AND x.payload ->> 'visita' IS NULL);

-- ── f. agent ─────────────────────────────────────────────────────────

SET LOCAL ROLE service_role;
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_eq('f: the token hash finds its active station with the label size, no secret beyond the hash',
  $q$SELECT concat_ws('|', (r ->> 'id' = pg_temp.ctx('e1'))::text, r ->> 'ancho_mm', r ->> 'alto_mm', r ->> 'dpi',
                       (r ->> 'token_hash' = pg_temp.h(pg_temp.ctx('token1b')))::text)
       FROM public.ninos_impresion_agente_estacion(pg_temp.h(pg_temp.ctx('token1b'))) AS t(r)$q$, 'true|50.0|30.0|203|true');
SELECT pg_temp.assert_eq('f: a rotated-out token finds nothing',
  $q$SELECT coalesce(public.ninos_impresion_agente_estacion(pg_temp.h(pg_temp.ctx('token1')))::text, 'null')$q$, 'null');
SELECT pg_temp.assert_eq('f: an inactive station finds nothing',
  $q$SELECT coalesce(public.ninos_impresion_agente_estacion(pg_temp.h('zz-im-apagada'))::text, 'null')$q$, 'null');
SELECT pg_temp.assert_eq('f: a malformed hash finds nothing',
  $q$SELECT coalesce(public.ninos_impresion_agente_estacion('nope')::text, 'null')$q$, 'null');
RESET ROLE;
SELECT pg_temp.assert_eq('f: the lookup is a heartbeat',
  $q$SELECT (e.ultima_conexion IS NOT NULL)::text FROM public.ninos_estaciones_impresion e WHERE e.id = pg_temp.ctx('e1')::uuid$q$, 'true');

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_eq('f: claim at most 2',
  $q$SELECT jsonb_array_length(public.ninos_impresion_agente_reclamar(pg_temp.ctx('e1')::uuid, 2))::text$q$, '2');
SELECT pg_temp.assert_eq('f: the next claim gets only the remaining one',
  $q$SELECT jsonb_array_length(public.ninos_impresion_agente_reclamar(pg_temp.ctx('e1')::uuid, 10))::text$q$, '1');
SELECT pg_temp.assert_eq('f: nothing is claimed twice',
  $q$SELECT jsonb_array_length(public.ninos_impresion_agente_reclamar(pg_temp.ctx('e1')::uuid, 10))::text$q$, '0');
SELECT pg_temp.assert_eq('f: a claimed job carries id, tipo, payload, intentos and created_at',
  $q$SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(
       public.ninos_impresion_agente_reclamar(pg_temp.ctx('e2')::uuid, 1) -> 0) AS k$q$, 'created_at,id,intentos,payload,tipo');
SELECT pg_temp.assert_raises('f: claiming for an inactive station is refused',
  $q$SELECT public.ninos_impresion_agente_reclamar(pg_temp.id('es', 4), 10)$q$, '22023', 'estacion_no_encontrada');
RESET ROLE;
SELECT pg_temp.assert_eq('f: every job of station 1 was claimed once',
  $q$SELECT string_agg(DISTINCT i.intentos::text || ':' || (i.reclamada_at IS NOT NULL)::text, ',')
       FROM public.ninos_impresiones i WHERE i.estacion_id = pg_temp.ctx('e1')::uuid$q$, '1:true');

-- A claim older than 2 minutes without a report is claimed again.
INSERT INTO t_im_ctx (k, v)
SELECT 'job_viejo', i.id::text FROM public.ninos_impresiones i
 WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND i.tipo = 'representante';
UPDATE public.ninos_impresiones SET reclamada_at = now() - interval '3 minutes' WHERE id = pg_temp.ctx('job_viejo')::uuid;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_eq('f: a stale claim is claimed again with intentos 2',
  $q$SELECT (r -> 0 ->> 'id' = pg_temp.ctx('job_viejo'))::text || ':' || (r -> 0 ->> 'intentos') || ':' || jsonb_array_length(r)
       FROM public.ninos_impresion_agente_reclamar(pg_temp.ctx('e1')::uuid, 10) AS t(r)$q$, 'true:2:1');

-- Reports.
INSERT INTO t_im_ctx (k, v)
SELECT 'job_nino', min(i.id::text) FROM public.ninos_impresiones i
 WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND i.tipo = 'nino';
SELECT pg_temp.assert_eq('f: report printed',
  $q$SELECT public.ninos_impresion_agente_reportar(pg_temp.ctx('e1')::uuid, pg_temp.ctx('job_viejo')::uuid, 'impresa', NULL) ->> 'estado'$q$,
  'impresa');
SELECT pg_temp.assert_eq('f: a later error report keeps the first result',
  $q$SELECT public.ninos_impresion_agente_reportar(pg_temp.ctx('e1')::uuid, pg_temp.ctx('job_viejo')::uuid, 'error', 'late') ->> 'estado'$q$,
  'impresa');
SELECT pg_temp.assert_eq('f: report an error (text capped at 300)',
  $q$SELECT public.ninos_impresion_agente_reportar(pg_temp.ctx('e1')::uuid, pg_temp.ctx('job_nino')::uuid, 'error', repeat('x', 400)) ->> 'estado'$q$,
  'error');
SELECT pg_temp.assert_raises('f: a job of another station is not found',
  $q$SELECT public.ninos_impresion_agente_reportar(pg_temp.ctx('e2')::uuid, pg_temp.ctx('job_nino')::uuid, 'impresa', NULL)$q$,
  '22023', 'trabajo_no_encontrado');
SELECT pg_temp.assert_raises('f: an unknown estado is refused',
  $q$SELECT public.ninos_impresion_agente_reportar(pg_temp.ctx('e1')::uuid, pg_temp.ctx('job_nino')::uuid, 'pendiente', NULL)$q$,
  '22023', 'datos_invalidos');
RESET ROLE;
SELECT pg_temp.assert_eq('f: printed has impresa_at and no error; error has its capped text',
  $q$SELECT string_agg(i.estado || ':' || (i.impresa_at IS NOT NULL)::text || ':' || coalesce(char_length(i.error)::text, '-'), ','
                       ORDER BY i.estado DESC)
       FROM public.ninos_impresiones i WHERE i.id IN (pg_temp.ctx('job_viejo')::uuid, pg_temp.ctx('job_nino')::uuid)$q$,
  'impresa:true:-,error:false:300');

-- An unclaimed job cannot be reported; a fresh enqueue on station 1 gives one.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('f: setup a fresh parent label',
  $q$SELECT public.ninos_impresion_reimprimir(pg_temp.ctx('e1')::uuid, pg_temp.ctx('turno')::uuid, pg_temp.fecha(),
       pg_temp.ctx('codigo'), 'representante', NULL, 'se_perdio', NULL) ->> 'representantes'$q$, '1');
RESET ROLE;
INSERT INTO t_im_ctx (k, v)
SELECT 'job_nuevo', i.id::text FROM public.ninos_impresiones i
 WHERE i.estacion_id = pg_temp.ctx('e1')::uuid AND i.reclamada_at IS NULL;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_raises('f: an unclaimed job cannot be reported',
  $q$SELECT public.ninos_impresion_agente_reportar(pg_temp.ctx('e1')::uuid, pg_temp.ctx('job_nuevo')::uuid, 'impresa', NULL)$q$,
  '22023', 'trabajo_no_encontrado');
RESET ROLE;

-- Max attempts and expiry (station 2): one job at 5 claims with a stale claim,
-- one created 13 hours ago.
INSERT INTO t_im_ctx (k, v)
SELECT 'job_agotado', min(i.id::text) FROM public.ninos_impresiones i
 WHERE i.estacion_id = pg_temp.ctx('e2')::uuid AND i.tipo = 'nino';
INSERT INTO t_im_ctx (k, v)
SELECT 'job_vencido', max(i.id::text) FROM public.ninos_impresiones i
 WHERE i.estacion_id = pg_temp.ctx('e2')::uuid AND i.tipo = 'nino';
UPDATE public.ninos_impresiones SET intentos = 5, reclamada_at = now() - interval '3 minutes'
 WHERE id = pg_temp.ctx('job_agotado')::uuid;
UPDATE public.ninos_impresiones SET created_at = now() - interval '13 hours', reclamada_at = NULL
 WHERE id = pg_temp.ctx('job_vencido')::uuid;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_eq('f: neither the exhausted nor the expired job is handed out',
  $q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_impresion_agente_reclamar(pg_temp.ctx('e2')::uuid, 20)) j
      WHERE j ->> 'id' IN (pg_temp.ctx('job_agotado'), pg_temp.ctx('job_vencido'))$q$, '0');
RESET ROLE;
SELECT pg_temp.assert_eq('f: they end as error sin_respuesta / vencida',
  $q$SELECT string_agg(i.estado || ':' || i.error, ',' ORDER BY i.error)
       FROM public.ninos_impresiones i WHERE i.id IN (pg_temp.ctx('job_agotado')::uuid, pg_temp.ctx('job_vencido')::uuid)$q$,
  'error:sin_respuesta,error:vencida');

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_im_failures;

ROLLBACK;
