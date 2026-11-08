-- T2b (odd/tasks/ninos-checkin-pco.md, S6, S9.4) — the salón's Esperados /
-- Aquí / Retirados, moving a child to another salón in one step and «Llegó»
-- from the salón (20261108140000_ninos_salon_estados.sql).
--
-- Covers:
--   a. Grants: PUBLIC and anon run none of the three RPCs; authenticated
--      runs them; the helper ninos_salon_esperado is internal and
--      ninos_es_voluntario_del_salon no longer exists (L32); SECURITY DEFINER with
--      search_path ''; the read is STABLE, the writes VOLATILE. The audit
--      table has RLS on and no privilege for anon or authenticated; nobody
--      but the definer RPC can UPDATE ninos_checkins.salon_id.
--   b. Aquí is unchanged: ninos_lista_salon keeps its result type and lists
--      the children inside, as before.
--   c. ninos_salon_estado: authority as ninos_lista_salon (coordinator and
--      Líder read, a user without rights and anon do not), arguments;
--      Esperados = today's pending pre-checks inside the window whose salón
--      is this one (preferred salón, special needs, grade, age; not the
--      cancelled, the already inside, another turno, an inactive salón);
--      Retirados with hour and who; destinations (active, same campus, the
--      caller operates them) with occupancy; puede_operar / puede_llegar
--      (true for whoever reads it, L32); a volunteer only assigned to the
--      salón in the planilla cannot read it.
--   d. ninos_mover_salon: same check-in, code and visit, new salón, one audit
--      row (from, to, by, motivo), Aquí follows; refusals (not inside, already
--      out, other campus, inactive, same salón, no authority on origin or on
--      destination, a volunteer, motivo too long) write nothing.
--   e. ninos_checkin_desde_salon: whoever sees the salón may (L32: a Líder
--      of the area who does not operate, an anfitrión); the code is generated (4 digits, unique
--      among the open ones), entrada_desde_salon and entrada_por are kept,
--      the pre-check reads 'ingresado' (what the parent's phone shows);
--      refusals (no pre-check, pre-check of another turno, cancelled, expected
--      in another salón, already inside, past date, a volunteer only assigned
--      to the salón in the planilla, a coordinator who does not see the
--      salón, nobody) write nothing.
--
-- Run inside BEGIN…ROLLBACK. The last statement is a SELECT of the failing
-- cases ('ALL OK' when none).
--
-- Identities (usuario n = auth n): 1 COORD (dream_team.coordinate on W),
-- 2 NADIE, 3 LIDER (W/Líderes, no salón assigned: sees every W salón),
-- 4 COORDU (coordinate on U), 5 ANFI (W/Anfitriones: operates W), 6 VOL
-- (W/Maternal, habitual salón S1 on T1: assigned only, does not see the
-- salón), 7 VOL2 (W/Maternal, habitual S2), 9 parent of the pre-checks.
-- Tree: R → W (waumba area) → Anfitriones, Líderes, Maternal; R → U (upstreet area);
-- R2 → W2 (campus 2).
-- Salones campus 1: S1 'Sala A' (W, 0–35 m), S2 'Sala B' (W, 36–59 m),
-- S3 'Grado 1' (U, grade 1), S5 inactive (W, 0–35 m, orden 0), S6 'Plus'
-- (W, special needs). Campus 2: S4.
-- Turnos: T1 and T2 campus 1, today's weekday at the current minute (window
-- open); T3 campus 2. F = today (Caracas).
-- Children (all with ficha; 12 months unless said):
--   21 pre-check T1                        → Esperado S1
--   22 48 months, pre-check T1             → Esperado S2
--   23 preferred salón S2, pre-check T1    → Esperado S2
--   24 grade 1, pre-check T1               → Esperado S3
--   25 special needs, pre-check T1         → Esperado S6
--   26 pre-check T1 cancelled              → nowhere
--   27 pre-check T1, inside S1             → Aquí S1
--   28 pre-check T2                        → not on T1
--   29 no pre-check                        → «Llegó» refused
--   30 in S1, picked up 9:08 by Ana        → Retirados S1
--   31, 32 inside S1, one visit and code   → the move cases

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_se_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_se_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_se_failures(case_name) VALUES (p_case || ': ' || p_detail);
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
  SELECT format('5a1e0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN '5e01' WHEN 'us' THEN '5e02' WHEN 'se' THEN '5e03' WHEN 'eq' THEN '5e04'
                       WHEN 'ro' THEN '5e05' WHEN 'sa' THEN '5e06' WHEN 'tu' THEN '5e07' WHEN 'ca' THEN '5e08'
                       WHEN 'ci' THEN '5e09' WHEN 'vi' THEN '5e0a' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_se_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.f() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('f')::date;
$$;

-- "SELECT public.ninos_salon_estado(S n, T t, fecha)" (fecha default F).
CREATE OR REPLACE FUNCTION pg_temp.estado(p_salon int, p_turno int DEFAULT 1, p_fecha date DEFAULT NULL, p_nula boolean DEFAULT false)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_salon_estado(%L::uuid, %L::uuid, %L::date)',
                pg_temp.id('sa', p_salon), pg_temp.id('tu', p_turno),
                CASE WHEN p_nula THEN NULL ELSE coalesce(p_fecha, pg_temp.f()) END);
$$;

-- The apellidos of one list of the estado ("esperados", "retirados"), sorted.
CREATE OR REPLACE FUNCTION pg_temp.nombres(p_salon int, p_lista text, p_turno int DEFAULT 1, p_fecha date DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format($q$SELECT coalesce(string_agg(x ->> 'apellido', ',' ORDER BY x ->> 'apellido'), '')
                     FROM jsonb_array_elements((%s) -> %L) x$q$, pg_temp.estado(p_salon, p_turno, p_fecha), p_lista);
$$;

-- "SELECT public.ninos_mover_salon(niño n, T1, F, S destino, motivo)".
CREATE OR REPLACE FUNCTION pg_temp.mover(p_nino int, p_destino int, p_motivo text DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_mover_salon(%L::uuid, %L::uuid, %L::date, %L::uuid, %L::text)',
                pg_temp.id('us', p_nino), pg_temp.id('tu', 1), pg_temp.f(), pg_temp.id('sa', p_destino), p_motivo);
$$;

-- "SELECT public.ninos_checkin_desde_salon(niño n, S s, T t, fecha)".
CREATE OR REPLACE FUNCTION pg_temp.llego(p_nino int, p_salon int, p_turno int DEFAULT 1, p_fecha date DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format('SELECT public.ninos_checkin_desde_salon(%L::uuid, %L::uuid, %L::uuid, %L::date)',
                pg_temp.id('us', p_nino), pg_temp.id('sa', p_salon), pg_temp.id('tu', p_turno), coalesce(p_fecha, pg_temp.f()));
$$;

-- Today's room list (Aquí): apellidos of ninos_lista_salon.
CREATE OR REPLACE FUNCTION pg_temp.aqui(p_salon int) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format($q$SELECT coalesce(string_agg(l.apellido, ',' ORDER BY l.apellido), '')
                     FROM public.ninos_lista_salon(%L::uuid, %L::date, %L::uuid) l$q$,
                pg_temp.id('sa', p_salon), pg_temp.f(), pg_temp.id('tu', 1));
$$;

CREATE OR REPLACE FUNCTION pg_temp.q(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN v;
END;
$$;

-- Everything a refused write must leave as it was.
CREATE OR REPLACE FUNCTION pg_temp.escrituras() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT (SELECT count(*) FROM public.ninos_checkins) || '/'
         || (SELECT coalesce(string_agg(c.id::text || ':' || c.salon_id::text || ':' || c.codigo || ':' || c.visita_id::text,
                                        ',' ORDER BY c.id), '')
               FROM public.ninos_checkins c WHERE c.nino_id::text LIKE '5a1e0000%') || '/'
         || (SELECT count(*) FROM public.ninos_checkin_movimientos) || '/'
         || (SELECT coalesce(string_agg(p.nino_id::text || ':' || p.estado, ',' ORDER BY p.nino_id, p.turno_id), '')
               FROM public.ninos_prechecks p WHERE p.nino_id::text LIKE '5a1e0000%');
$$;

-- ── fixtures (as postgres) ───────────────────────────────────────────

INSERT INTO t_se_ctx (k, v) VALUES
  ('f', (now() AT TIME ZONE 'America/Caracas')::date::text),
  ('ahora', date_trunc('minute', now() AT TIME ZONE 'America/Caracas')::time::text);

INSERT INTO public.campus (id, nombre, codigo) VALUES
  (pg_temp.id('ca', 1), 'ZZ Se Campus 1', 'ZZSE1'),
  (pg_temp.id('ca', 2), 'ZZ Se Campus 2', 'ZZSE2');

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'se-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 9) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Se', 'U' || n, 'se-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 9) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero, fecha_nacimiento)
SELECT pg_temp.id('us', n), 'ZZ Se Niño', 'N' || n, 'No especificado', 'Otro',
       (pg_temp.f() - CASE WHEN n = 22 THEN interval '48 months 3 days' WHEN n = 24 THEN interval '80 months'
                           ELSE interval '12 months 3 days' END)::date
  FROM generate_series(21, 32) AS n;

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'ninos', NULL, 'ZZ Se R', true),
  (pg_temp.id('eq', 2), 'ninos', pg_temp.id('eq', 1), 'ZZ Se W', true),
  (pg_temp.id('eq', 3), 'ninos', pg_temp.id('eq', 2), 'Anfitriones', true),
  (pg_temp.id('eq', 4), 'ninos', pg_temp.id('eq', 2), 'Líderes', true),
  (pg_temp.id('eq', 5), 'ninos', pg_temp.id('eq', 2), 'Maternal', true),
  (pg_temp.id('eq', 6), 'ninos', pg_temp.id('eq', 1), 'ZZ Se U', true),
  (pg_temp.id('eq', 7), 'ninos', NULL, 'ZZ Se R2', true),
  (pg_temp.id('eq', 8), 'ninos', pg_temp.id('eq', 7), 'ZZ Se W2', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 3), 'Anfitrión', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 4), 'Líder', true),
  (pg_temp.id('ro', 3), pg_temp.id('eq', 5), 'Voluntario', true);

INSERT INTO public.ninos_salones (id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses,
                                  grado_min, grado_max, es_necesidades_especiales, orden, activo) VALUES
  (pg_temp.id('sa', 1), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Se Sala A', 18, 0, 35, NULL, NULL, false, 1, true),
  (pg_temp.id('sa', 2), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Se Sala B', 20, 36, 59, NULL, NULL, false, 2, true),
  (pg_temp.id('sa', 3), pg_temp.id('ca', 1), pg_temp.id('eq', 6), 'upstreet', 'ZZ Se Grado 1', 20, NULL, NULL, 1, 1, false, 3, true),
  (pg_temp.id('sa', 5), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Se Sala Cerrada', 20, 0, 35, NULL, NULL, false, 0, false),
  (pg_temp.id('sa', 6), pg_temp.id('ca', 1), pg_temp.id('eq', 2), 'waumba', 'ZZ Se Plus', 10, NULL, NULL, NULL, NULL, true, 5, true),
  (pg_temp.id('sa', 4), pg_temp.id('ca', 2), pg_temp.id('eq', 8), 'waumba', 'ZZ Se S4', 20, 0, 35, NULL, NULL, false, 1, true);

INSERT INTO public.dream_team_turnos (id, campus_id, nombre, dia_semana, hora, orden, activo, tipo) VALUES
  (pg_temp.id('tu', 1), pg_temp.id('ca', 1), 'ZZ Se T1', extract(dow FROM pg_temp.f())::smallint, pg_temp.ctx('ahora')::time, 901, true, 'semanal'),
  (pg_temp.id('tu', 2), pg_temp.id('ca', 1), 'ZZ Se T2', extract(dow FROM pg_temp.f())::smallint,
   pg_temp.ctx('ahora')::time + interval '30 minutes', 902, true, 'semanal'),
  (pg_temp.id('tu', 3), pg_temp.id('ca', 2), 'ZZ Se T3', extract(dow FROM pg_temp.f())::smallint, pg_temp.ctx('ahora')::time, 903, true, 'semanal');

INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT pg_temp.id('us', n), pg_temp.id('ca', 1), true FROM unnest(ARRAY[3, 5, 6, 7, 9]) AS n;

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', n), pg_temp.id('us', n), pg_temp.id('eq', CASE n WHEN 5 THEN 3 WHEN 3 THEN 4 ELSE 5 END),
       pg_temp.id('ro', CASE n WHEN 5 THEN 1 WHEN 3 THEN 2 ELSE 3 END), 'activo'::public.dream_team_estado,
       timestamptz '2020-01-01 12:00+00', 'admin_asignacion'
  FROM unnest(ARRAY[3, 5, 6, 7]) AS n;
INSERT INTO public.dream_team_servicio_turnos (servicio_id, turno_id, frecuencia, fecha_ancla)
SELECT pg_temp.id('se', n), pg_temp.id('tu', 1), 'semanal', NULL FROM unnest(ARRAY[3, 5, 6, 7]) AS n;
INSERT INTO public.ninos_voluntario_salon (servicio_id, salon_id) VALUES
  (pg_temp.id('se', 6), pg_temp.id('sa', 1)),
  (pg_temp.id('se', 7), pg_temp.id('sa', 2));

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 9) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id) VALUES
  (pg_temp.id('us', 1), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 2)::text),
  (pg_temp.id('us', 4), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 6)::text);

INSERT INTO public.ninos_fichas (usuario_id, grado, necesidades_especiales, alergias, cambio_panal, salon_preferido_id)
SELECT pg_temp.id('us', n), CASE WHEN n = 24 THEN 1 END, CASE WHEN n = 25 THEN 'ZZ TEA' END,
       CASE WHEN n = 21 THEN 'ZZ Maní' END, n = 21, CASE WHEN n = 23 THEN pg_temp.id('sa', 2) END
  FROM generate_series(21, 32) AS n;

INSERT INTO public.ninos_prechecks (nino_id, turno_id, fecha, solicitado_por, estado, created_at, updated_at)
SELECT pg_temp.id('us', n), pg_temp.id('tu', CASE WHEN n = 28 THEN 2 ELSE 1 END), pg_temp.f(), pg_temp.id('us', 9),
       CASE WHEN n = 26 THEN 'cancelado' ELSE 'pendiente' END, now() - interval '10 minutes', now() - interval '10 minutes'
  FROM unnest(ARRAY[21, 22, 23, 24, 25, 26, 27, 28]) AS n;

-- 27 inside S1 (its own visit); 30 out at 9:08 with Ana; 31 and 32 one visit, code 4321.
INSERT INTO public.ninos_checkins (id, nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_at,
                                   salida_at, retirado_por_nombre) VALUES
  (pg_temp.id('ci', 27), pg_temp.id('us', 27), pg_temp.id('sa', 1), pg_temp.id('tu', 1), pg_temp.id('ca', 1), pg_temp.f(),
   pg_temp.id('vi', 1), '1111', now() - interval '20 minutes', NULL, NULL),
  (pg_temp.id('ci', 30), pg_temp.id('us', 30), pg_temp.id('sa', 1), pg_temp.id('tu', 1), pg_temp.id('ca', 1), pg_temp.f(),
   pg_temp.id('vi', 2), '2222', now() - interval '40 minutes', (pg_temp.f() + time '09:08') AT TIME ZONE 'America/Caracas', 'ZZ Ana Ramírez'),
  (pg_temp.id('ci', 31), pg_temp.id('us', 31), pg_temp.id('sa', 1), pg_temp.id('tu', 1), pg_temp.id('ca', 1), pg_temp.f(),
   pg_temp.id('vi', 3), '4321', now() - interval '30 minutes', NULL, NULL),
  (pg_temp.id('ci', 32), pg_temp.id('us', 32), pg_temp.id('sa', 1), pg_temp.id('tu', 1), pg_temp.id('ca', 1), pg_temp.f(),
   pg_temp.id('vi', 3), '4321', now() - interval '30 minutes', NULL, NULL);

GRANT INSERT, SELECT, UPDATE ON t_se_failures, t_se_ctx TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_eq(text, text, text),
  pg_temp.assert_raises(text, text, text, text, text), pg_temp.assert_denied(text, text), pg_temp.run(text, text),
  pg_temp.as_persona(int), pg_temp.id(text, int), pg_temp.ctx(text), pg_temp.f(),
  pg_temp.estado(int, int, date, boolean), pg_temp.nombres(int, text, int, date), pg_temp.mover(int, int, text),
  pg_temp.llego(int, int, int, date), pg_temp.aqui(int), pg_temp.q(text)
  TO authenticated, anon;

-- ── a. grants ────────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('a: PUBLIC / anon / authenticated execute (3 RPCs, 1 internal helper)',
  $q$SELECT string_agg(has_function_privilege('public', f, 'EXECUTE')::text || '/'
                       || has_function_privilege('anon', f, 'EXECUTE')::text || '/'
                       || has_function_privilege('authenticated', f, 'EXECUTE')::text, ',' ORDER BY f)
       FROM unnest(ARRAY['public.ninos_checkin_desde_salon(uuid, uuid, uuid, date)',
                         'public.ninos_mover_salon(uuid, uuid, date, uuid, text)',
                         'public.ninos_salon_esperado(uuid, uuid, date)',
                         'public.ninos_salon_estado(uuid, uuid, date)']) f$q$,
  'false/false/true,false/false/true,false/false/false,false/false/true');
SELECT pg_temp.assert_eq('a: SECURITY DEFINER, search_path empty; read STABLE, writes VOLATILE',
  $q$SELECT string_agg(p.proname || ':' || p.prosecdef::text || ':' || array_to_string(p.proconfig, ',') || ':' || p.provolatile::text,
                       ',' ORDER BY p.proname)
       FROM pg_proc p
      WHERE p.oid IN ('public.ninos_checkin_desde_salon(uuid, uuid, uuid, date)'::regprocedure,
                      'public.ninos_mover_salon(uuid, uuid, date, uuid, text)'::regprocedure,
                      'public.ninos_salon_esperado(uuid, uuid, date)'::regprocedure,
                      'public.ninos_salon_estado(uuid, uuid, date)'::regprocedure)$q$,
  'ninos_checkin_desde_salon:true:search_path="":v,'
  || 'ninos_mover_salon:true:search_path="":v,ninos_salon_esperado:true:search_path="":s,ninos_salon_estado:true:search_path="":s');
SELECT pg_temp.assert_eq('a: the assigned-volunteer helper is gone (L32)',
  $q$SELECT count(*)::text FROM pg_proc WHERE proname = 'ninos_es_voluntario_del_salon'$q$, '0');
SELECT pg_temp.assert_eq('a: the audit table: RLS on, no privilege for anon / authenticated',
  $q$SELECT c.relrowsecurity::text || '/'
            || has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')::text || '/'
            || has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')::text
       FROM pg_class c WHERE c.oid = 'public.ninos_checkin_movimientos'::regclass$q$,
  'true/false/false');
SELECT pg_temp.assert_eq('a: salon_id and entrada_desde_salon: authenticated reads, never updates',
  $q$SELECT has_column_privilege('authenticated', 'public.ninos_checkins', 'salon_id', 'UPDATE')::text || '/'
            || has_column_privilege('authenticated', 'public.ninos_checkins', 'entrada_desde_salon', 'UPDATE')::text || '/'
            || has_column_privilege('authenticated', 'public.ninos_checkins', 'entrada_desde_salon', 'SELECT')::text$q$,
  'false/false/true');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
SELECT pg_temp.assert_denied('a: anon cannot call ninos_salon_estado', pg_temp.estado(1));
SELECT pg_temp.assert_denied('a: anon cannot call ninos_mover_salon', pg_temp.mover(31, 2));
SELECT pg_temp.assert_denied('a: anon cannot call ninos_checkin_desde_salon', pg_temp.llego(21, 1));
RESET ROLE;

-- ── b. Aquí is unchanged ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('b: ninos_lista_salon keeps its result type',
  $q$SELECT pg_get_function_result('public.ninos_lista_salon(uuid, date, uuid)'::regprocedure)$q$,
  'TABLE(nino_id uuid, nombre text, apellido text, fecha_nacimiento date, grado integer, codigo text, entrada_at timestamp with time zone, '
  || 'alergias text, necesidades_especiales text, habitos text, puede_comer boolean, cambio_panal boolean, autoriza_imagen boolean)');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('b: Aquí S1 lists the children inside (not the one picked up)', pg_temp.aqui(1), 'N27,N31,N32');

-- ── c. ninos_salon_estado ────────────────────────────────────────────

SELECT pg_temp.assert_eq('c: Esperados S1: the pending pre-check whose salón is S1 by age', pg_temp.nombres(1, 'esperados'), 'N21');
SELECT pg_temp.assert_eq('c: Esperados S2: by age and by preferred salón', pg_temp.nombres(2, 'esperados'), 'N22,N23');
SELECT pg_temp.assert_eq('c: Esperados S6 by special needs', pg_temp.nombres(6, 'esperados'), 'N25');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_eq('c: Esperados S3 by grade (read by the UpStreet coordinator)', pg_temp.nombres(3, 'esperados'), 'N24');
SELECT pg_temp.assert_raises('c: the UpStreet coordinator does not see a Waumba salón', pg_temp.estado(1), '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('c: an esperado carries who sent the notice, when and the alerts',
  format($q$SELECT (x ->> 'nino_id') || '/' || (x -> 'avisado_por' ->> 'apellido') || '/' || (x ->> 'alergias') || '/'
                   || (x ->> 'cambio_panal') || '/' || ((x ->> 'avisado_at')::timestamptz < now())::text
              FROM jsonb_array_elements((%s) -> 'esperados') x$q$, pg_temp.estado(1)),
  pg_temp.id('us', 21)::text || '/U9/ZZ Maní/true/true');
SELECT pg_temp.assert_eq('c: Retirados S1 with hour and who',
  format($q$SELECT (x ->> 'apellido') || '/' || to_char((x ->> 'salida_at')::timestamptz AT TIME ZONE 'America/Caracas', 'HH24:MI')
                   || '/' || (x ->> 'retirado_por_nombre') || '/' || (x ->> 'codigo')
              FROM jsonb_array_elements((%s) -> 'retirados') x$q$, pg_temp.estado(1)),
  'N30/09:08/ZZ Ana Ramírez/2222');
SELECT pg_temp.assert_eq('c: the coordinator operates S1; destinations S2, S6 with occupancy (not U, inactive, other campus)',
  format($q$SELECT (r ->> 'puede_operar') || '/' || (r ->> 'puede_llegar') || '/'
                   || (SELECT string_agg((d ->> 'nombre') || ':' || (d ->> 'ocupados') || ':' || (d ->> 'capacidad'), ',' ORDER BY d ->> 'nombre')
                         FROM jsonb_array_elements(r -> 'destinos') d)
              FROM (SELECT (%s) AS r) x$q$, pg_temp.estado(1)),
  'true/true/ZZ Se Plus:0:10,ZZ Se Sala B:0:20');
SELECT pg_temp.assert_eq('c: a past date has no esperados', pg_temp.nombres(1, 'esperados', 1, pg_temp.f() - 7), '');
SELECT pg_temp.assert_eq('c: another turno of the day does not list T1 pre-checks (28 is T2)', pg_temp.nombres(1, 'esperados', 2), 'N28');
SELECT pg_temp.assert_raises('c: a turno of another campus', pg_temp.estado(1, 3), '22023', 'turno_invalido',
  'El horario no es de este campus.');
SELECT pg_temp.assert_raises('c: a NULL fecha', pg_temp.estado(1, 1, NULL, true), '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('c: an unknown salón', pg_temp.estado(99), '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('c: a Líder of the area reads it, may check in, may not operate',
  format($q$SELECT (r ->> 'puede_operar') || '/' || (r ->> 'puede_llegar') || '/' || jsonb_array_length(r -> 'destinos')
                   || '/' || jsonb_array_length(r -> 'esperados')
              FROM (SELECT (%s) AS r) x$q$, pg_temp.estado(1)),
  'false/true/0/1');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('c: a volunteer only assigned to the salón in the planilla does not read it (L32)',
  pg_temp.estado(1), '42501', 'sin_autoridad', 'No tienes permiso para ver este salón.');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('c: a user without Niños rights is refused', pg_temp.estado(1), '42501', 'sin_autoridad',
  'No tienes permiso para ver este salón.');

-- ── d. ninos_mover_salon ─────────────────────────────────────────────

RESET ROLE;
INSERT INTO t_se_ctx (k, v) VALUES ('antes_mover', pg_temp.escrituras());
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('d: a user without Niños rights', pg_temp.mover(31, 2), '42501', 'sin_autoridad',
  'No tienes permiso para mover niños de este salón.');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('d: a Líder does not move', pg_temp.mover(31, 2), '42501', 'sin_autoridad',
  'No tienes permiso para mover niños de este salón.');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('d: a volunteer assigned to the salón does not move', pg_temp.mover(31, 2), '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('d: the coordinator of the destination only (no authority on origin)', pg_temp.mover(31, 3),
  '42501', 'sin_autoridad', 'No tienes permiso para mover niños de este salón.');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('d: no authority on the destination', pg_temp.mover(31, 3), '42501', 'sin_autoridad',
  'No tienes permiso para pasar niños a ese salón.');
SELECT pg_temp.assert_raises('d: a child already picked up', pg_temp.mover(30, 2), '22023', 'nino_no_adentro',
  'El niño no está adentro en este servicio: ya salió o no ingresó.');
SELECT pg_temp.assert_raises('d: a child who never came in', pg_temp.mover(29, 2), '22023', 'nino_no_adentro');
SELECT pg_temp.assert_raises('d: a salón of another campus', pg_temp.mover(31, 4), '22023', 'salon_otro_campus',
  'El salón de destino es de otro campus.');
SELECT pg_temp.assert_raises('d: an inactive salón', pg_temp.mover(31, 5), '22023', 'salon_invalido',
  'El salón de destino no existe o está desactivado.');
SELECT pg_temp.assert_raises('d: an unknown salón', pg_temp.mover(31, 99), '22023', 'salon_invalido');
SELECT pg_temp.assert_raises('d: the same salón', pg_temp.mover(31, 1), '22023', 'mismo_salon', 'El niño ya está en ese salón.');
SELECT pg_temp.assert_raises('d: a motivo over 300 characters', pg_temp.mover(31, 2, repeat('x', 301)), '22023', 'motivo_largo',
  'El motivo es muy largo (máximo 300 caracteres).');
RESET ROLE;
SELECT pg_temp.assert_eq('d: the refused moves wrote nothing', 'SELECT pg_temp.escrituras()', pg_temp.ctx('antes_mover'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);

SELECT pg_temp.assert_eq('d: the coordinator moves 31 to Sala B: same check-in, code and visit',
  format($q$SELECT (r ->> 'checkin_id') || '/' || (r ->> 'salon_origen_id') || '/' || (r ->> 'salon_destino_id') || '/'
                   || (r ->> 'codigo') || '/' || (r ->> 'ocupacion') || '/' || (r ->> 'capacidad')
              FROM (SELECT (%s) AS r) x$q$, pg_temp.mover(31, 2, '  Llora mucho  ')),
  pg_temp.id('ci', 31)::text || '/' || pg_temp.id('sa', 1)::text || '/' || pg_temp.id('sa', 2)::text || '/4321/1/20');
SELECT pg_temp.assert_eq('d: Aquí follows: out of S1, into S2; its sibling stays', 
  $q$SELECT pg_temp.q(pg_temp.aqui(1)) || ' | ' || pg_temp.q(pg_temp.aqui(2))$q$, 'N27,N32 | N31');
RESET ROLE;
SELECT pg_temp.assert_eq('d: the row keeps id, code, visit, entrada and is still open',
  format($q$SELECT c.codigo || '/' || c.visita_id::text || '/' || (c.salida_at IS NULL)::text || '/' || (c.entrada_desde_salon)::text
              FROM public.ninos_checkins c WHERE c.id = %L::uuid$q$, pg_temp.id('ci', 31)),
  '4321/' || pg_temp.id('vi', 3)::text || '/true/false');
SELECT pg_temp.assert_eq('d: one audit row: check-in, from, to, by, motivo trimmed, when',
  format($q$SELECT count(*)::text || '/' || min(m.salon_origen_id::text) || '/' || min(m.salon_destino_id::text) || '/'
                   || min(m.movido_por::text) || '/' || min(m.motivo) || '/' || (max(m.movido_at) <= now())::text
              FROM public.ninos_checkin_movimientos m WHERE m.checkin_id = %L::uuid$q$, pg_temp.id('ci', 31)),
  '1/' || pg_temp.id('sa', 1)::text || '/' || pg_temp.id('sa', 2)::text || '/' || pg_temp.id('us', 1)::text || '/Llora mucho/true');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('d: the estado of both salones shows the move',
  format($q$SELECT (SELECT string_agg((m ->> 'apellido') || ':' || (m ->> 'desde') || '>' || (m ->> 'hacia'), ',')
                       FROM jsonb_array_elements((%s) -> 'movimientos') m) || ' | '
                   || (SELECT string_agg((m ->> 'apellido') || ':' || (m ->> 'desde') || '>' || (m ->> 'hacia') || ':' || coalesce(m ->> 'motivo', '-'), ',')
                         FROM jsonb_array_elements((%s) -> 'movimientos') m)$q$, pg_temp.estado(1), pg_temp.estado(2)),
  'N31:ZZ Se Sala A>ZZ Se Sala B | N31:ZZ Se Sala A>ZZ Se Sala B:Llora mucho');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('d: the coordinator of U cannot move 31 out of Sala B', pg_temp.mover(31, 3), '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('d: an anfitrión of the area moves 32 to Plus without motivo',
  format($q$SELECT (r ->> 'salon_destino_id') || '/' || (r ->> 'codigo') FROM (SELECT (%s) AS r) x$q$, pg_temp.mover(32, 6)),
  pg_temp.id('sa', 6)::text || '/4321');
RESET ROLE;
SELECT pg_temp.assert_eq('d: two audit rows now, the second without motivo, by the anfitrión',
  format($q$SELECT count(*)::text || '/' || coalesce((SELECT m.motivo FROM public.ninos_checkin_movimientos m WHERE m.checkin_id = %L::uuid), '-')
                   || '/' || (SELECT m.movido_por::text FROM public.ninos_checkin_movimientos m WHERE m.checkin_id = %L::uuid)
              FROM public.ninos_checkin_movimientos m
             WHERE m.checkin_id IN (%L::uuid, %L::uuid)$q$,
         pg_temp.id('ci', 32), pg_temp.id('ci', 32), pg_temp.id('ci', 31), pg_temp.id('ci', 32)),
  '2/-/' || pg_temp.id('us', 5)::text);
SET LOCAL ROLE authenticated;

-- ── e. ninos_checkin_desde_salon ─────────────────────────────────────

RESET ROLE;
DELETE FROM t_se_ctx WHERE k = 'antes_llego';
INSERT INTO t_se_ctx (k, v) VALUES ('antes_llego', pg_temp.escrituras());
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('e: a user without Niños rights', pg_temp.llego(21, 1), '42501', 'sin_autoridad',
  'Solo la coordinación, los líderes y los anfitriones de este salón pueden registrar aquí su llegada.');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('e: a volunteer only assigned to this salón in the planilla (L32)', pg_temp.llego(21, 1),
  '42501', 'sin_autoridad', 'Solo la coordinación, los líderes y los anfitriones de este salón pueden registrar aquí su llegada.');
SELECT pg_temp.as_persona(7);
SELECT pg_temp.assert_raises('e: a volunteer assigned to another salón', pg_temp.llego(21, 1), '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('e: a coordinator who does not see this salón', pg_temp.llego(21, 1), '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('e: a child without pre-check', pg_temp.llego(29, 1), '22023', 'sin_precheck',
  'Este niño no avisó que venía a este servicio. Regístralo en la mesa.');
SELECT pg_temp.assert_raises('e: a pre-check of another turno', pg_temp.llego(28, 1), '22023', 'sin_precheck');
SELECT pg_temp.assert_raises('e: a cancelled pre-check', pg_temp.llego(26, 1), '22023', 'sin_precheck');
SELECT pg_temp.assert_raises('e: expected in another salón', pg_temp.llego(22, 1), '22023', 'otro_salon',
  'Este niño está esperado en otro salón.');
SELECT pg_temp.assert_raises('e: already inside', pg_temp.llego(27, 1), '23505', 'ya_ingresado',
  'El niño ya ingresó en este servicio.');
SELECT pg_temp.assert_raises('e: a past date', pg_temp.llego(21, 1, 1, pg_temp.f() - 7), '22023', 'fuera_de_horario',
  'El check-in de este horario no está abierto ahora.');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('e: a turno of another campus', pg_temp.llego(21, 1, 3), '22023', 'turno_invalido');
SELECT pg_temp.assert_raises('e: an inactive salón', pg_temp.llego(21, 5), '22023', 'salon_invalido');
RESET ROLE;
SELECT pg_temp.assert_eq('e: the refused check-ins wrote nothing', 'SELECT pg_temp.escrituras()', pg_temp.ctx('antes_llego'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);

SELECT pg_temp.run('e: a Líder of the area (sees, does not operate) registers 21', format(
  $q$INSERT INTO t_se_ctx (k, v) SELECT 'llego21', (%s)::text$q$, pg_temp.llego(21, 1)));
SELECT pg_temp.assert_eq('e: it answers the child, salón and a 4-digit code',
  $q$SELECT (r ->> 'nino_id') || '/' || (r ->> 'salon_id') || '/' || ((r ->> 'codigo') ~ '^[0-9]{4}$')::text
       FROM (SELECT pg_temp.ctx('llego21')::jsonb AS r) x$q$,
  pg_temp.id('us', 21)::text || '/' || pg_temp.id('sa', 1)::text || '/true');
SELECT pg_temp.assert_eq('e: 21 is now in Aquí, out of Esperados',
  $q$SELECT pg_temp.q(pg_temp.aqui(1)) || ' | ' || pg_temp.q(pg_temp.nombres(1, 'esperados'))$q$, 'N21,N27 | ');
RESET ROLE;
SELECT pg_temp.assert_eq('e: the check-in is marked as from the salón, by the Líder, with a new visit and a free code',
  format($q$SELECT c.entrada_desde_salon::text || '/' || c.entrada_por::text || '/' || c.campus_id::text || '/'
                   || (c.codigo = (pg_temp.ctx('llego21')::jsonb ->> 'codigo'))::text || '/'
                   || (c.visita_id = (pg_temp.ctx('llego21')::jsonb ->> 'visita_id')::uuid)::text || '/'
                   || (SELECT count(*) FROM public.ninos_checkins o
                        WHERE o.turno_id = c.turno_id AND o.fecha = c.fecha AND o.campus_id = c.campus_id
                          AND o.codigo = c.codigo AND o.salida_at IS NULL)::text
              FROM public.ninos_checkins c WHERE c.nino_id = %L::uuid$q$, pg_temp.id('us', 21)),
  'true/' || pg_temp.id('us', 3)::text || '/' || pg_temp.id('ca', 1)::text || '/true/true/1');
SELECT pg_temp.assert_eq('e: the pre-check reads ingresado (what the parent''s phone shows)',
  format($q$SELECT p.estado FROM public.ninos_prechecks p WHERE p.nino_id = %L::uuid AND p.turno_id = %L::uuid$q$,
         pg_temp.id('us', 21), pg_temp.id('tu', 1)),
  'ingresado');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('e: a second «Llegó» for 21', pg_temp.llego(21, 1), '23505', 'ya_ingresado');
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('e: an anfitrión registers 23 in its preferred salón',
  format($q$SELECT (r ->> 'salon_id') FROM (SELECT (%s) AS r) x$q$, pg_temp.llego(23, 2)), pg_temp.id('sa', 2)::text);
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('e: the Líder registers 22 in Sala B too (any salón of the area)',
  format($q$SELECT (r ->> 'salon_id') FROM (SELECT (%s) AS r) x$q$, pg_temp.llego(22, 2)), pg_temp.id('sa', 2)::text);
RESET ROLE;
SELECT pg_temp.assert_eq('e: from the salón: 21, 22, 23; the desk ones are not marked',
  $q$SELECT string_agg(u.apellido || ':' || c.entrada_desde_salon::text, ',' ORDER BY u.apellido)
       FROM public.ninos_checkins c JOIN public.usuarios u ON u.id = c.nino_id
      WHERE c.nino_id::text LIKE '5a1e0000%'$q$,
  'N21:true,N22:true,N23:true,N27:false,N30:false,N31:false,N32:false');

SELECT coalesce(string_agg(case_name, ' ## '), 'ALL OK') AS result FROM t_se_failures;

ROLLBACK;
