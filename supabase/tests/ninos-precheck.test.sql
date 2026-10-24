-- P1 (odd/tasks/ninos-precheck.md) — pre-check-in from the car
-- (20261012160000_ninos_precheck.sql).
--
-- Covers:
--   a. anon cannot execute any of the four RPCs; clients cannot read the
--      table nor execute the window helper.
--   b. A parent cannot notify a child that is not theirs, a child without a
--      ficha, more than 10 children, or a turno outside its window.
--   c. A minor account (G8) is refused and sees empty lists.
--   d. P notifies A and B for T1: Mis hijos lists the services in the window
--      (T1, T2, never T3) and both notices; a second notice is idempotent.
--   e. The anfitrión of campus 1 sees P's family for T1 with the children in
--      the ficha shape; nothing for T2 (other turno), T4 (other campus), a
--      past date or an out-of-window turno; a parent sees nothing.
--   f. Expiry: a pending row outside its window reads 'expirado' and a row of
--      a past service is never listed.
--   g. Cancel: P's pending notices of T1 are cancelled and leave the list; a
--      new notice reopens them.
--   h. Check-in: ninos_checkin marks A 'ingresado', the list keeps only B,
--      and A cannot be notified again for that service.
--   i. Daily cap: limite_diario past 30 notices.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 PADRE P, 2 PADRE Q, 6 ANFITRION (campus 1), 7 TEEN (16).
-- Children: 11 A (P, ficha), 12 B (P, ficha), 13 C (P, no ficha), 14 D (Q, ficha).
-- Tree: R → W → Anfitriones, room S1 in W on campus 1; R2 → W2, room S2 on campus 2.
-- Turnos (today's weekday): T1 now, T2 now + 30 min (campus 1), T3 now + 5 h
-- (campus 1, outside the window), T4 now (campus 2).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_pc_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_pc_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_pc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9b40000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9d01' WHEN 'us' THEN '9d02' WHEN 'eq' THEN '9d04'
                       WHEN 'ro' THEN '9d05' WHEN 'sa' THEN '9d06' WHEN 'tu' THEN '9d07' WHEN 'ca' THEN '9d08' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_pc_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.nac(p_anos int) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (public.ninos_hoy() - make_interval(years => p_anos) - interval '20 days')::date;
$$;

-- "ARRAY['…','…']::uuid[]" of the given children.
CREATE OR REPLACE FUNCTION pg_temp.ninos(VARIADIC p_n int[]) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'ARRAY[' || string_agg(quote_literal(pg_temp.id('us', n)), ',') || ']::uuid[]' FROM unnest(p_n) n;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_pc_ctx (k, v)
SELECT 'campus', c.id::text FROM public.campus c WHERE c.nombre = 'Barquisimeto' LIMIT 1;
-- A second campus with its own room tree and no staff of ours.
INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Pc Campus', 'ZZPC');
INSERT INTO t_pc_ctx (k, v) VALUES ('campus2', pg_temp.id('ca', 1)::text);
INSERT INTO t_pc_ctx (k, v) VALUES
  ('hoy', public.ninos_hoy()::text),
  ('ahora', date_trunc('minute', now() AT TIME ZONE 'America/Caracas')::time::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'pc-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 2, 6, 7]) AS n;

INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero, fecha_nacimiento) VALUES
  (pg_temp.id('us', 1), pg_temp.id('au', 1), 'ZZ Pablo', 'ZZ Pc', 'pc-1@example.test', 'Casado', 'Masculino', pg_temp.nac(35)),
  (pg_temp.id('us', 2), pg_temp.id('au', 2), 'ZZ Quina', 'ZZ Pc2', 'pc-2@example.test', 'Casado', 'Femenino', pg_temp.nac(33)),
  (pg_temp.id('us', 6), pg_temp.id('au', 6), 'ZZ Anfi', 'ZZ Pc', 'pc-6@example.test', 'Soltero', 'Femenino', NULL),
  (pg_temp.id('us', 7), pg_temp.id('au', 7), 'ZZ Teen', 'ZZ Pc', 'pc-7@example.test', 'Soltero', 'Masculino', pg_temp.nac(16)),
  (pg_temp.id('us', 11), NULL, 'ZZ Ana', 'ZZ Pc', NULL, 'No especificado', 'Femenino', pg_temp.nac(5)),
  (pg_temp.id('us', 12), NULL, 'ZZ Beto', 'ZZ Pc', NULL, 'No especificado', 'Masculino', pg_temp.nac(7)),
  (pg_temp.id('us', 13), NULL, 'ZZ Ciro', 'ZZ Pc', NULL, 'No especificado', 'Masculino', pg_temp.nac(3)),
  (pg_temp.id('us', 14), NULL, 'ZZ Dora', 'ZZ Pc2', NULL, 'No especificado', 'Femenino', pg_temp.nac(6));
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 1), pg_temp.ctx('campus')::uuid, true);
INSERT INTO public.relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion, es_principal) VALUES
  (pg_temp.id('us', 11), pg_temp.id('us', 1), 'padre', true),
  (pg_temp.id('us', 12), pg_temp.id('us', 1), 'padre', true),
  (pg_temp.id('us', 13), pg_temp.id('us', 1), 'padre', true),
  (pg_temp.id('us', 14), pg_temp.id('us', 2), 'padre', true),
  -- A teen wrongly linked as A's parent.
  (pg_temp.id('us', 11), pg_temp.id('us', 7), 'padre', false);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Pc R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Pc W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', NULL, 'ZZ Pc R2', true),
  (pg_temp.id('eq', 5), 'ninos', pg_temp.id('eq', 4), 'ZZ Pc W2', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('us', 6), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo', now(), 'admin_asignacion');
INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.ctx('campus')::uuid, pg_temp.id('eq', 2), 'waumba', 'ZZ Pc S1', 20, 0, 155, 1),
  (pg_temp.id('sa', 2), pg_temp.ctx('campus2')::uuid, pg_temp.id('eq', 5), 'waumba', 'ZZ Pc S2', 20, 0, 155, 1);
INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo) VALUES
  (pg_temp.id('tu', 1), pg_temp.ctx('campus')::uuid, 'ZZ Pc T1', extract(dow FROM public.ninos_hoy())::smallint,
   pg_temp.ctx('ahora')::time, 901, true),
  (pg_temp.id('tu', 2), pg_temp.ctx('campus')::uuid, 'ZZ Pc T2', extract(dow FROM public.ninos_hoy())::smallint,
   pg_temp.ctx('ahora')::time + interval '30 minutes', 902, true),
  (pg_temp.id('tu', 3), pg_temp.ctx('campus')::uuid, 'ZZ Pc T3', extract(dow FROM public.ninos_hoy())::smallint,
   pg_temp.ctx('ahora')::time + interval '5 hours', 903, true),
  (pg_temp.id('tu', 4), pg_temp.ctx('campus2')::uuid, 'ZZ Pc T4', extract(dow FROM public.ninos_hoy())::smallint,
   pg_temp.ctx('ahora')::time, 904, true);

INSERT INTO public.ninos_fichas (usuario_id, alergias) VALUES
  (pg_temp.id('us', 11), 'ZZ Maní'), (pg_temp.id('us', 12), NULL), (pg_temp.id('us', 14), NULL);

GRANT INSERT, SELECT, UPDATE ON t_pc_failures, t_pc_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.assert_denied(text, text), pg_temp.run(text, text),
  pg_temp.as_persona(int), pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.nac(int), pg_temp.ninos(int[])
  TO authenticated, anon;

-- ── a. anon and direct access ────────────────────────────────────────

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('a: anon cannot notify',
  format('SELECT public.ninos_precheck_avisar(%L, %s)', pg_temp.id('tu', 1), pg_temp.ninos(11)));
SELECT pg_temp.assert_denied('a: anon cannot cancel',
  format('SELECT public.ninos_precheck_cancelar(%L)', pg_temp.id('tu', 1)));
SELECT pg_temp.assert_denied('a: anon cannot read Mis hijos notices', 'SELECT public.ninos_mis_prechecks()');
SELECT pg_temp.assert_denied('a: anon cannot read the arriving list',
  format('SELECT public.ninos_prechecks_pendientes(%L, %L)', pg_temp.id('tu', 1), pg_temp.ctx('hoy')));
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_denied('a: a client cannot read the table', 'SELECT count(*) FROM public.ninos_prechecks');
SELECT pg_temp.assert_denied('a: a client cannot execute the window helper',
  format('SELECT public.ninos_precheck_en_ventana(%L)', pg_temp.id('tu', 1)));

-- ── b. refusals ──────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('b: not my child',
  format('SELECT public.ninos_precheck_avisar(%L, %s)', pg_temp.id('tu', 1), pg_temp.ninos(11, 14)),
  '22023', 'nino_no_encontrado');
SELECT pg_temp.assert_raises('b: a child without a ficha',
  format('SELECT public.ninos_precheck_avisar(%L, %s)', pg_temp.id('tu', 1), pg_temp.ninos(13)),
  '22023', 'sin_ficha');
SELECT pg_temp.assert_raises('b: more than 10 children',
  format('SELECT public.ninos_precheck_avisar(%L, %s)', pg_temp.id('tu', 1),
         pg_temp.ninos(11, 12, 13, 14, 21, 22, 23, 24, 25, 26, 27)),
  '22023', 'limite_hijos');
SELECT pg_temp.assert_raises('b: an empty list',
  format('SELECT public.ninos_precheck_avisar(%L, %L::uuid[])', pg_temp.id('tu', 1), '{}'),
  '22023', 'datos_invalidos');
SELECT pg_temp.assert_raises('b: outside the window',
  format('SELECT public.ninos_precheck_avisar(%L, %s)', pg_temp.id('tu', 3), pg_temp.ninos(11)),
  '22023', 'fuera_de_horario');

-- ── c. a minor account (G8) ──────────────────────────────────────────

SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('c: a minor cannot notify',
  format('SELECT public.ninos_precheck_avisar(%L, %s)', pg_temp.id('tu', 1), pg_temp.ninos(11)),
  '42501', 'sin_autoridad');
SELECT pg_temp.assert_eq('c: a minor sees empty lists',
  'SELECT public.ninos_mis_prechecks()::text', '{"avisos": [], "servicios": []}');

-- ── d. "Voy en camino" ───────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('d: P notifies A and B for T1',
  format($q$SELECT r ->> 'nuevos' || ':' || jsonb_array_length(r -> 'avisados') || ':' || (r ->> 'fecha' = pg_temp.ctx('hoy'))::text
              FROM public.ninos_precheck_avisar(%L, %s) r$q$, pg_temp.id('tu', 1), pg_temp.ninos(11, 12)),
  '2:2:true');
SELECT pg_temp.assert_eq('d: Mis hijos lists T1 and T2 in the window, never T3',
  $q$SELECT string_agg(s ->> 'nombre', ',' ORDER BY s ->> 'nombre')
       FROM jsonb_array_elements(public.ninos_mis_prechecks() -> 'servicios') s
      WHERE s ->> 'nombre' LIKE 'ZZ Pc%'$q$,
  'ZZ Pc T1,ZZ Pc T2');
SELECT pg_temp.assert_eq('d: both notices are pending',
  format($q$SELECT string_agg(a ->> 'estado', ',') FROM jsonb_array_elements(public.ninos_mis_prechecks() -> 'avisos') a
             WHERE a ->> 'turno_id' = %L$q$, pg_temp.id('tu', 1)),
  'pendiente,pendiente');
SELECT pg_temp.assert_eq('d: a second notice is idempotent',
  format($q$SELECT r ->> 'nuevos' FROM public.ninos_precheck_avisar(%L, %s) r$q$, pg_temp.id('tu', 1), pg_temp.ninos(11)),
  '0');
RESET ROLE;
SELECT pg_temp.assert_eq('d: one row per child and service',
  format('SELECT count(*)::text || '':'' || sum(avisos) FROM public.ninos_prechecks WHERE turno_id = %L', pg_temp.id('tu', 1)),
  '2:2');
-- Q's child D is on its way to the campus 2 service; A to an out-of-window
-- service and to a past one (as postgres).
SELECT pg_temp.run('d: fixture rows on T4, T3 and a past date', format($q$
  INSERT INTO public.ninos_prechecks (nino_id, turno_id, fecha, solicitado_por) VALUES
    (%L, %L, %L, %L), (%L, %L, %L, %L), (%L, %L, %L::date - 7, %L)$q$,
  pg_temp.id('us', 14), pg_temp.id('tu', 4), pg_temp.ctx('hoy'), pg_temp.id('us', 2),
  pg_temp.id('us', 11), pg_temp.id('tu', 3), pg_temp.ctx('hoy'), pg_temp.id('us', 1),
  pg_temp.id('us', 12), pg_temp.id('tu', 1), pg_temp.ctx('hoy'), pg_temp.id('us', 1)));
SET LOCAL ROLE authenticated;

-- ── e. the table's list ──────────────────────────────────────────────

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('e: the anfitrión sees P with A and B for T1',
  format($q$SELECT string_agg(concat_ws(':', f -> 'padre' ->> 'id', (SELECT string_agg(h ->> 'nombre', '+' ORDER BY h ->> 'nombre')
                                                                    FROM jsonb_array_elements(f -> 'hijos') h)), ',')
              FROM jsonb_array_elements(public.ninos_prechecks_pendientes(%L, %L)) f$q$,
         pg_temp.id('tu', 1), pg_temp.ctx('hoy')),
  pg_temp.id('us', 1)::text || ':ZZ Ana+ZZ Beto');
SELECT pg_temp.assert_eq('e: the children carry the ficha (alerts, room, flags)',
  format($q$SELECT concat_ws(':', h ->> 'alergias', h ->> 'tiene_ficha', (h ? 'salon_preferido_id')::text, (h ? 'autorizados')::text)
              FROM jsonb_array_elements(public.ninos_prechecks_pendientes(%L, %L)) f, jsonb_array_elements(f -> 'hijos') h
             WHERE h ->> 'id' = %L$q$, pg_temp.id('tu', 1), pg_temp.ctx('hoy'), pg_temp.id('us', 11)),
  'ZZ Maní:true:true:true');
SELECT pg_temp.assert_eq('e: nothing for another turno of the campus',
  format('SELECT public.ninos_prechecks_pendientes(%L, %L)::text', pg_temp.id('tu', 2), pg_temp.ctx('hoy')), '[]');
SELECT pg_temp.assert_eq('e: nothing for a turno of another campus',
  format('SELECT public.ninos_prechecks_pendientes(%L, %L)::text', pg_temp.id('tu', 4), pg_temp.ctx('hoy')), '[]');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('e: a parent sees nothing',
  format('SELECT public.ninos_prechecks_pendientes(%L, %L)::text', pg_temp.id('tu', 1), pg_temp.ctx('hoy')), '[]');

-- ── f. expiry ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('f: a pending notice outside its window reads expirado',
  format($q$SELECT string_agg(a ->> 'estado', ',') FROM jsonb_array_elements(public.ninos_mis_prechecks() -> 'avisos') a
             WHERE a ->> 'turno_id' = %L$q$, pg_temp.id('tu', 3)),
  'expirado');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('f: an out-of-window service has no arriving list',
  format('SELECT public.ninos_prechecks_pendientes(%L, %L)::text', pg_temp.id('tu', 3), pg_temp.ctx('hoy')), '[]');
SELECT pg_temp.assert_eq('f: a past service has no arriving list',
  format('SELECT public.ninos_prechecks_pendientes(%L, %L::date - 7)::text', pg_temp.id('tu', 1), pg_temp.ctx('hoy')), '[]');

-- ── g. cancel and notify again ───────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('g: P cancels the T1 notices',
  format($q$SELECT public.ninos_precheck_cancelar(%L) ->> 'cancelados'$q$, pg_temp.id('tu', 1)), '2');
SELECT pg_temp.assert_eq('g: cancelled notices leave Mis hijos',
  format($q$SELECT count(*)::text FROM jsonb_array_elements(public.ninos_mis_prechecks() -> 'avisos') a
             WHERE a ->> 'turno_id' = %L$q$, pg_temp.id('tu', 1)), '0');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('g: cancelled notices leave the table list',
  format('SELECT public.ninos_prechecks_pendientes(%L, %L)::text', pg_temp.id('tu', 1), pg_temp.ctx('hoy')), '[]');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('g: a new notice reopens them',
  format($q$SELECT r ->> 'nuevos' FROM public.ninos_precheck_avisar(%L, %s) r$q$, pg_temp.id('tu', 1), pg_temp.ninos(11, 12)),
  '2');

-- ── h. the check-in marks the notice ─────────────────────────────────

SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('h: the anfitrión checks A in with a code',
  format($q$SELECT (codigo ~ '^[0-9]{4}$')::text FROM public.ninos_checkin(ARRAY[%L]::uuid[], %L, %L, ARRAY[%L]::uuid[])$q$,
         pg_temp.id('us', 11), pg_temp.id('tu', 1), pg_temp.ctx('hoy'), pg_temp.id('sa', 1)),
  'true');
SELECT pg_temp.assert_eq('h: the list keeps only B',
  format($q$SELECT string_agg(h ->> 'nombre', ',')
              FROM jsonb_array_elements(public.ninos_prechecks_pendientes(%L, %L)) f, jsonb_array_elements(f -> 'hijos') h$q$,
         pg_temp.id('tu', 1), pg_temp.ctx('hoy')),
  'ZZ Beto');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('h: Mis hijos shows A ingresado',
  format($q$SELECT a ->> 'estado' FROM jsonb_array_elements(public.ninos_mis_prechecks() -> 'avisos') a
             WHERE a ->> 'turno_id' = %L AND a ->> 'nino_id' = %L$q$, pg_temp.id('tu', 1), pg_temp.id('us', 11)),
  'ingresado');
SELECT pg_temp.assert_raises('h: A cannot be notified again for T1',
  format('SELECT public.ninos_precheck_avisar(%L, %s)', pg_temp.id('tu', 1), pg_temp.ninos(11)),
  '22023', 'ya_ingresado');
RESET ROLE;
SELECT pg_temp.assert_eq('h: the row is ingresado',
  format('SELECT estado FROM public.ninos_prechecks WHERE nino_id = %L AND turno_id = %L AND fecha = %L',
         pg_temp.id('us', 11), pg_temp.id('tu', 1), pg_temp.ctx('hoy')),
  'ingresado');

-- ── i. daily cap ─────────────────────────────────────────────────────

SELECT pg_temp.run('i: P has used up the day', format(
  'UPDATE public.ninos_prechecks SET avisos = 30 WHERE nino_id = %L AND turno_id = %L AND fecha = %L',
  pg_temp.id('us', 12), pg_temp.id('tu', 1), pg_temp.ctx('hoy')));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('i: one more notice is over the cap',
  format('SELECT public.ninos_precheck_avisar(%L, %s)', pg_temp.id('tu', 2), pg_temp.ninos(12)),
  '22023', 'limite_diario');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_pc_failures;

ROLLBACK;
