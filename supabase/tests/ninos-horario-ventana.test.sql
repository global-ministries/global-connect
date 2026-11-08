-- T1b (odd/tasks/ninos-checkin-pco.md, S5, S8.1, S8.2) — Niños reads the
-- horario window and serves the dated turnos of its events
-- (20261108110000_ninos_horario_ventana.sql).
--
-- Covers:
--   1. Grants: anon and authenticated cannot run ninos_turno_ocurre_en nor
--      ninos_turno_hora_en; authenticated still runs ninos_voluntarios_turnos
--      (recreated), planilla, marcar, ninos_checkin and
--      ninos_reporte_voluntarios; anon does not run the recreated
--      ninos_voluntarios_turnos.
--   2. ninos_turno_ocurre_en: a weekly turno on its weekday only; a dated
--      turno with a Niños horario on its planned dates only; a dated turno
--      without horario never; a NULL fecha never. ninos_turno_hora_en: the
--      date's hora overrides the turno's; a date without hora falls back.
--   3. Pre-check window (ninos_precheck_en_ventana): a weekly turno without
--      horario keeps ±120 min; a dated turno today applies its horario's
--      abre / cierra. These cases read the wall clock: they are SKIPPED (not
--      failed) when Caracas time is within 4 h of midnight (before 04:00 or
--      from 20:00), so the hours moved by ±150 min stay on today's date. The
--      line before the result says whether they ran.
--   4. ninos_checkin (coordinator): a dated turno on a planned date checks in;
--      off its dates, without horario, with the horario inactive or the event
--      archived it is 'unknown or inactive turno'; a weekly turno still
--      checks in on any date.
--   5. ninos_voluntarios_turnos: the dated turno with horario is listed with
--      tipo 'fechas' and its planned dates; the weekly one with tipo
--      'semanal' and no dates; the dated one without horario is not listed.
--   6. ninos_voluntarios_planilla: the dated turno on a planned date returns
--      tipo, fechas and the volunteer set for that date as esperado; off its
--      dates fecha_invalida; without horario turno_invalido; a weekly turno
--      off its weekday fecha_invalida. Opening the past date freezes its
--      roster with the volunteer.
--   7. ninos_voluntarios_marcar: marking on a planned date writes the
--      attendance; off its dates fecha_invalida and nothing is written.
--   8. ninos_reporte_voluntarios: the dated turno's date is reported.
--   9. ninos_voluntarios_congelar_pendientes: runs and never freezes the
--      dated turno without horario.
--
-- Run against STAGING (after the migration) inside BEGIN…ROLLBACK. The last
-- statement is a SELECT of the failing cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD (dream_team.coordinate on R1),
-- 2 VOLUNTARIO (servicio in W1/Anfitriones, campus principal = campus 1).
-- Child 11 (K1). Tree: R1 → W1 → Anfitriones. Salón S1 (campus 1, W1).
-- Turnos campus 1: T1 Sunday weekly 09:00; T2 dated 10:00 ("ZZ Hv Jornada"),
-- the turno of the horario of a diario event D1–D2, listed for W1; T3 dated
-- 18:00 without horario (another ministry), also listed for W1 so that only
-- the missing horario keeps it out; T4 weekly on today's weekday (pre-check).
-- T2 and T3 have planned dates D1 = ninos_hoy() - 3 (no hora) and D2 =
-- ninos_hoy() (T2's D2 at 07:15). The volunteer is assigned to T2 and set
-- for D1.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_hv_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_hv_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_hv_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('e7e81b00-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9e01' WHEN 'us' THEN '9e02' WHEN 'eq' THEN '9e04'
                       WHEN 'ro' THEN '9e05' WHEN 'sa' THEN '9e06' WHEN 'tu' THEN '9e07' WHEN 'ca' THEN '9e08'
                       WHEN 'sv' THEN '9e09' WHEN 'ev' THEN '9e0a' WHEN 'ho' THEN '9e0b' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_hv_ctx WHERE k = p_k;
$$;

-- D1 = today - 3, D2 = today (Caracas), fixed at the start of the run.
CREATE OR REPLACE FUNCTION pg_temp.d(p_k text) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT v::date FROM t_hv_ctx WHERE k = p_k;
$$;

-- The wall-clock cases run only when Caracas time is 04:00–19:59.
CREATE OR REPLACE FUNCTION pg_temp.reloj_ok() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT extract(hour FROM now() AT TIME ZONE 'America/Caracas') BETWEEN 4 AND 19;
$$;

-- Caracas time now plus p_min minutes, as a time of day.
CREATE OR REPLACE FUNCTION pg_temp.ahora_mas(p_min int) RETURNS time LANGUAGE sql STABLE AS $$
  SELECT ((now() AT TIME ZONE 'America/Caracas') + make_interval(mins => p_min))::time;
$$;

-- "SELECT count(*) FROM public.ninos_checkin([K1], T n, fecha, [S1])".
CREATE OR REPLACE FUNCTION pg_temp.checkin(p_turno int, p_fecha date) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT count(*)::text FROM public.ninos_checkin(ARRAY[%L::uuid], %L::uuid, %L::date, ARRAY[%L::uuid])',
                pg_temp.id('us', 11), pg_temp.id('tu', p_turno), p_fecha, pg_temp.id('sa', 1));
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_hv_ctx (k, v) VALUES
  ('d1', (public.ninos_hoy() - 3)::text),
  ('d1_mas_1', (public.ninos_hoy() - 2)::text),
  ('d2', public.ninos_hoy()::text);

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Hv Campus 1', 'ZZHV1');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'hv-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 2) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Hv', 'U' || n, 'hv-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 2) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento)
VALUES (pg_temp.id('us', 11), 'ZZ Hv Nino', 'K11', 'No especificado', 'Masculino', DATE '2021-01-01');
INSERT INTO public.ninos_fichas (usuario_id) VALUES (pg_temp.id('us', 11));
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal) VALUES
  (pg_temp.id('us', 2), pg_temp.id('ca', 1), true);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Hv R1', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Hv W1', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'voluntario', true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual) VALUES
  (pg_temp.id('sv', 1), pg_temp.id('us', 2), pg_temp.id('eq', 3), pg_temp.id('ro', 1), 'activo',
   now() - interval '30 days', 'admin_asignacion');
DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (pg_temp.id('us', 1), pg_temp.id('us', 2));
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 1)::text),
  (pg_temp.id('us', 2), 'dream_team.serve', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, orden) VALUES
  (pg_temp.id('sa', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Hv S1', 20, 0, 71, 1);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo, tipo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Hv Domingo', 0, '09:00', 1, true, 'semanal'),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'ZZ Hv Jornada', 0, '10:00', 2, true, 'fechas'),
  (pg_temp.id('tu', 3), pg_temp.id('ca', 1), 'ZZ Hv Otro ministerio', 0, '18:00', 3, true, 'fechas'),
  (pg_temp.id('tu', 4), pg_temp.id('ca', 1), 'ZZ Hv Hoy', extract(dow FROM public.ninos_hoy())::smallint, '12:00', 4,
   true, 'semanal');

INSERT INTO public.ninos_eventos (id, campus_id, nombre, tipo, fecha_inicio, fecha_fin) VALUES
  (pg_temp.id('ev', 1), pg_temp.id('ca', 1), 'ZZ Hv Campamento', 'diario', pg_temp.d('d1'), pg_temp.d('d2'));
INSERT INTO public.ninos_evento_horarios (id, evento_id, turno_id, abre_min_antes, cierra_min_despues, turno_creado) VALUES
  (pg_temp.id('ho', 1), pg_temp.id('ev', 1), pg_temp.id('tu', 2), 120, 120, true);

INSERT INTO public.dream_team_equipo_turnos (equipo_id, turno_id) VALUES
  (pg_temp.id('eq', 2), pg_temp.id('tu', 2)),
  (pg_temp.id('eq', 2), pg_temp.id('tu', 3));
INSERT INTO public.dream_team_turno_fechas (turno_id, fecha, hora) VALUES
  (pg_temp.id('tu', 2), pg_temp.d('d1'), NULL),
  (pg_temp.id('tu', 2), pg_temp.d('d2'), '07:15'),
  (pg_temp.id('tu', 3), pg_temp.d('d1'), NULL),
  (pg_temp.id('tu', 3), pg_temp.d('d2'), NULL);
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id) VALUES (pg_temp.id('sv', 1), pg_temp.id('tu', 2));
INSERT INTO public.dream_team_turno_fecha_servidores (turno_fecha_id, turno_id, servicio_id)
SELECT f.id, f.turno_id, pg_temp.id('sv', 1) FROM public.dream_team_turno_fechas f
 WHERE f.turno_id = pg_temp.id('tu', 2) AND f.fecha = pg_temp.d('d1');

GRANT INSERT, SELECT, UPDATE ON t_hv_failures, t_hv_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text), pg_temp.run(text, text),
  pg_temp.as_persona(int), pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.d(text),
  pg_temp.checkin(int, date)
  TO authenticated, anon;

-- ── 1. grants ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('1: anon and authenticated cannot run ninos_turno_ocurre_en / ninos_turno_hora_en',
  $q$SELECT count(*)::text FROM (VALUES ('anon'), ('authenticated')) r(rol),
                                (VALUES ('public.ninos_turno_ocurre_en(uuid, date)'),
                                        ('public.ninos_turno_hora_en(uuid, date)')) f(sig)
      WHERE has_function_privilege(r.rol, f.sig, 'EXECUTE')$q$, '0');
SELECT pg_temp.assert_eq('1: authenticated still runs the five Niños RPCs',
  $q$SELECT count(*)::text FROM (VALUES
       ('public.ninos_voluntarios_turnos()'), ('public.ninos_voluntarios_planilla(uuid, date)'),
       ('public.ninos_voluntarios_marcar(uuid, date, uuid[], text, boolean)'),
       ('public.ninos_checkin(uuid[], uuid, date, uuid[], uuid[])'),
       ('public.ninos_reporte_voluntarios(date, date, uuid, uuid)')) AS f(sig)
      WHERE has_function_privilege('authenticated', f.sig, 'EXECUTE')$q$, '5');
SELECT pg_temp.assert_eq('1: anon does not run the recreated ninos_voluntarios_turnos',
  $q$SELECT has_function_privilege('anon', 'public.ninos_voluntarios_turnos()', 'EXECUTE')::text$q$, 'false');

-- ── 2. helpers ───────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('2: a weekly turno happens on its weekday (Sunday 1 Mar 2026)',
  format($q$SELECT public.ninos_turno_ocurre_en(%L::uuid, DATE '2026-03-01')::text$q$, pg_temp.id('tu', 1)), 'true');
SELECT pg_temp.assert_eq('2: a weekly turno does not happen on another weekday (Tuesday 3 Mar 2026)',
  format($q$SELECT public.ninos_turno_ocurre_en(%L::uuid, DATE '2026-03-03')::text$q$, pg_temp.id('tu', 1)), 'false');
SELECT pg_temp.assert_eq('2: the dated turno with horario happens on D1',
  format($q$SELECT public.ninos_turno_ocurre_en(%L::uuid, %L::date)::text$q$, pg_temp.id('tu', 2), pg_temp.d('d1')),
  'true');
SELECT pg_temp.assert_eq('2: the dated turno with horario happens on D2',
  format($q$SELECT public.ninos_turno_ocurre_en(%L::uuid, %L::date)::text$q$, pg_temp.id('tu', 2), pg_temp.d('d2')),
  'true');
SELECT pg_temp.assert_eq('2: the dated turno with horario does not happen on D1+1 (not planned)',
  format($q$SELECT public.ninos_turno_ocurre_en(%L::uuid, %L::date)::text$q$, pg_temp.id('tu', 2), pg_temp.d('d1_mas_1')),
  'false');
SELECT pg_temp.assert_eq('2: the dated turno without horario does not happen on its planned D1',
  format($q$SELECT public.ninos_turno_ocurre_en(%L::uuid, %L::date)::text$q$, pg_temp.id('tu', 3), pg_temp.d('d1')),
  'false');
SELECT pg_temp.assert_eq('2: a NULL fecha never happens',
  format($q$SELECT public.ninos_turno_ocurre_en(%L::uuid, NULL)::text$q$, pg_temp.id('tu', 1)), 'false');
SELECT pg_temp.assert_eq('2: the date''s hora overrides the turno''s',
  format($q$SELECT to_char(public.ninos_turno_hora_en(%L::uuid, %L::date), 'HH24:MI')$q$,
         pg_temp.id('tu', 2), pg_temp.d('d2')), '07:15');
SELECT pg_temp.assert_eq('2: a date without hora falls back to the turno''s',
  format($q$SELECT to_char(public.ninos_turno_hora_en(%L::uuid, %L::date), 'HH24:MI')$q$,
         pg_temp.id('tu', 2), pg_temp.d('d1')), '10:00');

-- ── 3. pre-check window (wall clock; skipped near midnight) ──────────

SELECT pg_temp.run('3: T4 starts 30 min ago',
  format('UPDATE public.dream_team_turnos SET hora = pg_temp.ahora_mas(-30) WHERE id = %L::uuid', pg_temp.id('tu', 4)))
 WHERE pg_temp.reloj_ok();
SELECT pg_temp.assert_eq('3: a weekly turno without horario that started 30 min ago is in the ±120 window',
  format('SELECT public.ninos_precheck_en_ventana(%L::uuid)::text', pg_temp.id('tu', 4)), 'true')
 WHERE pg_temp.reloj_ok();
SELECT pg_temp.run('3: T4 started 150 min ago',
  format('UPDATE public.dream_team_turnos SET hora = pg_temp.ahora_mas(-150) WHERE id = %L::uuid', pg_temp.id('tu', 4)))
 WHERE pg_temp.reloj_ok();
SELECT pg_temp.assert_eq('3: a weekly turno without horario that started 150 min ago is out of the ±120 window',
  format('SELECT public.ninos_precheck_en_ventana(%L::uuid)::text', pg_temp.id('tu', 4)), 'false')
 WHERE pg_temp.reloj_ok();

SELECT pg_temp.run('3: T2 today starts 30 min ago and closes 10 min after',
  format($q$UPDATE public.dream_team_turno_fechas SET hora = pg_temp.ahora_mas(-30) WHERE turno_id = %L::uuid AND fecha = %L::date;
            UPDATE public.ninos_evento_horarios SET abre_min_antes = 120, cierra_min_despues = 10 WHERE id = %L::uuid$q$,
         pg_temp.id('tu', 2), pg_temp.d('d2'), pg_temp.id('ho', 1)))
 WHERE pg_temp.reloj_ok();
SELECT pg_temp.assert_eq('3: the dated turno is out of the window once its horario closed',
  format('SELECT public.ninos_precheck_en_ventana(%L::uuid)::text', pg_temp.id('tu', 2)), 'false')
 WHERE pg_temp.reloj_ok();
SELECT pg_temp.run('3: T2 closes 60 min after',
  format('UPDATE public.ninos_evento_horarios SET cierra_min_despues = 60 WHERE id = %L::uuid', pg_temp.id('ho', 1)))
 WHERE pg_temp.reloj_ok();
SELECT pg_temp.assert_eq('3: the dated turno is in the window before its horario closes',
  format('SELECT public.ninos_precheck_en_ventana(%L::uuid)::text', pg_temp.id('tu', 2)), 'true')
 WHERE pg_temp.reloj_ok();
SELECT pg_temp.run('3: T2 today starts in 60 min and opens 30 min before',
  format($q$UPDATE public.dream_team_turno_fechas SET hora = pg_temp.ahora_mas(60) WHERE turno_id = %L::uuid AND fecha = %L::date;
            UPDATE public.ninos_evento_horarios SET abre_min_antes = 30, cierra_min_despues = 120 WHERE id = %L::uuid$q$,
         pg_temp.id('tu', 2), pg_temp.d('d2'), pg_temp.id('ho', 1)))
 WHERE pg_temp.reloj_ok();
SELECT pg_temp.assert_eq('3: the dated turno is out of the window before its horario opens',
  format('SELECT public.ninos_precheck_en_ventana(%L::uuid)::text', pg_temp.id('tu', 2)), 'false')
 WHERE pg_temp.reloj_ok();

-- Back to the fixture window.
SELECT pg_temp.run('3: restore the T2 horario window',
  format('UPDATE public.ninos_evento_horarios SET abre_min_antes = 120, cierra_min_despues = 120 WHERE id = %L::uuid',
         pg_temp.id('ho', 1)));

-- ── 4. ninos_checkin (as the coordinator) ────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('4: the dated turno checks in on its planned D1', pg_temp.checkin(2, pg_temp.d('d1')), '1');
SELECT pg_temp.assert_raises('4: the dated turno off its dates (D1+1) is refused',
  pg_temp.checkin(2, pg_temp.d('d1_mas_1')), '22023', 'unknown or inactive turno');
SELECT pg_temp.assert_raises('4: the dated turno without horario is refused on its planned D1',
  pg_temp.checkin(3, pg_temp.d('d1')), '22023', 'unknown or inactive turno');
RESET ROLE;
SELECT pg_temp.run('4: deactivate the T2 horario',
  format('UPDATE public.ninos_evento_horarios SET activo = false WHERE id = %L::uuid', pg_temp.id('ho', 1)));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('4: the dated turno with an inactive horario is refused on its planned D2',
  pg_temp.checkin(2, pg_temp.d('d2')), '22023', 'unknown or inactive turno');
RESET ROLE;
SELECT pg_temp.run('4: reactivate the horario and archive the event',
  format($q$UPDATE public.ninos_evento_horarios SET activo = true WHERE id = %L::uuid;
            UPDATE public.ninos_eventos SET activo = false WHERE id = %L::uuid$q$, pg_temp.id('ho', 1), pg_temp.id('ev', 1)));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('4: the dated turno of an archived event is refused on its planned D2',
  pg_temp.checkin(2, pg_temp.d('d2')), '22023', 'unknown or inactive turno');
RESET ROLE;
SELECT pg_temp.run('4: restore the event',
  format('UPDATE public.ninos_eventos SET activo = true WHERE id = %L::uuid', pg_temp.id('ev', 1)));
SELECT pg_temp.assert_eq('4: the refused check-ins wrote nothing for T2 on D1+1 and D2 nor for T3',
  format($q$SELECT count(*)::text FROM public.ninos_checkins
             WHERE (turno_id = %L::uuid AND fecha IN (%L::date, %L::date)) OR turno_id = %L::uuid$q$,
         pg_temp.id('tu', 2), pg_temp.d('d1_mas_1'), pg_temp.d('d2'), pg_temp.id('tu', 3)), '0');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('4: a weekly turno still checks in on a non-Sunday (Tuesday 3 Mar 2026)',
  pg_temp.checkin(1, DATE '2026-03-03'), '1');

-- ── 5. ninos_voluntarios_turnos ──────────────────────────────────────

SELECT pg_temp.assert_eq('5: the dated turno with horario is listed with tipo fechas and {D1, D2}',
  format($q$SELECT tipo || ':' || (fechas = ARRAY[%L::date, %L::date])::text
              FROM public.ninos_voluntarios_turnos() WHERE id = %L::uuid$q$,
         pg_temp.d('d1'), pg_temp.d('d2'), pg_temp.id('tu', 2)), 'fechas:true');
SELECT pg_temp.assert_eq('5: the weekly turno is listed with tipo semanal and no dates',
  format($q$SELECT tipo || ':' || coalesce(fechas::text, 'null')
              FROM public.ninos_voluntarios_turnos() WHERE id = %L::uuid$q$, pg_temp.id('tu', 1)), 'semanal:null');
SELECT pg_temp.assert_eq('5: the dated turno without horario is not listed',
  format($q$SELECT count(*)::text FROM public.ninos_voluntarios_turnos() WHERE id = %L::uuid$q$, pg_temp.id('tu', 3)), '0');

-- ── 6. ninos_voluntarios_planilla ────────────────────────────────────

SELECT pg_temp.run('6: open the T2 sheet on D1', format($q$
  INSERT INTO t_hv_ctx (k, v) VALUES ('planilla', public.ninos_voluntarios_planilla(%L::uuid, %L::date)::text)$q$,
  pg_temp.id('tu', 2), pg_temp.d('d1')));
SELECT pg_temp.assert_eq('6: the sheet says tipo fechas',
  $q$SELECT pg_temp.ctx('planilla')::jsonb ->> 'tipo'$q$, 'fechas');
SELECT pg_temp.assert_eq('6: the sheet lists the planned dates',
  format($q$SELECT (pg_temp.ctx('planilla')::jsonb -> 'fechas' = to_jsonb(ARRAY[%L::date, %L::date]))::text$q$,
         pg_temp.d('d1'), pg_temp.d('d2')), 'true');
SELECT pg_temp.assert_eq('6: the volunteer set for D1 is expected',
  format($q$SELECT string_agg(v ->> 'esperado', ',') FROM jsonb_array_elements(pg_temp.ctx('planilla')::jsonb -> 'voluntarios') v
             WHERE v ->> 'servicio_id' = %L$q$, pg_temp.id('sv', 1)), 'true');
SELECT pg_temp.assert_raises('6: the dated turno off its dates (D1+1)',
  format('SELECT public.ninos_voluntarios_planilla(%L::uuid, %L::date)', pg_temp.id('tu', 2), pg_temp.d('d1_mas_1')),
  '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('6: the dated turno without horario',
  format('SELECT public.ninos_voluntarios_planilla(%L::uuid, %L::date)', pg_temp.id('tu', 3), pg_temp.d('d1')),
  '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('6: the weekly turno off its weekday (Tuesday 3 Mar 2026)',
  format($q$SELECT public.ninos_voluntarios_planilla(%L::uuid, DATE '2026-03-03')$q$, pg_temp.id('tu', 1)),
  '22023', 'fecha_invalida');
RESET ROLE;
SELECT pg_temp.assert_eq('6: opening the past D1 froze the T2 roster with the volunteer',
  format($q$SELECT (SELECT count(*) FROM public.ninos_voluntarios_rosters WHERE turno_id = %L::uuid AND fecha = %L::date)
                || ',' || (SELECT string_agg(servicio_id::text, ',') FROM public.ninos_voluntarios_roster_servicios
                            WHERE turno_id = %L::uuid AND fecha = %L::date)$q$,
         pg_temp.id('tu', 2), pg_temp.d('d1'), pg_temp.id('tu', 2), pg_temp.d('d1')),
  '1,' || pg_temp.id('sv', 1)::text);

-- ── 7. ninos_voluntarios_marcar ──────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('7: marking the volunteer presente on D1 changes one row',
  format($q$SELECT public.ninos_voluntarios_marcar(%L::uuid, %L::date, ARRAY[%L::uuid], 'presente') ->> 'cambiados'$q$,
         pg_temp.id('tu', 2), pg_temp.d('d1'), pg_temp.id('sv', 1)), '1');
SELECT pg_temp.assert_raises('7: marking the dated turno off its dates (D1+1)',
  format($q$SELECT public.ninos_voluntarios_marcar(%L::uuid, %L::date, ARRAY[%L::uuid], 'presente')$q$,
         pg_temp.id('tu', 2), pg_temp.d('d1_mas_1'), pg_temp.id('sv', 1)), '22023', 'fecha_invalida');
RESET ROLE;
SELECT pg_temp.assert_eq('7: the D1 attendance is written as expected and presente',
  format($q$SELECT string_agg(estado || ':' || esperado, ',') FROM public.dream_team_asistencias
             WHERE servicio_id = %L::uuid AND turno_id = %L::uuid AND fecha = %L::date$q$,
         pg_temp.id('sv', 1), pg_temp.id('tu', 2), pg_temp.d('d1')), 'presente:true');
SELECT pg_temp.assert_eq('7: nothing is written on D1+1',
  format($q$SELECT count(*)::text FROM public.dream_team_asistencias WHERE turno_id = %L::uuid AND fecha = %L::date$q$,
         pg_temp.id('tu', 2), pg_temp.d('d1_mas_1')), '0');

-- ── 8. ninos_reporte_voluntarios ─────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('8: the report of D1 has the T2 service with one presente',
  format($q$SELECT string_agg((s ->> 'fecha') || ':' || (s ->> 'presentes'), ',')
              FROM jsonb_array_elements(public.ninos_reporte_voluntarios(%L::date, %L::date, %L::uuid) -> 'servicios') s
             WHERE s ->> 'turno_id' = %L$q$,
         pg_temp.d('d1'), pg_temp.d('d1'), pg_temp.id('ca', 1), pg_temp.id('tu', 2)),
  pg_temp.d('d1')::text || ':1');
RESET ROLE;

-- ── 9. ninos_voluntarios_congelar_pendientes ─────────────────────────

SELECT pg_temp.assert_eq('9: the cron freeze runs',
  'SELECT (public.ninos_voluntarios_congelar_pendientes() >= 0)::text', 'true');
SELECT pg_temp.assert_eq('9: the dated turno without horario is never frozen',
  format('SELECT count(*)::text FROM public.ninos_voluntarios_rosters WHERE turno_id = %L::uuid', pg_temp.id('tu', 3)),
  '0');

SELECT CASE WHEN pg_temp.reloj_ok() THEN '3: pre-check window cases ran'
            ELSE '3: pre-check window cases SKIPPED (Caracas time within 4 h of midnight)' END AS ventana;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_hv_failures;

ROLLBACK;
