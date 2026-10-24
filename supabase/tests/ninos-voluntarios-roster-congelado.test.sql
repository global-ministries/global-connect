-- V7 (odd/tasks/ninos-asistencia-voluntarios.md) — frozen expected roster per
-- turno and fecha (20261012180000_ninos_voluntarios_roster_congelado.sql).
--
-- Covers:
--   a. Loading the roster of a past date freezes it (who and where).
--   b. After a volunteer moves to another turno, the frozen date still shows
--      the original expected roster, in the report and in the roster.
--   c. A date before the feature (2026-10-04) has no snapshot and derives.
--   d. A frozen roster is never overwritten (new volunteer, reload, report).
--   e. A volunteer marked but not in the snapshot counts as an extra.
--   f. Scope: a sub-area coordinator still sees only their team.
--   g. Privileges: anon and authenticated cannot read the snapshot tables nor
--      call the internal helpers.
--
-- Run against STAGING inside BEGIN…ROLLBACK. The last statement is a SELECT
-- of the failing cases ('ALL OK' when none). Needs ninos_hoy() > 2026-10-11.
--
-- Identities (usuario n = auth n): 1 COORD_SUB (coordinate on team A),
-- 3 CONFIG (dream_team.direct on R). Volunteers 10..13 have no account.
-- Tree: R → W → A, B. Room W in campus 1. Turnos T1 and T2 (campus 1, Sunday).
-- P = 2026-10-11 (frozen), Q = 2026-10-04 (before the feature).

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_rc_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_rc_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('f9830000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '9831' WHEN 'us' THEN '9832' WHEN 'ca' THEN '9833'
                       WHEN 'eq' THEN '9834' WHEN 'ro' THEN '9835' WHEN 'sa' THEN '9836'
                       WHEN 'tu' THEN '9837' WHEN 'se' THEN '9838' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- 'equipo:esperados/sin_marcar/extras' per service row of turno T1 on one date.
CREATE OR REPLACE FUNCTION pg_temp.rep(p_fecha date) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT string_agg((s ->> 'equipo') || ':' || concat_ws('/', s ->> 'esperados', s ->> 'sin_marcar', s ->> 'extras'),
                            ',' ORDER BY ord)
            FROM jsonb_array_elements(public.ninos_reporte_voluntarios(p_fecha, p_fecha, pg_temp.id('ca', 1),
                                        pg_temp.id('tu', 1)) -> 'servicios') WITH ORDINALITY AS x(s, ord));
END;
$$;

-- 'apellido' of the expected volunteers in the roster of T1 on one date.
CREATE OR REPLACE FUNCTION pg_temp.esperados(p_fecha date) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT string_agg(v ->> 'apellido', ',' ORDER BY v ->> 'apellido')
            FROM jsonb_array_elements(public.ninos_voluntarios_planilla(pg_temp.id('tu', 1), p_fecha) -> 'voluntarios') v
           WHERE (v ->> 'esperado')::boolean);
END;
$$;

-- 'apellido@equipo' of the frozen roster of T1 on P (read as postgres).
CREATE OR REPLACE FUNCTION pg_temp.congelado() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(u.apellido || '@' || e.label, ',' ORDER BY u.apellido), '')
            FROM public.ninos_voluntarios_roster_servicios z
            JOIN public.dream_team_servicios sv ON sv.id = z.servicio_id
            JOIN public.usuarios u ON u.id = sv.persona_id
            JOIN public.dream_team_equipos e ON e.id = z.equipo_id
           WHERE z.turno_id = pg_temp.id('tu', 1) AND z.fecha = DATE '2026-10-11');
END;
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'rc-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM unnest(ARRAY[1, 3]) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Rc', 'U' || n, 'rc-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM unnest(ARRAY[1, 3]) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Rc', 'V' || n, 'Soltero', 'Femenino' FROM generate_series(10, 13) AS n;

INSERT INTO public.campus (id, nombre, codigo) VALUES (pg_temp.id('ca', 1), 'ZZ Rc Campus 1', 'ZZRC1');
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), true FROM generate_series(10, 13) AS n;

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden)
VALUES (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'Domingo 9:00', 0, '09:00', 1),
       (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'Domingo 11:00', 0, '11:00', 2);

-- (n, parent, label): 1 R, 2 W, 3 A, 4 B.
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo)
SELECT pg_temp.id('eq', n), 'ninos', CASE WHEN p > 0 THEN pg_temp.id('eq', p) END, label, true
  FROM (VALUES (1, 0, 'ZZ Rc Ninos'), (2, 1, 'ZZ Rc Waumba'), (3, 2, 'ZZ Rc A'), (4, 2, 'ZZ Rc B')) AS v(n, p, label);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo)
SELECT pg_temp.id('ro', n), pg_temp.id('eq', e), label, true
  FROM (VALUES (1, 3, 'Voluntario'), (2, 3, 'Coordinador'), (3, 4, 'Voluntario')) AS v(n, e, label);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, grado_min, grado_max, orden)
VALUES (pg_temp.id('sa', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Rc S1', 20, NULL, NULL, 1);

-- Servicio n belongs to person n: (n, equipo, rol). 13 is added later.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', e), pg_temp.id('ro', r),
       'activo'::public.dream_team_estado, timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM (VALUES (1, 3, 2), (10, 3, 1), (11, 3, 1), (12, 4, 3)) AS v(n, e, r);

-- Weekly at T1: 10 and 11 in A, 12 in B.
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla)
SELECT pg_temp.id('se', s), pg_temp.id('tu', 1), 'semanal', NULL FROM unnest(ARRAY[10, 11, 12]) AS s;

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id)
SELECT pg_temp.id('us', n), k, 'dream_team', 'equipo', pg_temp.id('eq', e)::text
  FROM (VALUES (1, 'dream_team.coordinate', 3), (3, 'dream_team.direct', 1)) AS v(n, k, e)
ON CONFLICT DO NOTHING;

GRANT INSERT, SELECT ON t_rc_failures TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text), pg_temp.as_persona(int), pg_temp.id(text, int),
  pg_temp.rep(date), pg_temp.esperados(date) TO authenticated, anon;

-- ── a. freeze on load ────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('a: the past roster lists the expected volunteers',
  $q$SELECT pg_temp.esperados(DATE '2026-10-11')$q$, 'V10,V11,V12');
RESET ROLE;
SELECT pg_temp.assert_eq('a: loading a past roster freezes who was expected and where',
  $q$SELECT pg_temp.congelado()$q$, 'V10@ZZ Rc A,V11@ZZ Rc A,V12@ZZ Rc B');

-- ── b. reassignment after the freeze ─────────────────────────────────

UPDATE public.dream_team_servicio_turnos SET turno_id = pg_temp.id('tu', 2)
 WHERE servicio_id = pg_temp.id('se', 11);
-- 13 joins T1 (team B) after the date was frozen.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
VALUES (pg_temp.id('se', 13), pg_temp.id('us', 13), pg_temp.id('eq', 4), pg_temp.id('ro', 3),
        'activo'::public.dream_team_estado, timestamptz '2020-01-01 12:00+00', 'admin_asignacion');
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla)
VALUES (pg_temp.id('se', 13), pg_temp.id('tu', 1), 'semanal', NULL);
DO $$
BEGIN
  PERFORM set_config('t.rc_at', (SELECT r.congelado_at::text FROM public.ninos_voluntarios_rosters r
                                  WHERE r.turno_id = pg_temp.id('tu', 1) AND r.fecha = DATE '2026-10-11'), true);
EXCEPTION
  WHEN undefined_table THEN NULL;  -- RED run: the table does not exist yet
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('b: the frozen date keeps its expected roster in the report',
  $q$SELECT pg_temp.rep(DATE '2026-10-11')$q$, 'ZZ Rc A:2/2/0,ZZ Rc B:1/1/0');
SELECT pg_temp.assert_eq('b: the frozen date keeps its expected roster in the planilla',
  $q$SELECT pg_temp.esperados(DATE '2026-10-11')$q$, 'V10,V11,V12');

-- ── c. before the feature: derived from today's assignments ──────────

SELECT pg_temp.assert_eq('c: a date before the feature derives from today''s assignments',
  $q$SELECT pg_temp.rep(DATE '2026-10-04')$q$, 'ZZ Rc A:1/1/0,ZZ Rc B:2/2/0');
SELECT pg_temp.assert_eq('c: the derived roster of that date has 13, not 11',
  $q$SELECT pg_temp.esperados(DATE '2026-10-04')$q$, 'V10,V12,V13');
RESET ROLE;
SELECT pg_temp.assert_eq('c: no snapshot is taken before the feature',
  $q$SELECT count(*)::text FROM public.ninos_voluntarios_rosters WHERE turno_id = pg_temp.id('tu', 1) AND fecha = DATE '2026-10-04'$q$,
  '0');

-- ── d. never overwritten ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('d: reloads and reports leave the snapshot untouched',
  $q$SELECT pg_temp.congelado()$q$, 'V10@ZZ Rc A,V11@ZZ Rc A,V12@ZZ Rc B');
SELECT pg_temp.assert_eq('d: the freeze time is kept',
  $q$SELECT (congelado_at::text = current_setting('t.rc_at'))::text FROM public.ninos_voluntarios_rosters
       WHERE turno_id = pg_temp.id('tu', 1) AND fecha = DATE '2026-10-11'$q$, 'true');
SELECT pg_temp.assert_eq('d: freezing an already frozen date is a no-op',
  $q$SELECT public.ninos_voluntarios_congelar(pg_temp.id('tu', 1), DATE '2026-10-11')::text$q$, 'false');

-- ── e. marked but not in the snapshot = extra ────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT public.ninos_voluntarios_marcar(pg_temp.id('tu', 1), DATE '2026-10-11', ARRAY[pg_temp.id('se', 13)], 'presente');
SELECT pg_temp.assert_eq('e: a volunteer outside the snapshot marked present is an extra',
  $q$SELECT pg_temp.rep(DATE '2026-10-11')$q$, 'ZZ Rc A:2/2/0,ZZ Rc B:1/1/1');

-- ── f. sub-area coordinator scope (V6) ───────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('f: a sub-area coordinator sees only their team on a frozen date',
  $q$SELECT pg_temp.rep(DATE '2026-10-11')$q$, 'ZZ Rc A:2/2/0');

-- ── g. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_raises('g: authenticated cannot read the snapshot headers',
  $q$SELECT count(*) FROM public.ninos_voluntarios_rosters$q$, '42501');
SELECT pg_temp.assert_raises('g: authenticated cannot read the snapshot rows',
  $q$SELECT count(*) FROM public.ninos_voluntarios_roster_servicios$q$, '42501');
SELECT pg_temp.assert_raises('g: authenticated cannot freeze directly',
  $q$SELECT public.ninos_voluntarios_congelar(pg_temp.id('tu', 2), DATE '2026-10-11')$q$, '42501');
SELECT pg_temp.assert_raises('g: authenticated cannot call the live roster helper',
  $q$SELECT count(*) FROM public.ninos_voluntarios_del_turno_vivo(pg_temp.id('tu', 1), DATE '2026-10-11')$q$, '42501');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_raises('g: anon cannot read the snapshot headers',
  $q$SELECT count(*) FROM public.ninos_voluntarios_rosters$q$, '42501');
SELECT pg_temp.assert_raises('g: anon cannot read the snapshot rows',
  $q$SELECT count(*) FROM public.ninos_voluntarios_roster_servicios$q$, '42501');

RESET ROLE;

-- ── h. scheduled freeze and unauthorized marking (20261012180100) ────

-- T2 on P has no snapshot yet (every call above was scoped to T1).
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('h: a caller without authority on the servicio cannot mark',
  $q$SELECT public.ninos_voluntarios_marcar(pg_temp.id('tu', 2), DATE '2026-10-11', ARRAY[pg_temp.id('se', 12)], 'presente')$q$,
  '42501');
RESET ROLE;
SELECT pg_temp.assert_eq('h: an unauthorized mark does not freeze the date',
  $q$SELECT count(*)::text FROM public.ninos_voluntarios_rosters WHERE turno_id = pg_temp.id('tu', 2) AND fecha = DATE '2026-10-11'$q$,
  '0');
SELECT pg_temp.assert_eq('h: the scheduled freeze freezes the missing past date of every active turno',
  $q$SELECT (public.ninos_voluntarios_congelar_pendientes() >= 1)::text$q$, 'true');
SELECT pg_temp.assert_eq('h: the scheduled snapshot of T2 has the volunteer now assigned there',
  $q$SELECT string_agg(u.apellido, ',' ORDER BY u.apellido) FROM public.ninos_voluntarios_roster_servicios z
       JOIN public.dream_team_servicios sv ON sv.id = z.servicio_id JOIN public.usuarios u ON u.id = sv.persona_id
      WHERE z.turno_id = pg_temp.id('tu', 2) AND z.fecha = DATE '2026-10-11'$q$, 'V11');
SELECT pg_temp.assert_eq('h: the scheduled freeze does not overwrite T1',
  $q$SELECT pg_temp.congelado()$q$, 'V10@ZZ Rc A,V11@ZZ Rc A,V12@ZZ Rc B');
SELECT pg_temp.assert_eq('h: running it again freezes nothing for these turnos',
  $q$SELECT count(*)::text FROM public.ninos_voluntarios_rosters
       WHERE turno_id IN (pg_temp.id('tu', 1), pg_temp.id('tu', 2)) AND public.ninos_voluntarios_congelar(turno_id, fecha)$q$,
  '0');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_raises('h: authenticated cannot run the scheduled freeze',
  $q$SELECT public.ninos_voluntarios_congelar_pendientes()$q$, '42501');
RESET ROLE;

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_rc_failures;

ROLLBACK;
