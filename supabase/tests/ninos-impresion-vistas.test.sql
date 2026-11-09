-- T3b (odd/tasks/ninos-checkin-pco.md, S10, S6) — the reprints of a campus
-- for «Reimpresiones de hoy» and «Historial»
-- (20261109110000_ninos_impresion_vistas.sql).
--
-- Covers:
--   a. Permissions: anon cannot execute it; authenticated can; SECURITY
--      DEFINER with an empty search_path; a random user, a coordinator of
--      another campus and no campus get sin_autoridad.
--   b. Today (both dates NULL): only the reprints (motivo set) of the campus,
--      newest first, with who, type, child, receipt names, código, reason,
--      note, station and status; the labels of the check-in itself and the
--      reprints of another campus are not listed.
--   c. The anfitrión and the coordinator of the campus read it; the
--      coordinator of the other campus reads only theirs.
--   d. History: an inclusive Caracas date range of at most 31 days; a longer
--      or inverted range is datos_invalidos; one NULL date = that day.
--   e. The status follows the agent (impresa / error with its message).
--   f. Only fixed columns come back: no phone, cédula, allergy text nor custody.
--
-- Self-contained: it creates its own two campuses, turno, equipos and salones,
-- so it runs the same on a scratch database and on STAGING, inside
-- BEGIN…ROLLBACK (nothing is kept). Fixture rows use the
-- f9c70000-0000-4000-9c7x-... namespace and the 'ZZ Iv' prefix. The last
-- statement prints 'RESULT: ALL OK' or the failing cases.
--
-- Identities (usuario n = auth n): 1 ANFITRION of campus A, 2 COORDINADOR of
-- campus A (coordinate on W), 3 RANDOM, 4 COORDINADOR of campus B (coordinate
-- on V). Tree: R → W → Anfitriones (campus A rooms), R → V (campus B room).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_iv_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_iv_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_iv_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9c70000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9c71' WHEN 'us' THEN '9c72' WHEN 'ca' THEN '9c73' WHEN 'eq' THEN '9c74'
                       WHEN 'ro' THEN '9c75' WHEN 'sa' THEN '9c76' WHEN 'es' THEN '9c77' WHEN 'tu' THEN '9c78'
                       WHEN 'ch' THEN '9c79' WHEN 'im' THEN '9c7a' END,
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

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_iv_ctx WHERE k = p_k;
$$;

-- Today in Caracas (the default range) and the service date of the fixtures.
CREATE OR REPLACE FUNCTION pg_temp.hoy() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Caracas')::date;
$$;

-- One row of the reprints as text: tipo|nino|ninos|codigo|motivo|nota|estacion|estado|quien.
CREATE OR REPLACE FUNCTION pg_temp.filas(p_campus uuid, p_desde date, p_hasta date) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(concat_ws('|', r.tipo, coalesce(r.nino, '-'), r.ninos::text, r.codigo, r.motivo,
                                       coalesce(r.nota, '-'), r.estacion, r.estado, coalesce(r.quien, '-')),
                             ';' ORDER BY r.created_at DESC, r.id), '')
    FROM public.ninos_impresion_reimpresiones(p_campus, p_desde, p_hasta) r;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Iv Campus A', 'ZZIVA'),
  (pg_temp.id('ca', 2), 'ZZ Iv Campus B', 'ZZIVB');
INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, tipo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Iv Primer servicio', 0, '09:00', 'semanal'),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 2), 'ZZ Iv Servicio B', 0, '10:00', 'semanal');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'iv-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Iv', 'U' || n, 'iv-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 4) AS n;
-- The children (no account), one with allergies, a phone and a custody note
-- that must never come back.
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento, telefono, cedula) VALUES
  (pg_temp.id('us', 11), 'ZZ Iv Uno', 'Prueba', 'No especificado', 'Femenino', DATE '2021-05-01', '0414-555-9711', 'V-99711'),
  (pg_temp.id('us', 12), 'ZZ Iv Dos', 'Prueba', 'No especificado', 'Masculino', DATE '2017-06-01', NULL, NULL),
  (pg_temp.id('us', 13), 'ZZ Iv Tres', 'Otro', 'No especificado', 'Masculino', DATE '2018-06-01', NULL, NULL);
INSERT INTO public.ninos_fichas (usuario_id, grado, alergias) VALUES
  (pg_temp.id('us', 11), 0, 'ZZ Iv Maní'), (pg_temp.id('us', 12), 3, NULL), (pg_temp.id('us', 13), 2, NULL);
INSERT INTO public.ninos_custodia_restricciones (nino_id, persona_nombre, relacion, respaldo)
VALUES (pg_temp.id('us', 11), 'ZZ Iv Restringido', 'padre', 'ZZ Iv orden del tribunal');

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Iv R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Iv W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', pg_temp.id('eq', 1), 'ZZ Iv V', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 1), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 4) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 2), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 4), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 4)::text);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Iv S1', 20, 0, 1, -100),
  (pg_temp.id('sa', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'upstreet', 'ZZ Iv S2', 20, 2, 5, -99),
  (pg_temp.id('sa', 3), pg_temp.id('ca', 2), pg_temp.id('eq', 4), 'upstreet', 'ZZ Iv S3', 20, 0, 5, -98);

INSERT INTO public.ninos_estaciones_impresion (id, campus_id, nombre, token_hash) VALUES
  (pg_temp.id('es', 1), pg_temp.id('ca', 1), 'ZZ Iv Mesa 1', encode(sha256(convert_to('zz-iv-1', 'UTF8')), 'hex')),
  (pg_temp.id('es', 2), pg_temp.id('ca', 2), 'ZZ Iv Mesa B', encode(sha256(convert_to('zz-iv-2', 'UTF8')), 'hex'));

-- Today's family visit on campus A (Uno + Dos, código 4821) and one on campus B (Tres, 7310).
INSERT INTO public.ninos_checkins (id, nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo) VALUES
  (pg_temp.id('ch', 1), pg_temp.id('us', 11), pg_temp.id('sa', 1), pg_temp.id('tu', 1), pg_temp.id('ca', 1), pg_temp.hoy(),
   pg_temp.id('ch', 100), '4821'),
  (pg_temp.id('ch', 2), pg_temp.id('us', 12), pg_temp.id('sa', 2), pg_temp.id('tu', 1), pg_temp.id('ca', 1), pg_temp.hoy(),
   pg_temp.id('ch', 100), '4821'),
  (pg_temp.id('ch', 3), pg_temp.id('us', 13), pg_temp.id('sa', 3), pg_temp.id('tu', 2), pg_temp.id('ca', 2), pg_temp.hoy(),
   pg_temp.id('ch', 101), '7310');

GRANT INSERT, SELECT, UPDATE ON t_iv_failures, t_iv_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.id(text, int), pg_temp.as_user(int), pg_temp.as_nobody(),
  pg_temp.ctx(text), pg_temp.hoy(), pg_temp.filas(uuid, date, date)
  TO authenticated, anon;

-- The labels of the check-in (motivo NULL) and three reprints, through the real RPCs.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT public.ninos_impresion_encolar(pg_temp.id('es', 1), pg_temp.id('tu', 1), pg_temp.hoy(),
                                      ARRAY[pg_temp.id('us', 11), pg_temp.id('us', 12)]);
SELECT public.ninos_impresion_reimprimir(pg_temp.id('es', 1), pg_temp.id('tu', 1), pg_temp.hoy(), '4821', 'nino',
                                         pg_temp.id('us', 11), 'se_trabo', NULL);
SELECT pg_temp.as_user(2);
SELECT public.ninos_impresion_reimprimir(pg_temp.id('es', 1), pg_temp.id('tu', 1), pg_temp.hoy(), '4821', 'representante',
                                         NULL, 'se_perdio', 'Verificado con cédula');
SELECT pg_temp.as_user(4);
SELECT public.ninos_impresion_reimprimir(pg_temp.id('es', 2), pg_temp.id('tu', 2), pg_temp.hoy(), '7310', 'nino',
                                         pg_temp.id('us', 13), 'otro', 'Se mojó');
RESET ROLE;

-- Order them in time (the RPCs share the transaction's now()) and add older reprints.
UPDATE public.ninos_impresiones SET created_at = now() - interval '2 minutes'
 WHERE estacion_id = pg_temp.id('es', 1) AND motivo = 'se_trabo';
UPDATE public.ninos_impresiones SET created_at = now() - interval '1 minute'
 WHERE estacion_id = pg_temp.id('es', 1) AND motivo = 'se_perdio';
INSERT INTO public.ninos_impresiones (id, estacion_id, checkin_id, tipo, payload, estado, created_at, created_by, motivo, nota) VALUES
  (pg_temp.id('im', 1), pg_temp.id('es', 1), pg_temp.id('ch', 2), 'nino',
   '{"nombre":"ZZ Iv Dos","apellido":"Prueba","codigo":"5050"}', 'impresa', now() - interval '10 days', pg_temp.id('us', 1), 'se_trabo', NULL),
  (pg_temp.id('im', 2), pg_temp.id('es', 1), pg_temp.id('ch', 2), 'nino',
   '{"nombre":"ZZ Iv Dos","apellido":"Prueba","codigo":"6060"}', 'impresa', now() - interval '40 days', pg_temp.id('us', 1), 'se_trabo', NULL);

-- ── a. permissions ───────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: anon cannot execute it, authenticated can',
  $q$SELECT has_function_privilege('anon', 'public.ninos_impresion_reimpresiones(uuid, date, date)', 'EXECUTE')::text
         || '/' || has_function_privilege('authenticated', 'public.ninos_impresion_reimpresiones(uuid, date, date)', 'EXECUTE')::text$q$,
  'false/true');
SELECT pg_temp.assert_eq('a: SECURITY DEFINER with an empty search_path',
  $q$SELECT p.prosecdef::text || '/' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = 'public.ninos_impresion_reimpresiones(uuid, date, date)'::regprocedure$q$,
  'true/search_path=""');

SET LOCAL ROLE anon;
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_raises('a: anon is refused',
  $q$SELECT count(*) FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), NULL, NULL)$q$, '42501');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_nobody();
SELECT pg_temp.assert_raises('a: no session is refused',
  $q$SELECT count(*) FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), NULL, NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_user(3);
SELECT pg_temp.assert_raises('a: a random user is refused',
  $q$SELECT count(*) FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), NULL, NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_user(4);
SELECT pg_temp.assert_raises('a: the coordinator of campus B cannot read campus A',
  $q$SELECT count(*) FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), NULL, NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_raises('a: the anfitrión of campus A cannot read campus B',
  $q$SELECT count(*) FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 2), NULL, NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('a: no campus',
  $q$SELECT count(*) FROM public.ninos_impresion_reimpresiones(NULL, NULL, NULL)$q$, '42501', 'sin_autoridad');

-- ── b / c. today ─────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('b: today, only the reprints of campus A, newest first, every field (anfitrión)',
  $q$SELECT pg_temp.filas(pg_temp.id('ca', 1), NULL, NULL)$q$,
  'representante|-|["ZZ Iv Dos", "ZZ Iv Uno"]|4821|se_perdio|Verificado con cédula|ZZ Iv Mesa 1|pendiente|ZZ Iv U2;'
  || 'nino|ZZ Iv Uno Prueba|[]|4821|se_trabo|-|ZZ Iv Mesa 1|pendiente|ZZ Iv U1');
SELECT pg_temp.assert_eq('b: listed for the anfitrión: 2 rows',
  $q$SELECT count(*)::text FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), NULL, NULL)$q$, '2');
RESET ROLE;
SELECT pg_temp.assert_eq('b: the 3 labels of the check-in itself exist (but are not listed above)',
  $q$SELECT count(*)::text FROM public.ninos_impresiones WHERE estacion_id = pg_temp.id('es', 1) AND motivo IS NULL$q$, '3');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(2);
SELECT pg_temp.assert_eq('c: the coordinator of campus A reads the same',
  $q$SELECT (SELECT count(*) FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), pg_temp.hoy(), pg_temp.hoy()))::text$q$,
  '2');
SELECT pg_temp.as_user(4);
SELECT pg_temp.assert_eq('c: the coordinator of campus B reads only campus B',
  $q$SELECT pg_temp.filas(pg_temp.id('ca', 2), NULL, NULL)$q$,
  'nino|ZZ Iv Tres Otro|[]|7310|otro|Se mojó|ZZ Iv Mesa B|pendiente|ZZ Iv U4');

-- ── d. history range ─────────────────────────────────────────────────

SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('d: the last 11 days include the reprint of 10 days ago, not the one of 40',
  $q$SELECT string_agg(r.codigo || ':' || r.estado, ',' ORDER BY r.created_at DESC)
       FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), pg_temp.hoy() - 10, pg_temp.hoy()) r$q$,
  '4821:pendiente,4821:pendiente,5050:impresa');
SELECT pg_temp.assert_eq('d: 31 days (inclusive) are allowed',
  $q$SELECT count(*)::text FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), pg_temp.hoy() - 30, pg_temp.hoy())$q$, '3');
SELECT pg_temp.assert_eq('d: one date only = that day',
  $q$SELECT string_agg(r.codigo, ',') FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), pg_temp.hoy() - 10, NULL) r$q$,
  '5050');
SELECT pg_temp.assert_eq('d: the reprint of 40 days ago in its own range',
  $q$SELECT string_agg(r.codigo, ',') FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), pg_temp.hoy() - 45, pg_temp.hoy() - 35) r$q$,
  '6060');
SELECT pg_temp.assert_raises('d: 32 days are refused',
  $q$SELECT count(*) FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), pg_temp.hoy() - 31, pg_temp.hoy())$q$,
  '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('d: an inverted range is refused',
  $q$SELECT count(*) FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), pg_temp.hoy(), pg_temp.hoy() - 1)$q$,
  '22023', 'datos_invalidos');
RESET ROLE;

-- ── e. status from the agent ─────────────────────────────────────────

UPDATE public.ninos_impresiones SET estado = 'impresa', impresa_at = now()
 WHERE estacion_id = pg_temp.id('es', 1) AND motivo = 'se_perdio';
UPDATE public.ninos_impresiones SET estado = 'error', error = 'sin papel'
 WHERE estacion_id = pg_temp.id('es', 1) AND motivo = 'se_trabo' AND created_at > now() - interval '1 day';
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('e: impresa / error with its message',
  $q$SELECT string_agg(r.estado || ':' || coalesce(r.error, '-'), ',' ORDER BY r.created_at DESC)
       FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), NULL, NULL) r$q$,
  'impresa:-,error:sin papel');
RESET ROLE;

-- ── f. fixed columns ─────────────────────────────────────────────────

SELECT pg_temp.assert_eq('f: only the fixed columns (no phone, cédula, allergy text nor custody)',
  $q$SELECT pg_get_function_result('public.ninos_impresion_reimpresiones(uuid, date, date)'::regprocedure)$q$,
  'TABLE(id uuid, created_at timestamp with time zone, quien text, tipo text, nino text, ninos jsonb, codigo text, '
  || 'motivo text, nota text, estacion_id uuid, estacion text, estado text, error text)');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1);
SELECT pg_temp.assert_eq('f: nothing of the phone, cédula, allergy or custody reaches the rows',
  $q$SELECT count(*)::text FROM public.ninos_impresion_reimpresiones(pg_temp.id('ca', 1), pg_temp.hoy() - 30, pg_temp.hoy()) r
      WHERE concat_ws(' ', r.quien, r.nino, r.ninos::text, r.nota) ~ '0414|V-99711|Maní|Restringido|tribunal'$q$, '0');
RESET ROLE;

SELECT CASE WHEN count(*) = 0 THEN 'RESULT: ALL OK'
            ELSE 'RESULT: ' || count(*) || ' failing' || E'\n' || string_agg(case_name, E'\n') END AS result
  FROM t_iv_failures;

ROLLBACK;
