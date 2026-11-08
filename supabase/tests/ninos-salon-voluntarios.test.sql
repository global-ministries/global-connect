-- T2c (odd/tasks/ninos-checkin-pco.md, S7, S5, L27) — the salón of each
-- volunteer and today's volunteers of a salón
-- (20261108130000_ninos_salon_voluntarios.sql).
--
-- Covers:
--   a. Grants: PUBLIC and anon run none of the three functions;
--      authenticated runs them; SECURITY DEFINER with search_path ''; the
--      read RPCs are STABLE. The two tables have RLS on and no privilege for
--      anon or authenticated.
--   b. ninos_salon_voluntarios authority: the area coordinator and a Líder
--      read it; a user without Niños rights is sin_autoridad; anon gets
--      permission denied; arguments (unknown salón, turno of another campus,
--      NULL fecha).
--   c. Who serves the salón (effective salón = day row, else habitual):
--      habitual; the day row wins over the habitual; a day row to «mesa»
--      takes the volunteer out of the salón; another salón's volunteers are
--      excluded; a non-expected volunteer marked presente is included by
--      effective salón, a non-expected unmarked one is not; a volunteer with
--      no salón is nowhere. Llegó with hour, pending; `asignados`; rules.
--   d. ninos_voluntarios_salones: active salones of the campus (not the
--      inactive one) and each assigned volunteer's effective / habitual salón
--      and es_del_dia; refused to whoever cannot mark (Líder, nobody).
--   e. ninos_voluntario_salon_asignar: habitual set / clear; day row set,
--      to mesa, and removed when equal to the habitual; the salón screen
--      follows; the planilla marker may, a random user, a Líder and the
--      coordinator of another area may not; inactive salón, salón of another
--      campus, a date the turno does not happen on, turno without fecha and an
--      unknown servicio are refused with their code and HINT, writing nothing.
--   f. The read RPCs write nothing (marks, frozen rosters, salón tables),
--      also on a past date that could be frozen.
--
-- Run inside BEGIN…ROLLBACK. The last statement is a SELECT of the failing
-- cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD (dream_team.coordinate on W),
-- 2 NADIE, 3 LIDER (servicio in W/Líderes), 4 COORD2 (coordinate on W2,
-- campus 2). Volunteers 11–20, all in W/Maternal with campus 1 as principal.
-- Tree: R → W (area) → M 'Maternal', L 'Líderes'. R2 → W2 (campus 2).
-- Salones campus 1 (area W): S1 'Sala A' (6 niños por voluntario, mínimo 2,
-- capacidad 18), S2 'Sala B', S3 'Sala C' (nobody), S5 'Sala D' inactive.
-- Campus 2: S4.
-- Turnos: T1, T2 campus 1 Sunday weekly; T3 campus 2.
-- F = today if Sunday, else the coming Sunday (Caracas).
-- On T1 / F (h = habitual, d = day row):
--   11 T1, h S1, presente 8:35   → S1, Llegó
--   12 T1, h S1, unmarked        → S1, pending
--   13 T2 only, h S1, presente   → S1, esperado false
--   14 T2 only, h S1, unmarked   → nowhere listed (counts in asignados)
--   15 T1, h S2, presente 8:40   → S2
--   16 T1, h S2, d S1            → S1 (day row wins), not S2
--   17 T1, h S1, d mesa          → not in S1
--   18 T1, no salón              → nowhere
--   19 T1, h S1, d S2 on T2      → S1 on T1 (the T2 row does not apply)
--   20 T1, free: used by the asignar cases

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_sv_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_sv_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_sv_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL,
                                                 p_hint text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_hint text;
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hint = PG_EXCEPTION_HINT;
    IF SQLSTATE <> p_sqlstate OR (p_message IS NOT NULL AND SQLERRM <> p_message)
       OR (p_hint IS NOT NULL AND v_hint IS DISTINCT FROM p_hint) THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '')
        || coalesce(' / ' || p_hint, '') || ', got ' || SQLSTATE || ' ' || SQLERRM || coalesce(' / ' || v_hint, ''));
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
  SELECT format('c5a10000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '5a01' WHEN 'us' THEN '5a02' WHEN 'se' THEN '5a03' WHEN 'eq' THEN '5a04'
                       WHEN 'ro' THEN '5a05' WHEN 'sa' THEN '5a06' WHEN 'tu' THEN '5a07' WHEN 'ca' THEN '5a08' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_sv_ctx WHERE k = p_k;
$$;

-- The service date F.
CREATE OR REPLACE FUNCTION pg_temp.f() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('f')::date;
$$;

-- "SELECT public.ninos_salon_voluntarios(S n, T t, fecha)" (fecha default F).
CREATE OR REPLACE FUNCTION pg_temp.vol(p_salon int, p_turno int, p_fecha date DEFAULT NULL, p_nula boolean DEFAULT false)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_salon_voluntarios(%L::uuid, %L::uuid, %L::date)',
                pg_temp.id('sa', p_salon), pg_temp.id('tu', p_turno),
                CASE WHEN p_nula THEN NULL ELSE coalesce(p_fecha, pg_temp.f()) END);
$$;

-- The volunteers of a salón as "apellido:esperado:estado:hora" sorted by apellido.
CREATE OR REPLACE FUNCTION pg_temp.lista(p_salon int, p_turno int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format($q$SELECT coalesce(string_agg(v->>'apellido' || ':' || (v->>'esperado') || ':' || coalesce(v->>'estado', '-')
                         || ':' || coalesce(to_char((v->>'marcado_at')::timestamptz AT TIME ZONE 'America/Caracas', 'HH24:MI'), '-'),
                         ',' ORDER BY v->>'apellido'), '')
                     FROM jsonb_array_elements((%s) -> 'voluntarios') v$q$, pg_temp.vol(p_salon, p_turno));
$$;

-- "SELECT public.ninos_voluntario_salon_asignar(servicio n, S s, T t, fecha)"; s/t NULL allowed.
CREATE OR REPLACE FUNCTION pg_temp.asignar(p_servicio int, p_salon int, p_turno int DEFAULT NULL, p_fecha date DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_voluntario_salon_asignar(%L::uuid, %L::uuid, %L::uuid, %L::date)',
                pg_temp.id('se', p_servicio),
                CASE WHEN p_salon IS NULL THEN NULL ELSE pg_temp.id('sa', p_salon) END,
                CASE WHEN p_turno IS NULL THEN NULL ELSE pg_temp.id('tu', p_turno) END, p_fecha);
$$;

-- What the planilla says of servicio n on T1 / F: "salón efectivo:habitual:es_del_dia" or "-".
CREATE OR REPLACE FUNCTION pg_temp.salon_de(p_servicio int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format($q$SELECT coalesce((SELECT coalesce(a->>'salon', 'mesa') || ':'
                                          || coalesce((SELECT s.nombre FROM public.ninos_salones s WHERE s.id = (a->>'habitual_id')::uuid), '-')
                                          || ':' || (a->>'es_del_dia')
                                     FROM jsonb_array_elements(public.ninos_voluntarios_salones(%L::uuid, %L::date) -> 'asignaciones') a
                                    WHERE a->>'servicio_id' = %L), '-')$q$,
                pg_temp.id('tu', 1), pg_temp.f(), pg_temp.id('se', p_servicio));
$$;

-- Runs a query built by the helpers above and returns its single value.
CREATE OR REPLACE FUNCTION pg_temp.q(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN v;
END;
$$;

-- Row counts the read RPCs must not change.
CREATE OR REPLACE FUNCTION pg_temp.escrituras() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT (SELECT count(*) FROM public.dream_team_asistencias) || '/'
         || (SELECT count(*) FROM public.ninos_voluntarios_rosters) || '/'
         || (SELECT count(*) FROM public.ninos_voluntarios_roster_servicios) || '/'
         || (SELECT count(*) FROM public.ninos_voluntario_salon) || '/'
         || (SELECT count(*) FROM public.ninos_voluntario_salon_dia);
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_sv_ctx (k, v)
SELECT 'f', (h + ((7 - extract(dow FROM h)::int) % 7))::text
  FROM (SELECT (now() AT TIME ZONE 'America/Caracas')::date AS h) x;

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Sv Campus 1', 'ZZSV1'),
  (pg_temp.id('ca', 2), 'ZZ Sv Campus 2', 'ZZSV2');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'sv-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Sv', 'U' || n, 'sv-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Sv Vol', 'V' || n, 'Soltero', 'Femenino'
  FROM generate_series(11, 20) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Sv R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Sv W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Maternal', true),
  (pg_temp.id('eq', 6), 'ninos', pg_temp.id('eq', 2), 'Líderes', true),
  (pg_temp.id('eq', 7), 'ninos', NULL, 'ZZ Sv R2', true),
  (pg_temp.id('eq', 8), 'ninos', pg_temp.id('eq', 7), 'ZZ Sv W2', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'Voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 6), 'Líder', true);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, orden, activo) VALUES
  (pg_temp.id('sa', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Sv Sala A', 18, 1, true),
  (pg_temp.id('sa', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Sv Sala B', 20, 2, true),
  (pg_temp.id('sa', 3), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Sv Sala C', 20, 3, true),
  (pg_temp.id('sa', 5), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Sv Sala D', 20, 4, false),
  (pg_temp.id('sa', 4), pg_temp.id('ca', 2), pg_temp.id('eq', 8), 'waumba', 'ZZ Sv S4', 20, 1, true);
UPDATE public.ninos_salones SET ninos_por_voluntario = 6, min_voluntarios = 2 WHERE id = pg_temp.id('sa', 1);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo, tipo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Sv Domingo 9', 0, '09:00', 1, true, 'semanal'),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'ZZ Sv Domingo 11', 0, '11:00', 2, true, 'semanal'),
  (pg_temp.id('tu', 3), pg_temp.id('ca', 2), 'ZZ Sv Domingo C2', 0, '10:00', 1, true, 'semanal');

-- Volunteer assignments need a principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), true FROM unnest(ARRAY[3, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) AS n;

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', CASE WHEN n = 3 THEN 6 ELSE 3 END),
       pg_temp.id('ro', CASE WHEN n = 3 THEN 2 ELSE 1 END), 'activo'::public.dream_team_estado,
       timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM unnest(ARRAY[3, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) AS n;

INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla)
SELECT pg_temp.id('se', s), pg_temp.id('tu', t), 'semanal', NULL
  FROM (VALUES (11, 1), (12, 1), (13, 2), (14, 2), (15, 1), (16, 1), (17, 1), (18, 1), (19, 1), (20, 1)) AS v(s, t);

INSERT INTO public.ninos_voluntario_salon (servicio_id, salon_id)
SELECT pg_temp.id('se', s), pg_temp.id('sa', sa)
  FROM (VALUES (11, 1), (12, 1), (13, 1), (14, 1), (15, 2), (16, 2), (17, 1), (19, 1)) AS v(s, sa);
INSERT INTO public.ninos_voluntario_salon_dia (servicio_id, turno_id, fecha, salon_id)
SELECT pg_temp.id('se', s), pg_temp.id('tu', t), pg_temp.f(), CASE WHEN sa IS NULL THEN NULL ELSE pg_temp.id('sa', sa) END
  FROM (VALUES (16, 1, 1), (17, 1, NULL), (19, 2, 2)) AS v(s, t, sa);

INSERT INTO public.dream_team_asistencias (servicio_id, turno_id, fecha, estado, esperado, marcado_at)
SELECT pg_temp.id('se', s), pg_temp.id('tu', 1), pg_temp.f(), est, esp,
       (pg_temp.f() + hora) AT TIME ZONE 'America/Caracas'
  FROM (VALUES (11, 'presente', true, time '08:35'), (13, 'presente', false, time '08:50'),
               (15, 'presente', true, time '08:40')) AS v(s, est, esp, hora);

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 4) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 4), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 8)::text);

GRANT INSERT, SELECT, UPDATE ON t_sv_failures, t_sv_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text, text), pg_temp.assert_denied(text, text), pg_temp.run(text, text),
  pg_temp.as_persona(int), pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.f(),
  pg_temp.vol(int, int, date, boolean), pg_temp.lista(int, int), pg_temp.asignar(int, int, int, date),
  pg_temp.salon_de(int), pg_temp.escrituras(), pg_temp.q(text)
  TO authenticated, anon;

-- ── a. grants ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: PUBLIC / anon / authenticated execute (3 functions)',
  $q$SELECT string_agg(has_function_privilege('public', f, 'EXECUTE')::text || '/'
                       || has_function_privilege('anon', f, 'EXECUTE')::text || '/'
                       || has_function_privilege('authenticated', f, 'EXECUTE')::text, ',' ORDER BY f)
       FROM unnest(ARRAY['public.ninos_salon_voluntarios(uuid, uuid, date)',
                         'public.ninos_voluntario_salon_asignar(uuid, uuid, uuid, date)',
                         'public.ninos_voluntarios_salones(uuid, date)']) f$q$,
  'false/false/true,false/false/true,false/false/true');
SELECT pg_temp.assert_eq('a: SECURITY DEFINER, search_path empty; reads STABLE, asignar VOLATILE',
  $q$SELECT string_agg(p.proname || ':' || p.prosecdef::text || ':' || array_to_string(p.proconfig, ',') || ':' || p.provolatile::text,
                       ',' ORDER BY p.proname)
       FROM pg_proc p
      WHERE p.oid IN ('public.ninos_salon_voluntarios(uuid, uuid, date)'::regprocedure,
                      'public.ninos_voluntario_salon_asignar(uuid, uuid, uuid, date)'::regprocedure,
                      'public.ninos_voluntarios_salones(uuid, date)'::regprocedure)$q$,
  'ninos_salon_voluntarios:true:search_path="":s,ninos_voluntario_salon_asignar:true:search_path="":v,'
  || 'ninos_voluntarios_salones:true:search_path="":s');
SELECT pg_temp.assert_eq('a: the salón tables: RLS on, no privilege for anon / authenticated',
  $q$SELECT string_agg(c.relrowsecurity::text || '/'
                       || has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')::text || '/'
                       || has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')::text, ',' ORDER BY c.relname)
       FROM pg_class c
      WHERE c.oid IN ('public.ninos_voluntario_salon'::regclass, 'public.ninos_voluntario_salon_dia'::regclass)$q$,
  'true/false/false,true/false/false');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('a: anon cannot call ninos_salon_voluntarios', pg_temp.vol(1, 1));
SELECT pg_temp.assert_denied('a: anon cannot call ninos_voluntario_salon_asignar', pg_temp.asignar(20, 1));
RESET ROLE;

INSERT INTO t_sv_ctx (k, v) VALUES ('escrituras', pg_temp.escrituras());

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_denied('a: authenticated cannot read the habitual table', 'SELECT count(*) FROM public.ninos_voluntario_salon');
SELECT pg_temp.assert_denied('a: authenticated cannot write the day table',
  format($q$DELETE FROM public.ninos_voluntario_salon_dia WHERE servicio_id = %L::uuid$q$, pg_temp.id('se', 16)));

-- ── b. ninos_salon_voluntarios: authority and arguments ──────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('b: a user without Niños rights is refused', pg_temp.vol(1, 1), '42501', 'sin_autoridad',
  'No tienes permiso para ver este salón.');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('b: a Líder of the area reads it',
  format($q$SELECT ((%s) ->> 'salon_id')$q$, pg_temp.vol(1, 1)), pg_temp.id('sa', 1)::text);
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('b: a salón of another area / campus', pg_temp.vol(4, 3), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('b: an unknown salón', pg_temp.vol(99, 1), '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('b: a turno of another campus', pg_temp.vol(1, 3), '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('b: a NULL fecha', pg_temp.vol(1, 1, NULL, true), '22023', 'fecha_invalida');

-- ── c. who serves the salón ──────────────────────────────────────────

SELECT pg_temp.assert_eq('c: S1 rules, capacity and asignados (11, 12, 13, 14, 16, 19)',
  format($q$SELECT r ->> 'capacidad' || '/' || coalesce(r ->> 'ninos_por_voluntario', 'null') || '/'
                   || (r ->> 'min_voluntarios') || '/' || (r ->> 'asignados')
              FROM (SELECT (%s) AS r) x$q$, pg_temp.vol(1, 1)),
  '18/6/2/6');
SELECT pg_temp.assert_eq('c: S1: habitual, day row wins, mesa row out, non-expected presente in, other salón out',
  pg_temp.lista(1, 1),
  'V11:true:presente:08:35,V12:true:-:-,V13:false:presente:08:50,V16:true:-:-,V19:true:-:-');
SELECT pg_temp.assert_eq('c: each volunteer carries servicio, nombre and rol',
  format($q$SELECT v ->> 'servicio_id' || '/' || (v ->> 'nombre') || '/' || (v ->> 'rol')
              FROM jsonb_array_elements((%s) -> 'voluntarios') v WHERE v ->> 'apellido' = 'V11'$q$, pg_temp.vol(1, 1)),
  pg_temp.id('se', 11)::text || '/ZZ Sv Vol/Voluntario');
SELECT pg_temp.assert_eq('c: S2 keeps only 15 (16 moved to S1 for the day)', pg_temp.lista(2, 1), 'V15:true:presente:08:40');
SELECT pg_temp.assert_eq('c: S2 without rules, asignados 1',
  format($q$SELECT coalesce(r ->> 'ninos_por_voluntario', 'null') || '/' || (r ->> 'min_voluntarios') || '/' || (r ->> 'asignados')
              FROM (SELECT (%s) AS r) x$q$, pg_temp.vol(2, 1)),
  'null/0/1');
SELECT pg_temp.assert_eq('c: S3 has nobody',
  format($q$SELECT (r ->> 'asignados') || '/' || jsonb_array_length(r -> 'voluntarios') FROM (SELECT (%s) AS r) x$q$, pg_temp.vol(3, 1)),
  '0/0');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('c: the Líder sees the same list', pg_temp.lista(1, 1),
  'V11:true:presente:08:35,V12:true:-:-,V13:false:presente:08:50,V16:true:-:-,V19:true:-:-');

-- ── d. ninos_voluntarios_salones ─────────────────────────────────────

SELECT pg_temp.assert_raises('d: a Líder cannot mark, so cannot read the planilla salones',
  format('SELECT public.ninos_voluntarios_salones(%L::uuid, %L::date)', pg_temp.id('tu', 1), pg_temp.f()),
  '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('d: a user without Niños rights is refused',
  format('SELECT public.ninos_voluntarios_salones(%L::uuid, %L::date)', pg_temp.id('tu', 1), pg_temp.f()),
  '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('d: the active salones of the campus, in order (not the inactive one)',
  format($q$SELECT string_agg(s ->> 'nombre', ',') FROM jsonb_array_elements(public.ninos_voluntarios_salones(%L::uuid, %L::date) -> 'salones') s$q$,
         pg_temp.id('tu', 1), pg_temp.f()),
  'ZZ Sv Sala A,ZZ Sv Sala B,ZZ Sv Sala C');
SELECT pg_temp.assert_eq('d: effective : habitual : es_del_dia',
  $q$SELECT concat_ws(' | ', pg_temp.q(pg_temp.salon_de(11)), pg_temp.q(pg_temp.salon_de(16)), pg_temp.q(pg_temp.salon_de(17)), pg_temp.q(pg_temp.salon_de(18)), pg_temp.q(pg_temp.salon_de(19)))$q$,
  'ZZ Sv Sala A:ZZ Sv Sala A:false | ZZ Sv Sala A:ZZ Sv Sala B:true | mesa:ZZ Sv Sala A:true | - | ZZ Sv Sala A:ZZ Sv Sala A:false');

-- ── e. ninos_voluntario_salon_asignar ────────────────────────────────

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('e: a random user cannot assign', pg_temp.asignar(20, 1), '42501', 'sin_autoridad',
  'No tienes permiso para asignar el salón de este voluntario.');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('e: a Líder cannot assign', pg_temp.asignar(20, 1), '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('e: the coordinator of another area cannot assign', pg_temp.asignar(20, 1), '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('e: an unknown servicio', pg_temp.asignar(99, 1), '22023', 'servicio_no_encontrado', 'El voluntario no existe.');
SELECT pg_temp.assert_raises('e: an inactive salón', pg_temp.asignar(20, 5), '22023', 'salon_invalido',
  'El salón no existe o está desactivado.');
SELECT pg_temp.assert_raises('e: a salón of another campus', pg_temp.asignar(20, 4), '22023', 'salon_otro_campus',
  'El voluntario no sirve en Niños de ese campus.');
SELECT pg_temp.assert_raises('e: a turno without fecha', pg_temp.asignar(20, 1, 1), '22023', 'fecha_invalida',
  'Para un solo servicio indica el horario y la fecha.');
SELECT pg_temp.assert_raises('e: a date the turno does not happen on', pg_temp.asignar(20, 1, 1, pg_temp.f() + 1),
  '22023', 'fecha_invalida', 'Ese horario no tiene servicio en esa fecha, o la fecha tiene más de 14 días.');
SELECT pg_temp.assert_raises('e: a salón of the other campus for the day', pg_temp.asignar(20, 4, 1, pg_temp.f()),
  '22023', 'salon_otro_campus', 'El salón es de otro campus que el horario.');
RESET ROLE;
SELECT pg_temp.assert_eq('e: the refused calls wrote nothing', 'SELECT pg_temp.escrituras()', pg_temp.ctx('escrituras'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_eq('e: set the habitual salón',
  format($q$SELECT (%s)::text$q$, pg_temp.asignar(20, 1)),
  format('{"salon_id": "%s", "es_del_dia": false, "servicio_id": "%s"}', pg_temp.id('sa', 1), pg_temp.id('se', 20)));
SELECT pg_temp.assert_eq('e: the planilla and the salón follow the habitual',
  $q$SELECT pg_temp.q(pg_temp.salon_de(20)) || ' | ' || (pg_temp.q(pg_temp.lista(1, 1)) LIKE '%V20:true:-:-%')::text$q$, 'ZZ Sv Sala A:ZZ Sv Sala A:false | true');
SELECT pg_temp.run('e: only today in Sala B', pg_temp.asignar(20, 2, 1, pg_temp.f()));
SELECT pg_temp.assert_eq('e: the day row wins in the planilla and both salones',
  $q$SELECT pg_temp.q(pg_temp.salon_de(20)) || ' | ' || (pg_temp.q(pg_temp.lista(1, 1)) LIKE '%V20%')::text || ' | ' || pg_temp.q(pg_temp.lista(2, 1))$q$,
  'ZZ Sv Sala B:ZZ Sv Sala A:true | false | V15:true:presente:08:40,V20:true:-:-');
RESET ROLE;
SELECT pg_temp.assert_eq('e: who set the day salón is kept',
  format($q$SELECT updated_by::text FROM public.ninos_voluntario_salon_dia WHERE servicio_id = %L::uuid$q$, pg_temp.id('se', 20)),
  pg_temp.id('us', 1)::text);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.run('e: only today at the mesa', pg_temp.asignar(20, NULL, 1, pg_temp.f()));
SELECT pg_temp.assert_eq('e: at the mesa for the day: in no salón',
  $q$SELECT pg_temp.q(pg_temp.salon_de(20)) || ' | ' || (pg_temp.q(pg_temp.lista(1, 1)) LIKE '%V20%')::text || ' | ' || (pg_temp.q(pg_temp.lista(2, 1)) LIKE '%V20%')::text$q$,
  'mesa:ZZ Sv Sala A:true | false | false');
SELECT pg_temp.run('e: today back to the habitual salón', pg_temp.asignar(20, 1, 1, pg_temp.f()));
SELECT pg_temp.assert_eq('e: a day value equal to the habitual: the service follows the habitual again',
  'SELECT pg_temp.q(pg_temp.salon_de(20))', 'ZZ Sv Sala A:ZZ Sv Sala A:false');
RESET ROLE;
SELECT pg_temp.assert_eq('e: … and its day row is gone',
  format($q$SELECT count(*)::text FROM public.ninos_voluntario_salon_dia WHERE servicio_id = %L::uuid$q$, pg_temp.id('se', 20)), '0');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.run('e: clear the habitual salón', pg_temp.asignar(20, NULL));
SELECT pg_temp.assert_eq('e: without salón the volunteer is at the mesa', 'SELECT pg_temp.q(pg_temp.salon_de(20))', '-');

-- ── f. the read RPCs write nothing ───────────────────────────────────

RESET ROLE;
INSERT INTO t_sv_ctx (k, v) VALUES ('antes_lecturas', pg_temp.escrituras());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.run('f: read a past date (could be frozen)', format(
  'SELECT (%s), public.ninos_voluntarios_salones(%L::uuid, DATE ''2026-03-08'')',
  pg_temp.vol(1, 1, DATE '2026-03-08'), pg_temp.id('tu', 1)));
SELECT pg_temp.run('f: read today again', format('SELECT (%s), public.ninos_voluntarios_salones(%L::uuid, %L::date)',
  pg_temp.vol(2, 1), pg_temp.id('tu', 1), pg_temp.f()));
RESET ROLE;
SELECT pg_temp.assert_eq('f: no mark, no frozen roster, no salón row was written',
  'SELECT pg_temp.escrituras()', pg_temp.ctx('antes_lecturas'));

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_sv_failures;

ROLLBACK;
