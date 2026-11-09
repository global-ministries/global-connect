-- S9 (odd/tasks/dps-asistencia-pco.md, L44; T11b) — DPS special events of
-- one or several days, moving a plan to another date and deleting one
-- (20261108206000_dps_eventos_especiales.sql). Needs the earlier DPS
-- migrations; the fixture is its own (runs alone).
--
-- Covers:
--   a. Structure and privileges: dps_planes.evento_id (uuid, nullable, no
--      default) with its index; dps_evento_crear, dps_plan_mover and
--      dps_plan_eliminar are SECURITY DEFINER with search_path '', executable
--      by authenticated, not by anon nor PUBLIC; anon cannot call them.
--   b. dps_evento_crear: a one-day event (p_hasta NULL or = p_desde) and a
--      three-day one (one plan per day, same evento_id, título and tipo,
--      horarios and llegada from dps_config); the plan JSON carries
--      `evento` {id, dia, dias} («Día N de M») and `con_asistencia`, also in
--      dps_planes_rango; a plan made by dps_plan_crear has evento null; Cena
--      del Señor and Noche de adoración are accepted; 14 days is the limit;
--      tipo domingo / libre / unknown, a blank or long título, a NULL date,
--      an inverted or longer range are refused; a day that clashes with
--      another plan of the same date, tipo and título refuses the whole
--      event ('plan_duplicado', DETAIL the date) and creates nothing.
--   c. dps_plan_mover: a future event day moves with its convocados and
--      campos; moving one day of a three-day event moves only that day and
--      the numbering follows the dates; the same date is a no-op; a plan
--      of today without attendance moves; once moved into the future the
--      automatic directors sync there as on any plan. Refused, leaving the
--      date as it was: a regular Sunday ('plan_domingo'), a plan dated
--      before today ('plan_pasado'), a new date before today
--      ('fecha_pasada'), a plan with attendance ('plan_con_asistencia'), a
--      clash ('plan_duplicado'), an unknown plan ('plan_invalido') and a
--      NULL date ('fecha_invalida').
--   d. dps_plan_eliminar: one day (its convocados go with it), one day of a
--      three-day event (the rest renumber), the whole event, a Cena del
--      Señor made by dps_plan_crear; refused for a regular Sunday, a plan
--      with attendance (the plan and the attendance stay), a whole event
--      where one day has attendance (nothing deleted) and an unknown plan.
--   e. Authority: a plain DPS servidor and a caller without a session get
--      42501 'sin_autoridad' from the three.
--
-- Run against STAGING inside a transaction that is discarded (the runner
-- provides it: this file has no BEGIN/COMMIT). The last statement raises
-- 'SUITE_RESULT: ALL OK' (or the failing cases), which also rolls everything
-- back. Reads that need a session set request.jwt.claim.sub to the fixture
-- auth id; the anon case runs under SET LOCAL ROLE anon.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Ev"):
--   1 PLAN    dream_team.direct on the DPS root (plans)
--   2 VOL     Voluntario servicio in ZZ Ev Alfa (a plain servidor)
--   3 DIR     Director servicio in ZZ Ev Alfa (automatic director)
--   4 RANDOM  nothing
-- Equipo: ZZ Ev Alfa, a direct child of the real DPS root, with the puesto
-- «ZZ Ev Puesto». Dates are relative to ninos_hoy() (H): the events live
-- around H + 200, far from real plans.

SET LOCAL search_path TO pg_temp, public;
-- The helpers name new functions: without this the RED run would abort early.
SET LOCAL check_function_bodies = off;

CREATE TEMP TABLE t_de_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_de_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_de_failures(case_name) VALUES (p_case || ': ' || p_detail);
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

-- The error's DETAIL (NULL when none or no error).
CREATE OR REPLACE FUNCTION pg_temp.detalle(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_detalle text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detalle = PG_EXCEPTION_DETAIL;
    RETURN SQLERRM || '|' || coalesce(nullif(v_detalle, ''), '-');
END;
$$;

-- Runs p_sql, keeps its single value under p_k (a failure is recorded).
CREATE OR REPLACE FUNCTION pg_temp.put(p_k text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO t_de_ctx (k, v) VALUES (p_k, v) ON CONFLICT (k) DO UPDATE SET v = excluded.v;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('put ' || p_k, 'error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT v FROM t_de_ctx WHERE k = p_k;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('d9a00000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'd9a1' WHEN 'us' THEN 'd9a2' WHEN 'eq' THEN 'd9a3'
                       WHEN 'ro' THEN 'd9a4' WHEN 'se' THEN 'd9a5' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.nobody() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', '', true);
$$;

-- H + n.
CREATE OR REPLACE FUNCTION pg_temp.h(p_n int) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx('hoy')::date + p_n;
$$;

CREATE OR REPLACE FUNCTION pg_temp.plan(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT pg_temp.ctx(p_k)::uuid;
$$;

-- The i-th plan id (0-based) of an event kept by put as dps_evento_crear's JSON.
CREATE OR REPLACE FUNCTION pg_temp.dia(p_k text, p_i int) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (pg_temp.ctx(p_k)::jsonb -> 'planes' -> p_i ->> 'id')::uuid;
$$;

-- A plan's date as an offset from H, '-' when it is gone.
CREATE OR REPLACE FUNCTION pg_temp.off(p_plan uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT (p.fecha - pg_temp.ctx('hoy')::date)::text FROM public.dps_planes p WHERE p.id = p_plan), '-');
$$;

-- The fixture plans of dps_planes_rango(H + a, H + b) whose título starts
-- with p_titulo, as 'offset:dia/dias' (offset:- without an evento).
CREATE OR REPLACE FUNCTION pg_temp.rango(p_a int, p_b int, p_titulo text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT coalesce(string_agg(((p ->> 'fecha')::date - pg_temp.ctx('hoy')::date) || ':'
                                     || coalesce((p -> 'evento' ->> 'dia') || '/' || (p -> 'evento' ->> 'dias'), '-'),
                                     ',' ORDER BY o), '')
            FROM jsonb_array_elements(public.dps_planes_rango(pg_temp.h(p_a), pg_temp.h(p_b))) WITH ORDINALITY AS x(p, o)
           WHERE p ->> 'titulo' LIKE p_titulo || '%');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.planes_zz() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT count(*)::text FROM public.dps_planes p WHERE p.titulo LIKE 'ZZ Ev %';
$$;

-- ── fixture (as postgres) ────────────────────────────────────────────

INSERT INTO t_de_ctx (k, v)
SELECT 'raiz', d.id::text
  FROM public.dream_team_equipos d
  JOIN public.dream_team_equipos x ON x.id = d.parent_equipo_id
 WHERE d.label = 'DPS' AND d.experiencia = 'dps' AND d.activo
   AND x.label = 'Dirección de Experiencia' AND x.parent_equipo_id IS NULL
 ORDER BY d.created_at, d.id
 LIMIT 1;
INSERT INTO t_de_ctx (k, v) VALUES ('hoy', public.ninos_hoy()::text);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'de-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ev', 'U' || n, 'de-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 4) AS n;
-- Staging validates a servicio against the person's principal campus.
INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
SELECT u.id, (SELECT c.id FROM public.campus c ORDER BY c.id LIMIT 1), true
  FROM public.usuarios u
 WHERE u.id::text LIKE 'd9a00000-%'
   AND NOT EXISTS (SELECT 1 FROM public.usuario_campus x WHERE x.usuario_id = u.id AND x.es_campus_principal);

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps', pg_temp.ctx('raiz')::uuid, 'ZZ Ev Alfa', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 1), pg_temp.id('eq', 1), 'Voluntario', 'voluntario', true),
  (pg_temp.id('ro', 2), pg_temp.id('eq', 1), 'Director',   'director',   true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', x.n), pg_temp.id('us', x.n), pg_temp.id('eq', 1), pg_temp.id('ro', x.ro), 'activo',
       now() - interval '30 days', 'admin_asignacion'
  FROM (VALUES (2, 1), (3, 2)) AS x(n, ro);

DELETE FROM public.dream_team_capability_grants
 WHERE persona_id IN (SELECT pg_temp.id('us', n) FROM generate_series(1, 4) n);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT pg_temp.id('us', x.n), x.cap, 'dream_team', 'equipo', x.scope, 'zz-test'
  FROM (VALUES (1, 'dream_team.direct', pg_temp.ctx('raiz')),
               (2, 'dream_team.serve', pg_temp.id('eq', 1)::text)) AS x(n, cap, scope);

GRANT INSERT, SELECT, UPDATE ON t_de_failures, t_de_ctx TO authenticated, anon;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, anon', v_f);
  END LOOP;
END;
$$;

-- ── a. structure and privileges ──────────────────────────────────────

SELECT pg_temp.assert_eq('a1: dps_planes.evento_id is a nullable uuid without default',
  $q$SELECT format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-')
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.dps_planes'::regclass AND a.attname = 'evento_id' AND NOT a.attisdropped$q$,
  'uuid:false:-');
SELECT pg_temp.assert_eq('a2: evento_id is indexed',
  $q$SELECT count(*)::text FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = 'public.dps_planes'::regclass AND a.attname = 'evento_id'$q$, '1');
SELECT pg_temp.assert_eq('a3: the three RPCs are SECURITY DEFINER with an empty search_path',
  $q$SELECT count(*) || '|' || count(*) FILTER (WHERE NOT (p.prosecdef AND coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('dps_evento_crear', 'dps_plan_mover', 'dps_plan_eliminar')$q$, '3|0');
SELECT pg_temp.assert_eq('a4: authenticated executes them; anon and PUBLIC do not',
  $q$SELECT string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'EXECUTE') || ':'
                       || has_function_privilege('anon', p.oid, 'EXECUTE') || ':'
                       || coalesce((SELECT bool_or(x.grantee = 0) FROM aclexplode(p.proacl) x WHERE x.privilege_type = 'EXECUTE'), false),
                       ',' ORDER BY p.proname COLLATE "C")
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('dps_evento_crear', 'dps_plan_mover', 'dps_plan_eliminar')$q$,
  'dps_evento_crear:true:false:false,dps_plan_eliminar:true:false:false,dps_plan_mover:true:false:false');
SELECT pg_temp.assert_eq('a5: the plan JSON stays internal',
  $q$SELECT (has_function_privilege('authenticated', 'public.dps_plan_json(uuid)', 'EXECUTE')
             OR has_function_privilege('anon', 'public.dps_plan_json(uuid)', 'EXECUTE'))::text$q$, 'false');

SET LOCAL ROLE anon;
SELECT pg_temp.assert_raises('a6: anon cannot call dps_evento_crear',
  $q$SELECT public.dps_evento_crear('especial', 'ZZ Ev Anon', pg_temp.h(200), NULL)$q$, '42501');
SELECT pg_temp.assert_raises('a6: anon cannot call dps_plan_mover',
  $q$SELECT public.dps_plan_mover(gen_random_uuid(), pg_temp.h(200))$q$, '42501');
SELECT pg_temp.assert_raises('a6: anon cannot call dps_plan_eliminar',
  $q$SELECT public.dps_plan_eliminar(gen_random_uuid(), false)$q$, '42501');
RESET ROLE;

-- ── b. dps_evento_crear ──────────────────────────────────────────────

SELECT pg_temp.as_persona(1);
SELECT pg_temp.put('ev1', $q$SELECT public.dps_evento_crear('especial', '  ZZ Ev Bautizos  ', pg_temp.h(200), NULL)::text$q$);
SELECT pg_temp.assert_eq('b1: a one-day event: one plan with its tipo, trimmed título, horarios and llegada of dps_config',
  $q$SELECT jsonb_array_length(pg_temp.ctx('ev1')::jsonb -> 'planes') || '|' || p.tipo || '|' || p.titulo || '|'
            || pg_temp.off(p.id) || '|' || (p.horarios = c.horarios) || '|' || (p.llegada = c.llegada) || '|'
            || (p.evento_id::text = pg_temp.ctx('ev1')::jsonb ->> 'evento_id')
       FROM public.dps_planes p, public.dps_config c
      WHERE c.id AND p.id = pg_temp.dia('ev1', 0)$q$,
  '1|especial|ZZ Ev Bautizos|200|true|true|true');
SELECT pg_temp.assert_eq('b2: its JSON carries evento {id, dia 1, dias 1} and con_asistencia false',
  $q$SELECT (p -> 'evento' ->> 'id' = pg_temp.ctx('ev1')::jsonb ->> 'evento_id') || '|' || (p -> 'evento' ->> 'dia') || '/'
            || (p -> 'evento' ->> 'dias') || '|' || (p ->> 'con_asistencia')
       FROM (SELECT pg_temp.ctx('ev1')::jsonb -> 'planes' -> 0 AS p) x$q$, 'true|1/1|false');

SELECT pg_temp.put('ev3', $q$SELECT public.dps_evento_crear('especial', 'ZZ Ev Conferencia', pg_temp.h(202), pg_temp.h(204))::text$q$);
SELECT pg_temp.assert_eq('b3: a three-day event: one plan per day, same evento_id, título and tipo',
  $q$SELECT count(*) || '|' || count(DISTINCT p.evento_id) || '|' || string_agg(DISTINCT p.titulo, ',') || '|'
            || string_agg(DISTINCT p.tipo, ',') || '|' || string_agg(pg_temp.off(p.id), ',' ORDER BY p.fecha)
       FROM public.dps_planes p WHERE p.evento_id = (pg_temp.ctx('ev3')::jsonb ->> 'evento_id')::uuid$q$,
  '3|1|ZZ Ev Conferencia|especial|202,203,204');
SELECT pg_temp.assert_eq('b4: the returned plans come by date, each «Día N de 3»',
  $q$SELECT string_agg(((p ->> 'fecha')::date - pg_temp.ctx('hoy')::date) || ':' || (p -> 'evento' ->> 'dia') || '/' || (p -> 'evento' ->> 'dias'), ',' ORDER BY o)
       FROM jsonb_array_elements(pg_temp.ctx('ev3')::jsonb -> 'planes') WITH ORDINALITY AS x(p, o)$q$,
  '202:1/3,203:2/3,204:3/3');
SELECT pg_temp.assert_eq('b5: dps_planes_rango gives the same grouping',
  $q$SELECT pg_temp.rango(195, 210, 'ZZ Ev ')$q$, '200:1/1,202:1/3,203:2/3,204:3/3');
SELECT pg_temp.put('suelto', $q$SELECT public.dps_plan_crear(pg_temp.h(206), 'especial', 'ZZ Ev Suelto')::text$q$);
SELECT pg_temp.assert_eq('b6: a plan made by dps_plan_crear has no evento',
  $q$SELECT pg_temp.rango(206, 206, 'ZZ Ev ') || '|' || jsonb_typeof(public.dps_plan_json(pg_temp.plan('suelto')) -> 'evento')$q$,
  '206:-|null');
SELECT pg_temp.assert_eq('b7: Cena del Señor and Noche de adoración, the same day as p_hasta',
  $q$SELECT jsonb_array_length(public.dps_evento_crear('cena_del_senor', 'ZZ Ev Cena', pg_temp.h(208), pg_temp.h(208)) -> 'planes')
            || '|' || jsonb_array_length(public.dps_evento_crear('noche_adoracion', 'ZZ Ev Noche', pg_temp.h(208), NULL) -> 'planes')$q$,
  '1|1');
SELECT pg_temp.assert_eq('b8: 14 days is the limit',
  $q$SELECT jsonb_array_length(public.dps_evento_crear('especial', 'ZZ Ev Campamento', pg_temp.h(220), pg_temp.h(233)) -> 'planes')::text$q$,
  '14');
SELECT pg_temp.put('n_antes', $q$SELECT pg_temp.planes_zz()$q$);
SELECT pg_temp.assert_raises('b9: tipo domingo', $q$SELECT public.dps_evento_crear('domingo', 'ZZ Ev X', pg_temp.h(240), NULL)$q$, '22023', 'tipo_invalido');
SELECT pg_temp.assert_raises('b9: tipo libre', $q$SELECT public.dps_evento_crear('libre', 'ZZ Ev X', pg_temp.h(240), NULL)$q$, '22023', 'tipo_invalido');
SELECT pg_temp.assert_raises('b9: unknown tipo', $q$SELECT public.dps_evento_crear('retiro', 'ZZ Ev X', pg_temp.h(240), NULL)$q$, '22023', 'tipo_invalido');
SELECT pg_temp.assert_raises('b9: NULL tipo', $q$SELECT public.dps_evento_crear(NULL, 'ZZ Ev X', pg_temp.h(240), NULL)$q$, '22023', 'tipo_invalido');
SELECT pg_temp.assert_raises('b10: blank título', $q$SELECT public.dps_evento_crear('especial', '   ', pg_temp.h(240), NULL)$q$, '22023', 'titulo_invalido');
SELECT pg_temp.assert_raises('b10: NULL título', $q$SELECT public.dps_evento_crear('especial', NULL, pg_temp.h(240), NULL)$q$, '22023', 'titulo_invalido');
SELECT pg_temp.assert_raises('b10: título over 120', $q$SELECT public.dps_evento_crear('especial', repeat('x', 121), pg_temp.h(240), NULL)$q$, '22023', 'titulo_invalido');
SELECT pg_temp.assert_raises('b11: NULL date', $q$SELECT public.dps_evento_crear('especial', 'ZZ Ev X', NULL, NULL)$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_raises('b12: an inverted range', $q$SELECT public.dps_evento_crear('especial', 'ZZ Ev X', pg_temp.h(240), pg_temp.h(239))$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_raises('b12: 15 days', $q$SELECT public.dps_evento_crear('especial', 'ZZ Ev X', pg_temp.h(240), pg_temp.h(254))$q$, '22023', 'rango_invalido');
SELECT pg_temp.assert_eq('b13: a day that clashes refuses the whole event and names the date',
  $q$SELECT pg_temp.detalle($s$SELECT public.dps_evento_crear('especial', 'zz ev conferencia', pg_temp.h(201), pg_temp.h(203))$s$)$q$,
  'plan_duplicado|' || (public.ninos_hoy() + 202)::text);
SELECT pg_temp.assert_eq('b14: the refused calls created nothing',
  $q$SELECT (pg_temp.planes_zz() = pg_temp.ctx('n_antes'))::text || '|' || pg_temp.rango(201, 201, 'ZZ Ev ')$q$, 'true|');

-- ── c. dps_plan_mover ────────────────────────────────────────────────

SELECT pg_temp.put('puesto', $q$SELECT public.dps_puesto_guardar(NULL, pg_temp.id('eq', 1), 'ZZ Ev Puesto', 1, NULL)::text$q$);
SELECT pg_temp.put('cv1', $q$SELECT public.dps_convocar(pg_temp.dia('ev1', 0), pg_temp.ctx('puesto')::uuid, pg_temp.id('se', 2))::text$q$);
SELECT pg_temp.put('campo', $q$SELECT (public.dps_plan_campo(pg_temp.dia('ev1', 0), 'notas', to_jsonb('Llevar toallas'::text)) IS NOT NULL)::text$q$);
SELECT pg_temp.assert_eq('c1: a future day moves; the RPC returns the plan on its new date',
  $q$SELECT ((public.dps_plan_mover(pg_temp.dia('ev1', 0), pg_temp.h(210)) ->> 'fecha')::date - pg_temp.ctx('hoy')::date)::text$q$, '210');
SELECT pg_temp.assert_eq('c2: its convocados and campos went with it',
  $q$SELECT pg_temp.off(pg_temp.dia('ev1', 0)) || '|'
            || (SELECT string_agg(c.id::text, ',') FROM public.dps_convocados c
                 WHERE c.plan_id = pg_temp.dia('ev1', 0) AND NOT c.automatico) || '|'
            || (SELECT p.campos ->> 'notas' FROM public.dps_planes p WHERE p.id = pg_temp.dia('ev1', 0))$q$,
  '210|' || pg_temp.ctx('cv1') || '|Llevar toallas');
-- An UPDATE gives the row a new ctid.
SELECT pg_temp.put('ctid_ev1', $q$SELECT p.ctid::text FROM public.dps_planes p WHERE p.id = pg_temp.dia('ev1', 0)$q$);
SELECT pg_temp.assert_eq('c3: the same date returns the plan',
  $q$SELECT ((public.dps_plan_mover(pg_temp.dia('ev1', 0), pg_temp.h(210)) ->> 'fecha')::date - pg_temp.ctx('hoy')::date)::text$q$, '210');
SELECT pg_temp.assert_eq('c3b: and writes nothing',
  $q$SELECT (p.ctid::text = pg_temp.ctx('ctid_ev1'))::text FROM public.dps_planes p WHERE p.id = pg_temp.dia('ev1', 0)$q$, 'true');
SELECT pg_temp.assert_eq('c4: moving day 1 of 3 after day 3',
  $q$SELECT (public.dps_plan_mover(pg_temp.dia('ev3', 0), pg_temp.h(205)) IS NOT NULL)::text$q$, 'true');
-- Separate statements: a write shows only to the next one.
SELECT pg_temp.assert_eq('c4b: moves only that day',
  $q$SELECT pg_temp.off(pg_temp.dia('ev3', 0)) || ',' || pg_temp.off(pg_temp.dia('ev3', 1)) || ',' || pg_temp.off(pg_temp.dia('ev3', 2))$q$,
  '205,203,204');
SELECT pg_temp.assert_eq('c5: the numbering follows the dates',
  $q$SELECT pg_temp.rango(202, 205, 'ZZ Ev Conferencia')$q$, '203:1/3,204:2/3,205:3/3');

SELECT pg_temp.put('domingo', $q$SELECT public.dps_plan_crear(pg_temp.ctx('hoy')::date + 200 + ((7 - extract(dow FROM pg_temp.h(200))::int) % 7), 'domingo', NULL)::text$q$);
SELECT pg_temp.put('ayer', $q$SELECT public.dps_plan_crear(pg_temp.h(-1), 'especial', 'ZZ Ev Ayer')::text$q$);
SELECT pg_temp.put('ev_hoy', $q$SELECT public.dps_evento_crear('especial', 'ZZ Ev Hoy', pg_temp.h(0), NULL)::text$q$);
SELECT pg_temp.put('ev_hoy2', $q$SELECT public.dps_evento_crear('especial', 'ZZ Ev Hoy Dos', pg_temp.h(0), NULL)::text$q$);
SELECT pg_temp.put('cv_hoy', $q$SELECT public.dps_convocar(pg_temp.dia('ev_hoy', 0), pg_temp.ctx('puesto')::uuid, pg_temp.id('se', 2))::text$q$);
SELECT pg_temp.assert_eq('c6: attendance is marked on today''s event',
  $q$SELECT public.dps_asistencia_marcar(pg_temp.dia('ev_hoy', 0), ARRAY[pg_temp.id('us', 2)], 'llego') ->> 'cambiados'$q$, '1');
SELECT pg_temp.assert_eq('c6b: and the plan JSON says so',
  $q$SELECT public.dps_plan_json(pg_temp.dia('ev_hoy', 0)) ->> 'con_asistencia'$q$, 'true');

SELECT pg_temp.assert_raises('c7: a regular Sunday does not move',
  $q$SELECT public.dps_plan_mover(pg_temp.plan('domingo'), pg_temp.h(250))$q$, '22023', 'plan_domingo');
SELECT pg_temp.assert_raises('c8: a plan dated before today does not move',
  $q$SELECT public.dps_plan_mover(pg_temp.plan('ayer'), pg_temp.h(250))$q$, '22023', 'plan_pasado');
SELECT pg_temp.assert_raises('c9: nor to a date before today',
  $q$SELECT public.dps_plan_mover(pg_temp.dia('ev1', 0), pg_temp.h(-1))$q$, '22023', 'fecha_pasada');
SELECT pg_temp.assert_raises('c10: a plan with attendance does not move',
  $q$SELECT public.dps_plan_mover(pg_temp.dia('ev_hoy', 0), pg_temp.h(250))$q$, '22023', 'plan_con_asistencia');
SELECT pg_temp.assert_raises('c11: a clash with a plan of the same date, tipo and título',
  $q$SELECT public.dps_plan_mover(pg_temp.dia('ev3', 1), pg_temp.h(205))$q$, '22023', 'plan_duplicado');
SELECT pg_temp.assert_raises('c12: an unknown plan',
  $q$SELECT public.dps_plan_mover(gen_random_uuid(), pg_temp.h(250))$q$, '22023', 'plan_invalido');
SELECT pg_temp.assert_raises('c13: a NULL date',
  $q$SELECT public.dps_plan_mover(pg_temp.dia('ev1', 0), NULL)$q$, '22023', 'fecha_invalida');
SELECT pg_temp.assert_eq('c14: the refused moves left every date as it was',
  $q$SELECT pg_temp.off(pg_temp.plan('ayer')) || ',' || pg_temp.off(pg_temp.dia('ev1', 0)) || ',' || pg_temp.off(pg_temp.dia('ev_hoy', 0))
            || ',' || pg_temp.off(pg_temp.dia('ev3', 1)) || ',' || (pg_temp.off(pg_temp.plan('domingo'))::int BETWEEN 200 AND 206)$q$,
  '-1,210,0,203,true');
SELECT pg_temp.assert_eq('c15: a plan of today without attendance moves to the future',
  $q$SELECT ((public.dps_plan_mover(pg_temp.dia('ev_hoy2', 0), pg_temp.h(212)) ->> 'fecha')::date - pg_temp.ctx('hoy')::date)::text$q$, '212');
SELECT pg_temp.assert_eq('c16: there the automatic director syncs as on any plan from today on',
  $q$SELECT (public.dps_plan_equipos(pg_temp.dia('ev_hoy2', 0)) IS NOT NULL)::text$q$, 'true');
SELECT pg_temp.assert_eq('c16b: the director of ZZ Ev Alfa is convocado automatico',
  $q$SELECT count(*)::text FROM public.dps_convocados c
      WHERE c.plan_id = pg_temp.dia('ev_hoy2', 0) AND c.automatico AND c.persona_id = pg_temp.id('us', 3)$q$, '1');

-- ── d. dps_plan_eliminar ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('d1: deleting a one-day event, its convocados go with it',
  $q$SELECT public.dps_plan_eliminar(pg_temp.dia('ev1', 0), false)::text$q$, '1');
SELECT pg_temp.assert_eq('d1b: the plan and its convocados are gone',
  $q$SELECT pg_temp.off(pg_temp.dia('ev1', 0)) || '|' || (SELECT count(*) FROM public.dps_convocados c WHERE c.id = pg_temp.ctx('cv1')::uuid)$q$, '-|0');
SELECT pg_temp.assert_eq('d2: deleting one day of the three-day event',
  $q$SELECT public.dps_plan_eliminar(pg_temp.dia('ev3', 1), false)::text$q$, '1');
SELECT pg_temp.assert_eq('d2b: the other two renumber',
  $q$SELECT pg_temp.rango(202, 205, 'ZZ Ev Conferencia')$q$, '204:1/2,205:2/2');
SELECT pg_temp.assert_eq('d3: deleting the whole event from one of its days',
  $q$SELECT public.dps_plan_eliminar(pg_temp.dia('ev3', 2), true)::text || '|' || pg_temp.rango(202, 205, 'ZZ Ev Conferencia')$q$, '2|');
SELECT pg_temp.put('cena', $q$SELECT public.dps_plan_crear(pg_temp.h(214), 'cena_del_senor', NULL)::text$q$);
SELECT pg_temp.assert_eq('d4: a Cena del Señor made by dps_plan_crear',
  $q$SELECT public.dps_plan_eliminar(pg_temp.plan('cena'), false)::text$q$, '1');
SELECT pg_temp.assert_eq('d4b: gone', $q$SELECT pg_temp.off(pg_temp.plan('cena'))$q$, '-');
SELECT pg_temp.assert_raises('d5: a regular Sunday is not deleted',
  $q$SELECT public.dps_plan_eliminar(pg_temp.plan('domingo'), false)$q$, '22023', 'plan_domingo');
SELECT pg_temp.assert_raises('d6: a plan with attendance is not deleted',
  $q$SELECT public.dps_plan_eliminar(pg_temp.dia('ev_hoy', 0), false)$q$, '22023', 'plan_con_asistencia');
SELECT pg_temp.assert_eq('d6b: the plan and its attendance stay',
  $q$SELECT pg_temp.off(pg_temp.dia('ev_hoy', 0)) || '|' || (SELECT string_agg(a.estado, ',') FROM public.dps_asistencias a WHERE a.plan_id = pg_temp.dia('ev_hoy', 0))$q$,
  '0|llego');
SELECT pg_temp.put('ev2', $q$SELECT public.dps_evento_crear('especial', 'ZZ Ev Retiro', pg_temp.h(0), pg_temp.h(1))::text$q$);
SELECT pg_temp.put('cv_ev2', $q$SELECT public.dps_convocar(pg_temp.dia('ev2', 0), pg_temp.ctx('puesto')::uuid, pg_temp.id('se', 2))::text$q$);
SELECT pg_temp.put('mk_ev2', $q$SELECT public.dps_asistencia_marcar(pg_temp.dia('ev2', 0), ARRAY[pg_temp.id('us', 2)], 'llego') ->> 'cambiados'$q$);
SELECT pg_temp.assert_raises('d7: the whole event is not deleted when one day has attendance',
  $q$SELECT public.dps_plan_eliminar(pg_temp.dia('ev2', 1), true)$q$, '22023', 'plan_con_asistencia');
SELECT pg_temp.assert_eq('d7b: nothing was deleted',
  $q$SELECT pg_temp.off(pg_temp.dia('ev2', 0)) || ',' || pg_temp.off(pg_temp.dia('ev2', 1))$q$, '0,1');
SELECT pg_temp.assert_eq('d7c: its day without attendance can still go alone',
  $q$SELECT public.dps_plan_eliminar(pg_temp.dia('ev2', 1), false)::text$q$, '1');
SELECT pg_temp.assert_raises('d8: an unknown plan',
  $q$SELECT public.dps_plan_eliminar(gen_random_uuid(), false)$q$, '22023', 'plan_invalido');

-- ── e. authority ─────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('e0: the servidor sees DPS', $q$SELECT public.dps_puede_ver()::text$q$, 'true');
SELECT pg_temp.assert_raises('e1: a servidor cannot create an event',
  $q$SELECT public.dps_evento_crear('especial', 'ZZ Ev Serv', pg_temp.h(260), NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e1: nor move a plan',
  $q$SELECT public.dps_plan_mover(pg_temp.dia('ev_hoy2', 0), pg_temp.h(261))$q$, '42501', 'sin_autoridad');
SELECT pg_temp.assert_raises('e1: nor delete one',
  $q$SELECT public.dps_plan_eliminar(pg_temp.dia('ev_hoy2', 0), false)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.as_persona(4);
SELECT pg_temp.assert_raises('e2: a random user cannot either',
  $q$SELECT public.dps_evento_crear('especial', 'ZZ Ev Random', pg_temp.h(260), NULL)$q$, '42501', 'sin_autoridad');
SELECT pg_temp.nobody();
SELECT pg_temp.assert_raises('e3: nor a caller without a session',
  $q$SELECT public.dps_plan_eliminar(pg_temp.dia('ev_hoy2', 0), false)$q$, '42501', 'sin_autoridad');
RESET ROLE;
SELECT pg_temp.assert_eq('e4: the refused calls changed nothing',
  $q$SELECT pg_temp.off(pg_temp.dia('ev_hoy2', 0)) || '|' || (SELECT count(*) FROM public.dps_planes p WHERE p.titulo IN ('ZZ Ev Serv', 'ZZ Ev Random'))$q$,
  '212|0');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_de_failures);
END;
$$;
